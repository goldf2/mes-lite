import { prisma } from '../lib/prisma'
import { getModelConvergenceAudit } from '../modules/operations-tools/server/model-convergence-audit-service'

async function main() {
  const audit = await getModelConvergenceAudit(prisma)
  console.log(JSON.stringify(audit, null, 2))
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
