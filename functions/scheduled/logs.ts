import type { PagesFunction, D1Database } from '../types'
import { pruneOldLogsD1, DEFAULT_LOG_RETENTION_DAYS } from '../../shared/d1-logRet.js'
import { runD1Migrations } from '../../shared/d1-migrate.js'

/** Cloudflare Pages Cron：每日清理 D1 旧日志 */
export const onSchedule: PagesFunction<{
  NOTESD?: D1Database
  LOG_RETENTION_DAYS?: string
}> = async ({ env }) => {
  const db = env.NOTESD
  if (!db) {
    return new Response(JSON.stringify({ success: false, error: 'Database not bound' }), {
      headers: { 'content-type': 'application/json' },
    })
  }

  const days = Number.parseInt(env.LOG_RETENTION_DAYS ?? '', 10) || DEFAULT_LOG_RETENTION_DAYS
  await runD1Migrations(db)
  const deleted = await pruneOldLogsD1(db, days)
  console.warn(`[cron] pruned ${deleted} log rows (retention ${days}d)`)
  return new Response(JSON.stringify({ success: true, deleted, retentionDays: days }), {
    headers: { 'content-type': 'application/json' },
  })
}
