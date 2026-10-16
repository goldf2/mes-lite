import { randomUUID } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import { MES_AUTH_RUNTIME_KEY, readLoginConfiguration, type LoginMode } from '../domain/casdoor-runtime'

type RuntimeState = { mode: LoginMode; fingerprint: string; generation: string; legacyAllowed: boolean }
let runtimeUpdates: Promise<unknown> = Promise.resolve()
/** Only fingerprints and revocable generations are persisted; no client secret or tokens. */
export function ensureAuthenticationRuntime() {
  const operation = runtimeUpdates.then(async () => {
    const config = readLoginConfiguration()
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const state = await prisma.$transaction(async tx => {
          const row = await tx.systemSetting.findUnique({ where: { key: MES_AUTH_RUNTIME_KEY } })
          let previous: RuntimeState | null = null
          if (row) {
            try { previous = JSON.parse(row.value) } catch { throw new Error('AUTH_RUNTIME_INVALID') }
            if (!previous || !['builtin', 'casdoor', 'invalid'].includes(previous.mode)
              || typeof previous.generation !== 'string' || typeof previous.fingerprint !== 'string'
              || typeof previous.legacyAllowed !== 'boolean') throw new Error('AUTH_RUNTIME_INVALID')
          }
          if (previous?.fingerprint === config.fingerprint && previous.mode === config.mode) return previous
          const next: RuntimeState = {
            mode: config.mode, fingerprint: config.fingerprint, generation: randomUUID(),
            legacyAllowed: previous ? false : config.mode === 'builtin',
          }
          if (row) {
            const result = await tx.systemSetting.updateMany({ where: { key: MES_AUTH_RUNTIME_KEY, value: row.value }, data: { value: JSON.stringify(next) } })
            if (result.count !== 1) throw new Error('AUTH_RUNTIME_RETRY')
          } else await tx.systemSetting.create({ data: { key: MES_AUTH_RUNTIME_KEY, value: JSON.stringify(next) } })
          // Explicit recovery sessions still have to pass current ACTIVE + ADMIN on every request.
          if (previous && previous.mode !== config.mode) await tx.operatorSession.deleteMany({ where: { authSource: { not: 'native-admin-recovery' } } })
          else if (previous || config.mode !== 'builtin') await tx.operatorSession.deleteMany({ where: { authSource: 'casdoor' } })
          await tx.operatorLoginChallenge.deleteMany({})
          return next
        })
        return { ...config, state }
      } catch (error) {
        const code = error && typeof error === 'object' && 'code' in error ? error.code : ''
        if (attempt === 2 || (!['P2002', 'P2034', 'P2028'].includes(String(code)) && !(error instanceof Error && error.message === 'AUTH_RUNTIME_RETRY'))) throw error
      }
    }
    throw new Error('AUTH_RUNTIME_UNAVAILABLE')
  })
  runtimeUpdates = operation.then(() => undefined, () => undefined)
  return operation
}
