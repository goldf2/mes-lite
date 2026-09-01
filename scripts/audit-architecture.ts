import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import ts from 'typescript'

const root = process.cwd()
const baselinePath = path.join(root, 'docs', 'architecture', 'code-architecture-baseline.json')
const sourcePattern = /\.(?:ts|tsx)$/
const uiWarningLines = 600
const coreWarningLines = 700
const minimumCloneCharacters = 350
const minimumCloneLines = 8

type CloneOccurrence = {
  file: string
  line: number
  lines: number
  exactSignature: string
}

type CloneGroup = {
  occurrences: CloneOccurrence[]
  excessLines: number
}

type ArchitectureBaseline = {
  schemaVersion: 1
  limits: {
    deepCrossModuleImports: number
    crossModuleEdges: number
    routeDirectPrisma: number
    uiDirectFetch: number
    pagesOver800: number
    routesOver300: number
    exactCloneExcessLines: number
    structuralCloneExcessLines: number
    productMaterialDualModels: number
  }
  allowedModuleCycleGroups: string[]
  allowedBidirectionalPairs: string[]
  largeUiFileLineBudgets: Record<string, number>
  largeCoreFileLineBudgets: Record<string, number>
}

function projectPath(file: string) {
  return file.split(path.sep).join('/')
}

function read(file: string) {
  return readFileSync(path.join(root, file), 'utf8')
}

function lineCount(source: string) {
  return source.length === 0 ? 0 : source.split('\n').length - (source.endsWith('\n') ? 1 : 0)
}

function sourceFiles(...scopes: string[]) {
  function walk(directory: string): string[] {
    if (!existsSync(directory)) return []
    return readdirSync(directory).flatMap((name) => {
      const target = path.join(directory, name)
      return statSync(target).isDirectory() ? walk(target) : [projectPath(path.relative(root, target))]
    })
  }

  return scopes.flatMap((scope) => walk(path.join(root, scope)))
    .filter((file) => sourcePattern.test(file) && !file.endsWith('.d.ts'))
}

function sourceFileFor(file: string, source: string) {
  return ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  )
}

function structuralFingerprint(node: ts.Node): string {
  if (ts.isIdentifier(node)) return 'Identifier'
  if (ts.isStringLiteralLike(node)) return 'StringLiteral'
  if (ts.isNumericLiteral(node)) return 'NumericLiteral'
  if (node.kind === ts.SyntaxKind.TrueKeyword || node.kind === ts.SyntaxKind.FalseKeyword) return 'BooleanLiteral'

  const children: string[] = []
  node.forEachChild((child) => {
    children.push(structuralFingerprint(child))
  })
  return `${ts.SyntaxKind[node.kind]}(${children.join(',')})`
}

function cloneGroups(files: string[]) {
  const exact = new Map<string, CloneOccurrence[]>()
  const structural = new Map<string, CloneOccurrence[]>()

  for (const file of files) {
    const source = read(file)
    const sourceFile = sourceFileFor(file, source)

    const visit = (node: ts.Node): void => {
      const body = ts.isFunctionLike(node)
        ? (node as ts.FunctionLikeDeclaration & { body?: ts.ConciseBody }).body
        : undefined
      if (body) {
        const bodyText = body.getText(sourceFile)
        const startLine = sourceFile.getLineAndCharacterOfPosition(body.getStart(sourceFile)).line + 1
        const endLine = sourceFile.getLineAndCharacterOfPosition(body.end).line + 1
        const lines = endLine - startLine + 1

        if (bodyText.length >= minimumCloneCharacters && lines >= minimumCloneLines) {
          const exactSignature = bodyText.replace(/\s+/g, ' ').trim()
          const occurrence = { file, line: startLine, lines, exactSignature }
          const structuralSignature = structuralFingerprint(body)
          exact.set(exactSignature, [...(exact.get(exactSignature) || []), occurrence])
          structural.set(structuralSignature, [...(structural.get(structuralSignature) || []), occurrence])
        }
      }
      ts.forEachChild(node, visit)
    }

    visit(sourceFile)
  }

  function normalizeGroups(groups: Map<string, CloneOccurrence[]>, excludeExact: boolean) {
    return Array.from(groups.values())
      .map((occurrences) => {
        const firstByFile = new Map<string, CloneOccurrence>()
        for (const occurrence of occurrences) {
          if (!firstByFile.has(occurrence.file)) firstByFile.set(occurrence.file, occurrence)
        }
        return Array.from(firstByFile.values())
      })
      .filter((occurrences) => occurrences.length > 1)
      .filter((occurrences) => !excludeExact || new Set(occurrences.map((item) => item.exactSignature)).size > 1)
      .map((occurrences): CloneGroup => ({
        occurrences,
        excessLines: occurrences.reduce((total, item) => total + item.lines, 0)
          - Math.max(...occurrences.map((item) => item.lines)),
      }))
      .sort((left, right) => right.excessLines - left.excessLines)
  }

  return {
    exact: normalizeGroups(exact, false),
    structural: normalizeGroups(structural, true),
  }
}

