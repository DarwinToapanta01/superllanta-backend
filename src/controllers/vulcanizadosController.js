const prisma = require('../utils/prisma')

// GET /api/vulcanizados
const listar = async (req, res) => {
  try {
    const { estado } = req.query
    const where = estado ? { estado } : {}

    const vulcanizados = await prisma.vulcanizado.findMany({
      where,
      include: {
        cliente: { select: { nombre: true, apellido: true, telefono: true } },
        usuario: { select: { nombre: true, apellido: true } },
        detalles: { include: { neumatico: true } }
      },
      orderBy: { fecha_ingreso: 'desc' }
    })
    res.json(vulcanizados)
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener vulcanizados' })
  }
}

// GET /api/vulcanizados/:id
const obtener = async (req, res) => {
  try {
    const vulcanizado = await prisma.vulcanizado.findUnique({
      where: { id_vulcanizado: parseInt(req.params.id) },
      include: {
        cliente: true,
        usuario: { select: { nombre: true, apellido: true } },
        detalles: { include: { neumatico: true } }
      }
    })
    if (!vulcanizado) return res.status(404).json({ error: 'Vulcanizado no encontrado' })
    res.json(vulcanizado)
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener vulcanizado' })
  }
}

// POST /api/vulcanizados - Crear nueva orden
const crear = async (req, res) => {
  try {
    const { id_cliente, fecha_entrega_estimada, abono, observaciones, detalles } = req.body

    if (!id_cliente) return res.status(400).json({ error: 'El cliente es requerido' })
    if (!detalles || detalles.length === 0) return res.status(400).json({ error: 'Debe ingresar al menos un neumático' })

    // Calcular saldo total
    const total = detalles.reduce((sum, d) => sum + (parseFloat(d.precio) || 0), 0)
    const saldo = total - (parseFloat(abono) || 0)

    const vulcanizado = await prisma.vulcanizado.create({
      data: {
        id_cliente,
        id_usuario: req.usuario.id,
        fecha_entrega_estimada: fecha_entrega_estimada ? new Date(fecha_entrega_estimada) : null,
        abono: abono || 0,
        saldo: saldo >= 0 ? saldo : 0,
        estado: 'pendiente',
        observaciones,
        detalles: {
          create: detalles.map(d => ({
            id_neumatico: d.id_neumatico || null,
            marca: d.marca,
            medida: d.medida,
            dot: d.dot,
            deja_rin: d.deja_rin || false,
            descripcion: d.descripcion,
            precio: d.precio
          }))
        }
      },
      include: {
        cliente: true,
        detalles: true
      }
    })

    // Actualizar historial del neumático si tiene QR
    for (const detalle of detalles) {
      if (detalle.id_neumatico) {
        await prisma.historialNeumatico.create({
          data: {
            id_neumatico: detalle.id_neumatico,
            id_usuario: req.usuario.id,
            tipo_servicio: 'vulcanizado',
            descripcion: `Ingresado a vulcanizado. ${detalle.descripcion || ''}`
          }
        })
      }
    }

    await prisma.log.create({
      data: { id_usuario: req.usuario.id, accion: 'CREAR_VULCANIZADO', tabla: 'vulcanizados', id_registro: vulcanizado.id_vulcanizado }
    })

    res.status(201).json(vulcanizado)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Error al crear vulcanizado' })
  }
}

// PATCH /api/vulcanizados/:id/estado - Cambiar estado
const cambiarEstado = async (req, res) => {
  try {
    const id = parseInt(req.params.id)
    const { estado } = req.body

    if (!['pendiente', 'listo', 'entregado'].includes(estado)) {
      return res.status(400).json({ error: 'Estado inválido' })
    }

    const data = { estado }
    if (estado === 'entregado') {
      const ahora = new Date()
      const fechaEcuador = new Date(ahora.getTime() - (5 * 60 * 60 * 1000))
      data.fecha_entrega_real = fechaEcuador
    }
    const vulcanizado = await prisma.vulcanizado.update({
      where: { id_vulcanizado: id },
      data,
      include: { cliente: true, detalles: true }
    })

    await prisma.log.create({
      data: { id_usuario: req.usuario.id, accion: `VULCANIZADO_${estado.toUpperCase()}`, tabla: 'vulcanizados', id_registro: id }
    })

    res.json(vulcanizado)
  } catch (err) {
    res.status(500).json({ error: 'Error al cambiar estado' })
  }
}

// PATCH /api/vulcanizados/:id/abono - Registrar abono
const registrarAbono = async (req, res) => {
  try {
    const id = parseInt(req.params.id)
    const { monto } = req.body

    const vulcanizado = await prisma.vulcanizado.findUnique({ where: { id_vulcanizado: id } })
    if (!vulcanizado) return res.status(404).json({ error: 'No encontrado' })

    const nuevoAbono = parseFloat(vulcanizado.abono) + parseFloat(monto)
    const nuevoSaldo = Math.max(0, parseFloat(vulcanizado.saldo) - parseFloat(monto))

    const actualizado = await prisma.vulcanizado.update({
      where: { id_vulcanizado: id },
      data: { abono: nuevoAbono, saldo: nuevoSaldo }
    })

    res.json(actualizado)
  } catch (err) {
    res.status(500).json({ error: 'Error al registrar abono' })
  }
}

module.exports = { listar, obtener, crear, cambiarEstado, registrarAbono }
