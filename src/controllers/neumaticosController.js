const prisma = require('../utils/prisma')
const QRCode = require('qrcode')

// Genera código único para el neumático
const generarCodigoQR = () => {
  const año = new Date().getFullYear()
  const aleatorio = Math.floor(Math.random() * 90000) + 10000
  return `SL-${año}-${aleatorio}`
}

// GET /api/neumaticos - Listar (tipo: taller | venta)
const listar = async (req, res) => {
  try {
    const { tipo, estado } = req.query
    const where = {}
    if (tipo) where.tipo_registro = tipo
    if (estado) where.estado = estado

    const neumaticos = await prisma.neumatico.findMany({
      where,
      include: { cliente: { select: { nombre: true, apellido: true, telefono: true } } },
      orderBy: { fecha_registro: 'desc' }
    })
    res.json(neumaticos)
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener neumáticos' })
  }
}

// GET /api/neumaticos/:id
const obtener = async (req, res) => {
  try {
    const neumatico = await prisma.neumatico.findUnique({
      where: { id_neumatico: parseInt(req.params.id) },
      include: {
        cliente: true,
        historial: {
          include: { usuario: { select: { nombre: true, apellido: true } } },
          orderBy: { fecha: 'desc' }
        }
      }
    })
    if (!neumatico) return res.status(404).json({ error: 'Neumático no encontrado' })
    res.json(neumatico)
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener neumático' })
  }
}

// GET /api/neumaticos/qr/:codigo - Hoja de vida por código QR (vista pública)
const hojaDeVida = async (req, res) => {
  try {
    const neumatico = await prisma.neumatico.findUnique({
      where: { codigo_qr: req.params.codigo },
      include: {
        cliente: { select: { nombre: true, apellido: true, telefono: true } },
        historial: {
          include: {
            usuario: { select: { nombre: true, apellido: true } }
          },
          orderBy: { fecha: 'desc' }
        }
      }
    })
    if (!neumatico) return res.status(404).json({ error: 'Neumático no encontrado' })
    res.json(neumatico)
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener hoja de vida' })
  }
}

// POST /api/neumaticos - Registrar neumático de taller + generar QR
const crearTaller = async (req, res) => {
  try {
    const { id_cliente, marca, medida, dot, estado, precio, observaciones } = req.body

    if (!id_cliente) return res.status(400).json({ error: 'El cliente es requerido' })
    if (!marca || !medida) return res.status(400).json({ error: 'Marca y medida son requeridos' })

    const codigo_qr = generarCodigoQR()

    // Generar imagen QR como base64
    const qrImageBase64 = await QRCode.toDataURL(
      `${process.env.FRONTEND_URL}/qr/${codigo_qr}`,
      { width: 300, margin: 2, color: { dark: '#1C3F6E', light: '#FFFFFF' } }
    )

    const neumatico = await prisma.neumatico.create({
      data: { id_cliente, codigo_qr, marca, medida, dot, tipo_registro: 'taller', estado: estado || 'activo', precio },
      include: { cliente: true }
    })

    // Registrar revisión inicial en historial
    await prisma.historialNeumatico.create({
      data: {
        id_neumatico: neumatico.id_neumatico,
        id_usuario: req.usuario.id,
        tipo_servicio: 'revision',
        descripcion: observaciones || `Ingreso inicial. Estado: ${estado || 'activo'}. QR generado: ${codigo_qr}`
      }
    })

    await prisma.log.create({
      data: { id_usuario: req.usuario.id, accion: 'CREAR_NEUMATICO_TALLER', tabla: 'neumaticos', id_registro: neumatico.id_neumatico }
    })

    res.status(201).json({ neumatico, qr_imagen: qrImageBase64, codigo_qr })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Error al registrar neumático' })
  }
}

// POST /api/neumaticos/venta - Registrar neumático para venta
const crearVenta = async (req, res) => {
  try {
    const { marca, medida, dot, precio, precio_compra } = req.body

    if (!marca || !medida) return res.status(400).json({ error: 'Marca y medida son requeridos' })

    const neumatico = await prisma.neumatico.create({
      data: { marca, medida, dot, tipo_registro: 'venta', estado: 'disponible', precio }
    })

    // Registrar movimiento de entrada en inventario (precio_compra como referencia)
    if (precio_compra) {
      await prisma.producto.updateMany({ where: {} }) // placeholder - la venta de neumáticos tiene su propio flujo
    }

    res.status(201).json(neumatico)
  } catch (err) {
    res.status(500).json({ error: 'Error al registrar neumático de venta' })
  }
}

// GET /api/neumaticos/:id/qr-imagen - Obtener imagen QR regenerada
const obtenerQRImagen = async (req, res) => {
  try {
    const neumatico = await prisma.neumatico.findUnique({
      where: { id_neumatico: parseInt(req.params.id) }
    })
    if (!neumatico || !neumatico.codigo_qr) {
      return res.status(404).json({ error: 'QR no encontrado' })
    }

    const qrImageBase64 = await QRCode.toDataURL(
      `${process.env.FRONTEND_URL}/qr/${neumatico.codigo_qr}`,
      { width: 300, margin: 2, color: { dark: '#1C3F6E', light: '#FFFFFF' } }
    )

    res.json({ codigo_qr: neumatico.codigo_qr, qr_imagen: qrImageBase64 })
  } catch (err) {
    res.status(500).json({ error: 'Error al generar QR' })
  }
}

module.exports = { listar, obtener, hojaDeVida, crearTaller, crearVenta, obtenerQRImagen }