function stronglyConnectedComponents(nodes: string[], edges: Map<string, Set<string>>) {
  let nextIndex = 0
  const indexes = new Map<string, number>()
  const lowLinks = new Map<string, number>()
  const stack: string[] = []
  const onStack = new Set<string>()
  const components: string[][] = []

  function visit(node: string) {
    indexes.set(node, nextIndex)
    lowLinks.set(node, nextIndex)
    nextIndex += 1
    stack.push(node)
    onStack.add(node)

    for (const target of Array.from(edges.get(node) || [])) {
      if (!indexes.has(target)) {
        visit(target)
        lowLinks.set(node, Math.min(lowLinks.get(node)!, lowLinks.get(target)!))
      } else if (onStack.has(target)) {
        lowLinks.set(node, Math.min(lowLinks.get(node)!, indexes.get(target)!))
      }
    }

    if (lowLinks.get(node) === indexes.get(node)) {
      const component: string[] = []
      let member = ''
      do {
        member = stack.pop()!
        onStack.delete(member)
        component.push(member)
      } while (member !== node)
      components.push(component.sort())
    }
  }

  for (const node of nodes) if (!indexes.has(node)) visit(node)
  return components.filter((component) => component.length > 1).sort((a, b) => a.join().localeCompare(b.join()))
}

