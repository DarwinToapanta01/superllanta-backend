const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const prisma = require('../utils/prisma')

// POST /api/auth/login
const login = async (req, res) => {
  try {
    const { correo, contrasena } = req.body

    if (!correo || !contrasena) {
      return res.status(400).json({ error: 'Correo y contraseña son requeridos' })
    }

    // Buscar usuario con su rol
    const usuario = await prisma.usuario.findUnique({
      where: { correo },
      include: { rol: true }
    })

    if (!usuario) {
      return res.status(401).json({ error: 'Credenciales incorrectas' })
    }

    if (!usuario.estado) {
      return res.status(401).json({ error: 'Usuario inactivo. Contacta al administrador.' })
    }

    const passwordValido = await bcrypt.compare(contrasena, usuario.contrasena)
    if (!passwordValido) {
      return res.status(401).json({ error: 'Credenciales incorrectas' })
    }

    // Generar token JWT
    const token = jwt.sign(
      {
        id: usuario.id_usuario,
        correo: usuario.correo,
        nombre: usuario.nombre,
        rol: usuario.rol.nombre
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
    )

    // Registrar log de acceso
    await prisma.log.create({
      data: {
        id_usuario: usuario.id_usuario,
        accion: 'LOGIN',
        tabla: 'usuarios',
        id_registro: usuario.id_usuario
      }
    })

    res.json({
      token,
      usuario: {
        id: usuario.id_usuario,
        nombre: usuario.nombre,
        apellido: usuario.apellido,
        correo: usuario.correo,
        rol: usuario.rol.nombre
      }
    })
  } catch (err) {
    console.error('Error en login:', err)
    res.status(500).json({ error: 'Error interno del servidor' })
  }
}

// GET /api/auth/me
const perfil = async (req, res) => {
  try {
    const usuario = await prisma.usuario.findUnique({
      where: { id_usuario: req.usuario.id },
      include: { rol: true }
    })
    const { contrasena, ...resultado } = usuario
    res.json(resultado)
  } catch (err) {
    res.status(500).json({ error: 'Error interno del servidor' })
  }
}

module.exports = { login, perfil }
