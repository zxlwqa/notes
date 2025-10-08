import express from 'express'
import cors from 'cors'

const app = express()
app.use(cors())

// 调试接口 - 检查环境变量状态
app.get('/api/debug/env', (req, res) => {
  res.json({
    hasPassword: !!process.env.PASSWORD,
    passwordLength: process.env.PASSWORD ? process.env.PASSWORD.length : 0,
    hasDatabaseUrl: !!process.env.DATABASE_URL,
    hasWebdavUrl: !!process.env.WEBDAV_URL,
    nodeEnv: process.env.NODE_ENV
  })
})

export default app