function collectSnapshot() {
  const files = sourceFiles('app', 'modules', 'lib')
  const sources = new Map(files.map((file) => [file, read(file)]))
  const lineEntries = files.map((file) => ({ file, lines: lineCount(sources.get(file)!) }))
  const moduleNames = Array.from(new Set(files.filter((file) => file.startsWith('modules/')).map((file) => file.split('/')[1]))).sort()
  const moduleEdges = new Map(moduleNames.map((name) => [name, new Set<string>()]))
  let deepCrossModuleImports = 0

  for (const file of files.filter((item) => item.startsWith('modules/'))) {
    const sourceModule = file.split('/')[1]
    const importPattern = /(?:from\s+|import\s*\()(['"])@\/modules\/([^/'"]+)(\/[^'"]+)?\1/g
    for (const match of Array.from(sources.get(file)!.matchAll(importPattern))) {
      const targetModule = match[2]
      if (targetModule === sourceModule) continue
      moduleEdges.get(sourceModule)?.add(targetModule)
      if (match[3]) deepCrossModuleImports += 1
    }
  }

  const routeFiles = files.filter((file) => file.startsWith('app/api/') && file.endsWith('/route.ts'))
  const uiFiles = files.filter((file) => (
    (file.startsWith('app/') && !file.startsWith('app/api/'))
    || /modules\/[^/]+\/ui\//.test(file)
  ))
  const pageFiles = files.filter((file) => file === 'app/page.tsx' || /(?:Page|PageModule)\.tsx$/.test(file))
  const coreFiles = lineEntries.filter(({ file }) => /modules\/[^/]+\/server\//.test(file) || file.startsWith('lib/'))
  const largeUiFiles = lineEntries
    .filter(({ file, lines }) => uiFiles.includes(file) && lines > uiWarningLines)
    .sort((left, right) => right.lines - left.lines)
  const largeCoreFiles = coreFiles.filter(({ lines }) => lines > coreWarningLines).sort((left, right) => right.lines - left.lines)
  const clones = cloneGroups(files)
  const prismaSchema = read('prisma/schema.prisma')
  const prismaModels = Array.from(prismaSchema.matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm))
  const dualModels = prismaModels
    .filter((match) => /^\s*productId\s+/m.test(match[2]) && /^\s*materialId\s+/m.test(match[2]))
    .map((match) => match[1])

  const moduleLines = moduleNames.map((name) => ({
    name,
    files: lineEntries.filter(({ file }) => file.startsWith(`modules/${name}/`)).length,
    lines: lineEntries.filter(({ file }) => file.startsWith(`modules/${name}/`)).reduce((total, item) => total + item.lines, 0),
  })).sort((left, right) => right.lines - left.lines)
  const cycleGroups = stronglyConnectedComponents(moduleNames, moduleEdges).map((group) => group.join('<->'))
  const crossModuleEdges = Array.from(moduleEdges.values()).reduce((total, targets) => total + targets.size, 0)
  const bidirectionalPairs = moduleNames.flatMap((source) => Array.from(moduleEdges.get(source) || [])
    .filter((target) => source < target && moduleEdges.get(target)?.has(source))
    .map((target) => `${source}<->${target}`))
  const summarizeCloneGroup = (group: CloneGroup) => ({
    excessLines: group.excessLines,
    occurrences: group.occurrences.map(({ file, line, lines }) => ({ file, line, lines })),
  })

  return {
    schemaVersion: 1,
    source: {
      version: JSON.parse(read('package.json')).version as string,
      commit: execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
    },
    totals: {
      sourceFiles: files.length,
      sourceLines: lineEntries.reduce((total, item) => total + item.lines, 0),
      modules: moduleNames.length,
      routes: routeFiles.length,
      prismaModels: prismaModels.length,
    },
    areas: ['app', 'modules', 'lib'].map((area) => ({
      name: area,
      files: lineEntries.filter(({ file }) => file.startsWith(`${area}/`)).length,
      lines: lineEntries.filter(({ file }) => file.startsWith(`${area}/`)).reduce((total, item) => total + item.lines, 0),
    })),
    moduleLines,
    boundaries: {
      deepCrossModuleImports,
      crossModuleEdges,
      moduleCycleGroups: cycleGroups,
      bidirectionalPairs,
      routeDirectPrisma: routeFiles.filter((file) => /@\/lib\/prisma|\bprisma\s*\.|\$transaction/.test(sources.get(file)!)).length,
      uiDirectFetch: uiFiles.filter((file) => /\bfetch\s*\(/.test(sources.get(file)!)).length,
    },
    sizes: {
      pagesOver800: pageFiles.filter((file) => lineCount(sources.get(file)!) > 800).length,
      routesOver300: routeFiles.filter((file) => lineCount(sources.get(file)!) > 300).length,
      largeUiFiles,
      largeCoreFiles,
      largestFiles: [...lineEntries].sort((left, right) => right.lines - left.lines).slice(0, 15),
    },
    redundancy: {
      exactGroups: clones.exact.length,
      exactExcessLines: clones.exact.reduce((total, group) => total + group.excessLines, 0),
      structuralGroups: clones.structural.length,
      structuralExcessLines: clones.structural.reduce((total, group) => total + group.excessLines, 0),
      topExactGroups: clones.exact.slice(0, 5).map(summarizeCloneGroup),
      topStructuralGroups: clones.structural.slice(0, 5).map(summarizeCloneGroup),
    },
    modelConvergence: {
      productMaterialDualModels: dualModels,
    },
  }
}

function verifyBaseline(snapshot: ReturnType<typeof collectSnapshot>) {
  const baseline = JSON.parse(readFileSync(baselinePath, 'utf8')) as ArchitectureBaseline
  const failures: string[] = []

  function atMost(actual: number, limit: number, label: string) {
    if (actual > limit) failures.push(`${label} 从基线 ${limit} 增长为 ${actual}`)
  }

  atMost(snapshot.boundaries.deepCrossModuleImports, baseline.limits.deepCrossModuleImports, '跨模块内部路径导入')
  atMost(snapshot.boundaries.crossModuleEdges, baseline.limits.crossModuleEdges, '跨模块依赖边')
  atMost(snapshot.boundaries.routeDirectPrisma, baseline.limits.routeDirectPrisma, 'Route Handler 直连 Prisma')
  atMost(snapshot.boundaries.uiDirectFetch, baseline.limits.uiDirectFetch, 'UI 直接 fetch')
  atMost(snapshot.sizes.pagesOver800, baseline.limits.pagesOver800, '超过 800 行的页面')
  atMost(snapshot.sizes.routesOver300, baseline.limits.routesOver300, '超过 300 行的路由')
  atMost(snapshot.redundancy.exactExcessLines, baseline.limits.exactCloneExcessLines, '精确克隆冗余行')
  atMost(snapshot.redundancy.structuralExcessLines, baseline.limits.structuralCloneExcessLines, '结构克隆冗余行')
  atMost(
    snapshot.modelConvergence.productMaterialDualModels.length,
    baseline.limits.productMaterialDualModels,
    'Product/Material 双轨模型',
  )

  for (const cycle of snapshot.boundaries.moduleCycleGroups) {
    const cycleMembers = cycle.split('<->')
    const belongsToExistingComponent = baseline.allowedModuleCycleGroups.some((allowedCycle) => {
      const allowedMembers = new Set(allowedCycle.split('<->'))
      return cycleMembers.every((member) => allowedMembers.has(member))
    })
    if (!belongsToExistingComponent) failures.push(`出现新的模块依赖环：${cycle}`)
  }
  for (const pair of snapshot.boundaries.bidirectionalPairs) {
    if (!baseline.allowedBidirectionalPairs.includes(pair)) failures.push(`出现新的模块直接双向依赖：${pair}`)
  }

  for (const item of snapshot.sizes.largeUiFiles) {
    const budget = baseline.largeUiFileLineBudgets[item.file]
    if (budget === undefined) failures.push(`新增超过 ${uiWarningLines} 行的 UI 文件：${item.file}（${item.lines} 行）`)
    else if (item.lines > budget) failures.push(`${item.file} 从 ${budget} 行增长为 ${item.lines} 行`)
  }

  for (const item of snapshot.sizes.largeCoreFiles) {
    const budget = baseline.largeCoreFileLineBudgets[item.file]
    if (budget === undefined) failures.push(`新增超过 ${coreWarningLines} 行的核心文件：${item.file}（${item.lines} 行）`)
    else if (item.lines > budget) failures.push(`${item.file} 从 ${budget} 行增长为 ${item.lines} 行`)
  }

  if (failures.length > 0) throw new Error(`架构量化基线回退：\n- ${failures.join('\n- ')}`)
  console.log('架构量化基线通过：跨层违规、依赖环、巨型文件、代码克隆和双轨模型均未超过当前预算。')
}

function printSummary(snapshot: ReturnType<typeof collectSnapshot>) {
  console.log(`MES-lite 架构快照：v${snapshot.source.version} / ${snapshot.source.commit}`)
  console.log(`源码：${snapshot.totals.sourceFiles} 个文件，${snapshot.totals.sourceLines} 行；${snapshot.totals.modules} 个模块，${snapshot.totals.routes} 条 API，${snapshot.totals.prismaModels} 个模型。`)
  console.log(`边界：${snapshot.boundaries.deepCrossModuleImports} 个深层跨模块导入，${snapshot.boundaries.crossModuleEdges} 条跨模块依赖边，${snapshot.boundaries.moduleCycleGroups.length} 个循环依赖分量（${snapshot.boundaries.bidirectionalPairs.length} 组直接双向依赖），${snapshot.boundaries.routeDirectPrisma} 条路由直连 Prisma，${snapshot.boundaries.uiDirectFetch} 个 UI 直接 fetch。`)
  console.log(`规模：${snapshot.sizes.largeUiFiles.length} 个 UI 文件超过 ${uiWarningLines} 行，${snapshot.sizes.largeCoreFiles.length} 个核心文件超过 ${coreWarningLines} 行。`)
  console.log(`冗余：${snapshot.redundancy.exactGroups} 组精确克隆 / ${snapshot.redundancy.exactExcessLines} 行，${snapshot.redundancy.structuralGroups} 组结构克隆 / ${snapshot.redundancy.structuralExcessLines} 行。`)
  console.log(`兼容双轨：${snapshot.modelConvergence.productMaterialDualModels.length} 个模型同时保留 productId 与 materialId。`)

  if (snapshot.boundaries.moduleCycleGroups.length > 0) {
    console.log(`依赖环：${snapshot.boundaries.moduleCycleGroups.join('；')}`)
  }
  console.log(`最大文件：${snapshot.sizes.largestFiles.slice(0, 5).map((item) => `${item.file} ${item.lines} 行`).join('；')}`)
}

const snapshot = collectSnapshot()
const jsonOutput = process.argv.includes('--json')
const check = process.argv.includes('--check')

if (jsonOutput) console.log(JSON.stringify(snapshot, null, 2))
else printSummary(snapshot)
if (check) verifyBaseline(snapshot)
