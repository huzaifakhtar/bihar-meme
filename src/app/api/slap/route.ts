import { NextResponse } from 'next/server'
import { prisma } from '../../../lib/prisma'
import crypto from 'crypto'

export async function POST(req: Request) {
  try {
    // For global slaps we don't require a personId. The endpoint increments
    // a GlobalStat with key 'slaps' and records a SlapEvent.
    const _body = await req.json().catch(() => ({}))

    // Determine caller IP (best-effort) and hash it for privacy (xff is common behind proxies).
  const xff = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || ''
  const ip = xff.split(',')[0].trim() || 'unknown'
  const ipHash = crypto.createHash('sha256').update(ip).digest('hex')

    // Create a SlapEvent and increment the global counter atomically.
    const [event, global] = await prisma.$transaction([
      prisma.slapEvent.create({ data: { amount: 1, ipHash } }),
      prisma.globalStat.upsert({
        where: { key: 'slaps' },
        update: { count: { increment: 1 } },
        create: { key: 'slaps', count: 1 },
      }),
    ])

    return NextResponse.json({ ok: true, totalSlaps: global.count })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'server error' }, { status: 500 })
  }
}
