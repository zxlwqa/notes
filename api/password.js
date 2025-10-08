import express from 'express'
import cors from 'cors'

const app = express()
app.use(cors())

app.get('/api/password/status', (req, res) => {
  res.json({ hasPassword: !!process.env.PASSWORD })
})

export default app
