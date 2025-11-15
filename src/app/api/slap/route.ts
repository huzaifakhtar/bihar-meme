import { NextResponse } from 'next/server'
import { prisma } from '../../../lib/prisma'
import crypto from 'crypto'

// In-memory dedupe and simple per-IP rate limiter (prototype only).
// Note: serverless environments are ephemeral — this helps per-instance but
// isn't a global protection. For production use Redis or a managed rate-limiter.
const recentActionIds = new Map<string, number>()
const RATE_LIMIT_WINDOW = 60_000 // 1 minute
const RATE_LIMIT_MAX = 10 // max requests per window per IP
const ipBuckets = new Map<string, { count: number; reset: number }>()

export async function POST(req: Request) {
  // Best-effort JSON parse
  const _body = await req.json().catch(() => ({}))

  // Determine caller IP (best-effort) and hash it for privacy (xff is common behind proxies).
  const xff = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || ''
  const ip = xff.split(',')[0].trim() || 'unknown'
  const ipHash = crypto.createHash('sha256').update(ip).digest('hex')

  // Simple per-IP rate limiter
  try {
    const now = Date.now()
    const bucket = ipBuckets.get(ip) ?? { count: 0, reset: now + RATE_LIMIT_WINDOW }
    if (now > bucket.reset) {
      bucket.count = 0
      bucket.reset = now + RATE_LIMIT_WINDOW
    }
    bucket.count += 1
    ipBuckets.set(ip, bucket)
    if (bucket.count > RATE_LIMIT_MAX) {
      return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
    }
  } catch (e) {
    // non-fatal — continue
    try { console.warn('[/api/slap] rate limiter failed', e) } catch {}
  }

  // Idempotency: optional X-Action-ID header to dedupe repeated requests
  const actionId = req.headers.get('x-action-id')
  if (actionId) {
    const seen = recentActionIds.get(actionId)
    if (seen) {
      // Already processed recently — return current global count without creating another event
      try {
        const global = await prisma.globalStat.findUnique({ where: { key: 'slaps' } })
        return NextResponse.json({ ok: true, totalSlaps: global?.count ?? null, duplicate: true })
      } catch (e) {
        return NextResponse.json({ ok: true, totalSlaps: null, duplicate: true })
      }
    }
    // record and expire after a short window
    recentActionIds.set(actionId, Date.now())
    setTimeout(() => recentActionIds.delete(actionId), 60_000)
  }

  // Main DB work — guard errors and return proper codes when DB is unavailable
  try {
    const [event, global] = await prisma.$transaction([
      prisma.slapEvent.create({ data: { amount: 1, ipHash } }),
      prisma.globalStat.upsert({
        where: { key: 'slaps' },
        update: { count: { increment: 1 } },
        create: { key: 'slaps', count: 1 },
      }),
    ])

    return NextResponse.json({ ok: true, totalSlaps: global.count })
  } catch (err: any) {
    // Prisma-specific handling
    try {
      const code = err?.code
      // Common Prisma errors when DB/tables are missing or client not initialized.
      // P2021 = "The table does not exist", P1010 sometimes shown in some contexts.
      const msg: string = String(err?.message || '')
      if (code === 'P2021' || code === 'P1010' || msg.includes('PrismaClientInitializationError') || msg.includes('no such table') || msg.includes('does not exist')) {
        // DB or table missing — return 503 so callers can retry later
        try { console.error('[ /api/slap ] Prisma DB missing or not migrated', err) } catch {}
        return NextResponse.json({ error: 'db_unavailable' }, { status: 503 })
      }
    } catch (e) {}

    try { console.error('[ /api/slap ] unexpected error', err) } catch {}
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}
