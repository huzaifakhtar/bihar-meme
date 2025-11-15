import Redis from 'ioredis'

declare global {
  // eslint-disable-next-line no-var
  var _redisClient: Redis | undefined
}

const url = process.env.REDIS_URL || ''

export function getRedis() {
  if (!url) throw new Error('REDIS_URL not set')
  if (global._redisClient) return global._redisClient
  const client = new Redis(url)
  global._redisClient = client
  return client
}
