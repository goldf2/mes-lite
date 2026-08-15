import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import ts from 'typescript'

const mutationMethods = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])
const apiRoot = path.resolve(process.cwd(), 'app/api')

const transactionalAuditRequired = new Set([
  'auth/register/route.ts#POST',
  'costs/route.ts#POST',
  'dispatches/[id]/cancel/route.ts#PATCH',
  'dispatches/[id]/complete/route.ts#PATCH',
  'dispatches/[id]/dispatch/route.ts#PATCH',
  'dispatches/[id]/start/route.ts#PATCH',
  'operators/route.ts#PATCH',
  'orders/route.ts#POST',
  'orders/[id]/cancel/route.ts#PATCH',
  'orders/[id]/reports/route.ts#POST',
  'orders/[id]/stock-in/route.ts#POST',
  'scan-count-sessions/[id]/complete/route.ts#POST',
  'scan-count-sessions/[id]/events/route.ts#POST',
  'scan-count-sessions/[id]/events/route.ts#DELETE',
])

async function listRouteFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const target = path.join(directory, entry.name)
    if (entry.isDirectory()) files.push(...await listRouteFiles(target))
    else if (entry.isFile() && entry.name === 'route.ts') files.push(target)
  }
  return files
}

function exportedMutationHandlers(source, filePath) {
  const sourceFile = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  return sourceFile.statements.flatMap((statement) => {
    const exported = statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)
    if (!exported) return []
    if (ts.isFunctionDeclaration(statement) && statement.name && statement.body) {
      const method = statement.name.text
      if (!mutationMethods.has(method)) return []
      return [{ method, body: source.slice(statement.body.pos, statement.body.end) }]
    }
    if (!ts.isVariableStatement(statement)) return []
    return statement.declarationList.declarations.flatMap((declaration) => {
      if (!ts.isIdentifier(declaration.name) || !mutationMethods.has(declaration.name.text)) return []
      const initializer = declaration.initializer
      if (!initializer || (!ts.isArrowFunction(initializer) && !ts.isFunctionExpression(initializer))) return []
      if (!ts.isBlock(initializer.body)) return []
      return [{ method: declaration.name.text, body: source.slice(initializer.body.pos, initializer.body.end) }]
    })
  })
}

const failures = []
const covered = []
const exempt = []
const routeFiles = await listRouteFiles(apiRoot)

for (const filePath of routeFiles.sort()) {
  const source = await readFile(filePath, 'utf8')
  const relativePath = path.relative(apiRoot, filePath).split(path.sep).join('/')
  for (const handler of exportedMutationHandlers(source, filePath)) {
    const key = `${relativePath}#${handler.method}`
    const exemption = handler.body.match(/audit-exempt:\s*([^\n*]+)/)
    const delegated = handler.body.match(/audit-covered-by:\s*([A-Za-z_$][\w$]*)/)
    const callsWriteAudit = /\bwriteAuditLog\s*\(/.test(handler.body)
    const passesAuditContext = /\bgetAuditContext\s*\(/.test(handler.body)
    const requiresTransactionalAudit = transactionalAuditRequired.has(key)

    if (exemption) {
      const reason = exemption[1].trim()
      if (requiresTransactionalAudit) failures.push(`${key}: 高风险命令不得使用 audit-exempt`)
      else if (reason.length < 8) failures.push(`${key}: audit-exempt 必须写明具体原因`)
      else exempt.push({ key, reason })
      continue
    }

    if (delegated) {
      const symbol = delegated[1]
      if (requiresTransactionalAudit) {
        failures.push(`${key}: 高风险命令必须显式传递 getAuditContext`)
      } else if (!new RegExp(`\\b${symbol}\\s*\\(`).test(handler.body)) {
        failures.push(`${key}: audit-covered-by 指向的 ${symbol} 未在处理器中调用`)
      } else {
        covered.push({ key, mode: `service:${symbol}` })
      }
      continue
    }

    if (!callsWriteAudit && !passesAuditContext) {
      failures.push(`${key}: 写接口既未记录审计，也没有明确 audit-exempt`)
      continue
    }

    if (requiresTransactionalAudit && !passesAuditContext) {
      failures.push(`${key}: 高风险命令必须向事务服务传递 getAuditContext`)
      continue
    }

    covered.push({ key, mode: passesAuditContext ? 'transaction-context' : 'route-log' })
  }
}

const discoveredKeys = new Set([...covered, ...exempt].map((item) => item.key))
for (const key of transactionalAuditRequired) {
  if (!discoveredKeys.has(key) && !failures.some((failure) => failure.startsWith(`${key}:`))) {
    failures.push(`${key}: 高风险命令未被发现，请核对路由路径或方法`)
  }
}

if (failures.length > 0) {
  console.error('写接口审计覆盖验证失败：')
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log(
  `写接口审计覆盖验证通过：${covered.length + exempt.length} 个写处理器，`
  + `${covered.length} 个已审计，${exempt.length} 个显式豁免，`
  + `${transactionalAuditRequired.size} 个高风险命令强制事务上下文。`,
)
