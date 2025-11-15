import { MongoClient } from 'mongodb'

declare global {
  // eslint-disable-next-line no-var
  var _mongoClient: MongoClient | undefined
}

const uri = process.env.MONGODB_URI || ''
const dbName = process.env.MONGODB_DBNAME || 'bihar-meme'

export async function getMongoClient() {
  if (!uri) throw new Error('MONGODB_URI not set')
  if (global._mongoClient) return global._mongoClient
  const client = new MongoClient(uri, { maxPoolSize: 10 })
  await client.connect()
  global._mongoClient = client
  return client
}

export async function getMongoDb() {
  const client = await getMongoClient()
  return client.db(dbName)
}
