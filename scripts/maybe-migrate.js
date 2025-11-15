#!/usr/bin/env node
const { execSync } = require('child_process')

const db = process.env.DATABASE_URL || process.env.DATABASE || ''
if (!db) {
  console.log('No DATABASE_URL found — skipping prisma migrate deploy')
  process.exit(0)
}

try {
  console.log('DATABASE_URL found — running prisma migrate deploy')
  execSync('npx prisma migrate deploy', { stdio: 'inherit' })
  console.log('Prisma migrate deploy completed')
} catch (err) {
  console.error('Prisma migrate deploy failed:', err)
  process.exit(1)
}
