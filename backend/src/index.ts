import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import generateRouter from './routes/generate.js'
import statusRouter from './routes/status.js'
import assetsRouter from './routes/assets.js'

const app = express()
const PORT = Number(process.env.PORT ?? 3001)

app.use(cors({ origin: ['http://localhost:5173', 'http://127.0.0.1:5173'] }))

app.use('/api/generate', generateRouter)
app.use('/api/status', statusRouter)
app.use('/api/assets', assetsRouter)

app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`)
})
