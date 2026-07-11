import { PrismaClient } from '@prisma/client'
import { hashPassword } from '../lib/auth'

const prisma = new PrismaClient()

const DEVELOPMENT_ACCOUNT = {
  username: 'admin',
  password: 'admin123',
  name: '开发管理员',
} as const

const username = process.env.DEV_ADMIN_USERNAME || DEVELOPMENT_ACCOUNT.username
const password = process.env.DEV_ADMIN_PASSWORD || DEVELOPMENT_ACCOUNT.password
const name = process.env.DEV_ADMIN_NAME || DEVELOPMENT_ACCOUNT.name

async function main() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('开发管理员初始化脚本禁止在生产环境执行')
  }

  const operator = await prisma.operator.upsert({
    where: { username },
    create: {
      username,
      passwordHash: hashPassword(password),
      name,
      role: 'ADMIN',
      status: 'ACTIVE',
      approvedAt: new Date(),
    },
    update: {
      passwordHash: hashPassword(password),
      name,
      role: 'ADMIN',
      status: 'ACTIVE',
      approvedAt: new Date(),
    },
    select: {
      username: true,
      name: true,
      role: true,
      status: true,
    },
  })

  await prisma.operatorSession.deleteMany({
    where: { operator: { username } },
  })

  console.log(`dev admin ready: ${operator.username}`)
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
