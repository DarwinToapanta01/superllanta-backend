const jwt = require('jsonwebtoken')
const prisma = require('../utils/prisma')

const verificarToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Token requerido' })
    }
    const token = authHeader.split(' ')[1]
    const decoded = jwt.verify(token, process.env.JWT_SECRET)
    const usuario = await prisma.usuario.findUnique({
      where: { id_usuario: decoded.id },
      include: { rol: true }
    })
    if (!usuario || !usuario.estado) {
      return res.status(401).json({ error: 'Usuario no autorizado' })
    }
    req.usuario = { id: usuario.id_usuario, rol: usuario.rol.nombre }

    // Solo aplica a técnicos — administradores siempre tienen acceso
    if (usuario.rol.nombre !== 'administrador') {
      const ahora = new Date()
      const horaEcuador = new Date(ahora.getTime() - (5 * 60 * 60 * 1000))
      const dia = horaEcuador.getUTCDay()
      const hora = horaEcuador.getUTCHours()
      const minutos = horaEcuador.getUTCMinutes()
      const horaDecimal = hora + minutos / 60

      if (dia === 0 || horaDecimal < 7 || horaDecimal >= 19) {
        return res.status(403).json({
          error: 'Acceso restringido',
          mensaje: dia === 0
            ? 'El sistema no está disponible los domingos.'
            : `Acceso permitido de 07:00 a 19:00. Hora actual: ${hora.toString().padStart(2, '0')}:${minutos.toString().padStart(2, '0')}`,
          codigo: 'FUERA_HORARIO',
          horario: 'Lunes a Sábado · 07:00 — 19:00'
        })
      }
    }

    next()
  } catch (err) {
    return res.status(401).json({ error: 'Token inválido o expirado' })
  }
}

const soloAdmin = (req, res, next) => {
  if (req.usuario?.rol !== 'administrador') {
    return res.status(403).json({ error: 'Solo administradores' })
  }
  next()
}

module.exports = { verificarToken, soloAdmin }