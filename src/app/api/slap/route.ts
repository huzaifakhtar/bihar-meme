import { NextResponse } from 'next/server'
import { prisma } from '../../../lib/prisma'
import crypto from 'crypto'
import { getMongoDb } from '../../../lib/mongo'
import { getRedis } from '../../../lib/redis'

// In-memory dedupe and simple per-IP rate limiter (prototype only).
// When REDIS_URL is configured, the code will use Redis for cross-instance
// rate-limiting and idempotency. Otherwise it falls back to in-memory maps.
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
    if (process.env.REDIS_URL) {
      try {
        const redis = getRedis()
        const key = `rate:${ipHash}`
        const cur = await redis.incr(key)
        if (cur === 1) await redis.pexpire(key, RATE_LIMIT_WINDOW)
        if (cur > RATE_LIMIT_MAX) {
          return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
        }
      } catch (e) {
        // on redis failure fall back to in-memory
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
      }
    } else {
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
    }
  } catch (e) {
    // non-fatal — continue
    try { console.warn('[/api/slap] rate limiter failed', e) } catch {}
  }

  // Idempotency: optional X-Action-ID header to dedupe repeated requests
  const actionId = req.headers.get('x-action-id')
  if (actionId) {
    if (process.env.REDIS_URL) {
      try {
        const redis = getRedis()
        const set = await redis.set(`action:${actionId}`, '1', 'PX', 60_000, 'NX')
        if (!set) {
          // duplicate — return current global
          try {
            const globalCount = await redis.get('global:slaps')
            const total = globalCount ? parseInt(globalCount, 10) : null
            return NextResponse.json({ ok: true, totalSlaps: total, duplicate: true })
          } catch (e) {
            return NextResponse.json({ ok: true, totalSlaps: null, duplicate: true })
          }
        }
      } catch (e) {
        // Redis failed — fall back to in-memory
      }
    }

    const seen = recentActionIds.get(actionId)
    if (seen) {
      // Already processed recently — return current global count without creating another event
      try {
        if (process.env.MONGODB_URI) {
          try {
            const db = await getMongoDb()
            const global = await db.collection('globalstat').findOne({ key: 'slaps' })
            return NextResponse.json({ ok: true, totalSlaps: global?.count ?? null, duplicate: true })
          } catch (e) {
            return NextResponse.json({ ok: true, totalSlaps: null, duplicate: true })
          }
        }
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
    // If Redis is configured, prefer it for fast counter increments
    if (process.env.REDIS_URL) {
      try {
        const redis = getRedis()
        // increment global counter atomically
        const total = await redis.incr('global:slaps')
        // Optionally log the event in MongoDB for audit if available
        if (process.env.MONGODB_URI) {
          try {
            const db = await getMongoDb()
            await db.collection('slapevents').insertOne({ amount: 1, ipHash, createdAt: new Date() })
          } catch (e) {
            try { console.warn('[/api/slap] failed to insert slapevent (mongo)', e) } catch {}
          }
        } else {
          // If no Mongo, we skip event logging to avoid requiring Prisma here
        }
        return NextResponse.json({ ok: true, totalSlaps: total })
      } catch (e) {
        try { console.warn('[/api/slap] redis failed, falling back', e) } catch {}
        // fall through to Prisma path
      }
    }

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
