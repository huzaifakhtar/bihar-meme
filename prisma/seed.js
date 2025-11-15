const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  // ensure global counter exists
  await prisma.globalStat.upsert({
    where: { key: 'slaps' },
    update: {},
    create: { key: 'slaps', count: 0 },
  })

  const global = await prisma.globalStat.findUnique({ where: { key: 'slaps' } })
  console.log('Global slaps:', global?.count ?? 0)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
