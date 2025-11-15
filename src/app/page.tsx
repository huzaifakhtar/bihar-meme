import { prisma } from '../lib/prisma'
import SlapButton from '../components/SlapButton'

// prevent SSG/prerender from calling the DB at build time on platforms without the migrated DB
export const dynamic = 'force-dynamic'

export default async function Home() {
  // Show the single global slap meter (for all Biharis).
  let count = 0
  try {
    const global = await prisma.globalStat.findUnique({ where: { key: 'slaps' } })
    count = global?.count ?? 0
  } catch (e) {
    // If the DB/table isn't present during build, fallback to 0 and continue.
    try { console.warn('[Home] prisma read failed during render, falling back to 0', e) } catch {}
    count = 0
  }

  return (
    <main className="max-w-3xl mx-auto p-6 flex flex-col items-center gap-6">
      <div className="text-center">
        <h1 className="text-3xl font-bold mb-2">Bihari ko Bajaao</h1>
      </div>

      <SlapButton initial={count} size="large" label="Slap Hard" />
    </main>
  )
}
