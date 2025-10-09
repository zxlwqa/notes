// 轻量数据库适配层：在 Cloudflare Pages 使用 D1，在 EdgeOne 使用 PostgreSQL

type D1Like = {
  exec: (sql: string) => Promise<any>
  prepare: (sql: string) => {
    bind: (...args: any[]) => {
      first: () => Promise<any>
      all: () => Promise<{ results: any[] }>
      run: () => Promise<any>
    }
  }
}

type PgQueryResult = { rows: any[]; rowCount: number }

let pgPool: any | null = null

function isPostgres(env: any): boolean {
  return typeof env?.DATABASE_URL === 'string' && env.DATABASE_URL.length > 0
}

async function getPgPool(env: any) {
  if (!isPostgres(env)) return null
  if (pgPool) return pgPool
  // 动态导入，避免在 Cloudflare Pages 打包时引入 pg
  const pg = await (eval('import')('pg'))
  const { Pool } = pg
  pgPool = new Pool({ connectionString: env.DATABASE_URL })
  return pgPool
}

function toPgQuery(sql: string, args: any[]): { text: string; values: any[] } {
  // 将 SQLite 风格的占位符 ? 转换为 PostgreSQL 的 $1, $2, ...
  let index = 0
  const text = sql.replace(/\?/g, () => `$${++index}`)
  return { text, values: args }
}

export function usingPostgres(env: any): boolean {
  return isPostgres(env)
}

export async function getDb(env: any): Promise<D1Like> {
  if (!isPostgres(env)) {
    // 直接返回 D1 接口
    return env.DB as D1Like
  }

  const pool = await getPgPool(env)
  if (!pool) throw new Error('PostgreSQL pool init failed')

  const db: D1Like = {
    exec: async (sql: string) => {
      const res: PgQueryResult = await pool.query(sql)
      return res
    },
    prepare: (sql: string) => ({
      bind: (...args: any[]) => {
        return {
          first: async () => {
            const q = toPgQuery(sql, args)
            const res: PgQueryResult = await pool.query(q.text, q.values)
            return res.rows[0] || null
          },
          all: async () => {
            const q = toPgQuery(sql, args)
            const res: PgQueryResult = await pool.query(q.text, q.values)
            return { results: res.rows }
          },
          run: async () => {
            const q = toPgQuery(sql, args)
            const res: PgQueryResult = await pool.query(q.text, q.values)
            return { rowCount: res.rowCount }
          },
        }
      },
    }),
  }

  return db
}

export function nowIso(): string {
  return new Date().toISOString()
}


