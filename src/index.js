require('dotenv').config()
const express = require('express')
const cors = require('cors')
const routes = require('./routes')

const app = express()
const PORT = process.env.PORT || 3000

// ─── MIDDLEWARES ──────────────────────────────────────────────
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true
}))
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// ─── RUTAS ────────────────────────────────────────────────────
app.use('/api', routes)

// Ruta de salud del servidor
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    sistema: 'Superllanta API',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  })
})

// Ruta no encontrada
app.use((req, res) => {
  res.status(404).json({ error: `Ruta ${req.method} ${req.url} no encontrada` })
})

// Manejo global de errores
app.use((err, req, res, next) => {
  console.error('Error no manejado:', err)
  res.status(500).json({ error: 'Error interno del servidor' })
})

// ─── INICIO ───────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`
  ╔═══════════════════════════════════════╗
  ║     🔥 Superllanta API corriendo      ║
  ║     http://localhost:${PORT}            ║
  ║     Entorno: ${process.env.NODE_ENV || 'development'}            ║
  ╚═══════════════════════════════════════╝
  `)
})

module.exports = app
