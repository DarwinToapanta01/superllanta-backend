const jwt = require('jsonwebtoken')

// Verifica que el token JWT sea válido
const verificarToken = (req, res, next) => {
  const authHeader = req.headers['authorization']
  const token = authHeader && authHeader.split(' ')[1] // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ error: 'Token requerido' })
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET)
    req.usuario = decoded
    next()
  } catch (err) {
    return res.status(401).json({ error: 'Token inválido o expirado' })
  }
}

// Solo permite el acceso al administrador
const soloAdmin = (req, res, next) => {
  if (req.usuario?.rol !== 'administrador') {
    return res.status(403).json({ error: 'Acceso denegado. Solo administradores.' })
  }
  next()
}

// Permite tanto administrador como técnico
const autenticado = (req, res, next) => {
  if (!req.usuario) {
    return res.status(403).json({ error: 'Acceso denegado.' })
  }
  next()
}

module.exports = { verificarToken, soloAdmin, autenticado }
