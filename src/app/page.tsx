import { prisma } from '../lib/prisma'
import SlapButton from '../components/SlapButton'

export default async function Home() {
  // Show the single global slap meter (for all Biharis).
  const global = await prisma.globalStat.findUnique({ where: { key: 'slaps' } })
  const count = global?.count ?? 0

  return (
    <main className="max-w-3xl mx-auto p-6 flex flex-col items-center gap-6">
      <div className="text-center">
  <h1 className="text-3xl font-bold mb-2">Bihari ko Bajaao</h1>
      </div>

  <SlapButton initial={count} size="large" label="Slap Hard" />
    </main>
  )
}
