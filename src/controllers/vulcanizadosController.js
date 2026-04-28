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
    const { id_cliente, id_vehiculo, fecha_entrega_estimada, abono, observaciones, detalles } = req.body

    if (!id_cliente) return res.status(400).json({ error: 'El cliente es requerido' })
    if (!detalles || detalles.length === 0) return res.status(400).json({ error: 'Debe agregar al menos un neumático' })

    // Obtener datos del vehículo si viene uno seleccionado
    let chofer_servicio = null
    let placa_vehiculo = null
    if (id_vehiculo) {
      const vehiculo = await prisma.vehiculo.findUnique({
        where: { id_vehiculo: parseInt(id_vehiculo) }
      })
      if (vehiculo) {
        chofer_servicio = vehiculo.chofer || null
        placa_vehiculo = vehiculo.placa || null
      }
    }

    const total = detalles.reduce((sum, d) => sum + (parseFloat(d.precio) || 0), 0)
    const saldo = total - (parseFloat(abono) || 0)

    // Procesar detalles: crear neumático con QR si no tiene id_neumatico
    const detallesProcesados = []
    const qrsGenerados = []

    for (const d of detalles) {
      let id_neumatico = d.id_neumatico || null

      // Si no tiene id_neumatico, crear uno nuevo con QR
      if (!id_neumatico && d.marca && d.medida) {
        const QRCode = require('qrcode')
        const año = new Date().getFullYear()
        const aleatorio = Math.floor(Math.random() * 90000) + 10000
        const codigo_qr = `SL-${año}-${aleatorio}`

        const qrImageBase64 = await QRCode.toDataURL(
          `${process.env.FRONTEND_URL}/qr/${codigo_qr}`,
          { width: 300, margin: 2, color: { dark: '#1C3F6E', light: '#FFFFFF' } }
        )

        const neumatico = await prisma.neumatico.create({
          data: {
            id_cliente,
            codigo_qr,
            marca: d.marca,
            medida: d.medida,
            dot: d.dot || null,
            tipo_registro: 'taller',
            estado: 'activo'
          }
        })

        id_neumatico = neumatico.id_neumatico
        qrsGenerados.push({
          codigo_qr,
          qr_imagen: qrImageBase64,
          marca: d.marca,
          medida: d.medida,
          dot: d.dot
        })
      }

      detallesProcesados.push({
        id_neumatico,
        marca: d.marca,
        medida: d.medida,
        dot: d.dot,
        deja_rin: d.deja_rin || false,
        descripcion: d.descripcion,
        precio: d.precio
      })
    }

    const vulcanizado = await prisma.vulcanizado.create({
      data: {
        id_cliente,
        id_usuario: req.usuario.id,
        id_vehiculo: id_vehiculo || null,
        chofer_servicio,      // ← nuevo
        placa_vehiculo,       // ← nuevo
        fecha_entrega_estimada: fecha_entrega_estimada ? new Date(fecha_entrega_estimada) : null,
        abono: abono || 0,
        saldo: saldo >= 0 ? saldo : 0,
        estado: 'pendiente',
        observaciones,
        detalles: { create: detallesProcesados }
      },
      include: { cliente: true, detalles: true }
    })

    // Registrar en historial de cada neumático
    for (const detalle of vulcanizado.detalles) {
      if (detalle.id_neumatico) {
        await prisma.historialNeumatico.create({
          data: {
            id_neumatico: detalle.id_neumatico,
            id_usuario: req.usuario.id,
            tipo_servicio: 'vulcanizado',
            descripcion: [
              detalle.descripcion || 'Ingresado a vulcanizado',
              placa_vehiculo ? `Vehículo: ${placa_vehiculo}` : null,
              chofer_servicio ? `Chofer: ${chofer_servicio}` : null,
            ].filter(Boolean).join(' · ')
          }
        })
      }
    }

    await prisma.log.create({
      data: { id_usuario: req.usuario.id, accion: 'CREAR_VULCANIZADO', tabla: 'vulcanizados', id_registro: vulcanizado.id_vulcanizado }
    })

    // Responder con el vulcanizado y los QRs generados
    res.status(201).json({ vulcanizado, qrs_generados: qrsGenerados })
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
