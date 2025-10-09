import { neon, neonConfig } from '@neondatabase/serverless'

neonConfig.fetchConnectionCache = true

export type Queryable = {
  (strings: TemplateStringsArray, ...values: any[]): Promise<any[]>
}

export function getDb(): Queryable {
  const databaseUrl = (globalThis as any)?.DATABASE_URL || (typeof process !== 'undefined' ? (process.env.DATABASE_URL as string | undefined) : undefined) || (typeof (globalThis as any).ENV !== 'undefined' ? (globalThis as any).ENV.DATABASE_URL : undefined)
  if (!databaseUrl) {
    throw new Error('DATABASE_URL 未设置，EdgeOne 需配置到环境变量')
  }
  return neon(databaseUrl)
}

export async function ensureTables(db: Queryable) {
  await db`CREATE TABLE IF NOT EXISTS notes (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    tags TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
  )`
  await db`CREATE TABLE IF NOT EXISTS logs (
    id SERIAL PRIMARY KEY,
    level TEXT,
    message TEXT NOT NULL,
    meta JSONB,
    created_at TIMESTAMP DEFAULT NOW()
  )`
  await db`CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_at TIMESTAMP DEFAULT NOW()
  )`
}

export async function appendLog(db: Queryable, level: string, message: string, meta?: any) {
  await db`INSERT INTO logs(level, message, meta) VALUES(${level}, ${message}, ${meta ? JSON.stringify(meta) : null})`
}


