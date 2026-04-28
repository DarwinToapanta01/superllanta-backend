// ============================================================
// CONTROLADORES COMBINADOS
// clientes | usuarios | reparaciones | reencauches
// ============================================================

const prisma = require('../utils/prisma')
const bcrypt = require('bcryptjs')

// ─── CLIENTES ────────────────────────────────────────────────

const clientes = {
  listar: async (req, res) => {
    try {
      const { buscar } = req.query
      const where = buscar ? {
        OR: [
          { nombre: { contains: buscar, mode: 'insensitive' } },
          { apellido: { contains: buscar, mode: 'insensitive' } },
          { cedula: { contains: buscar } }
        ]
      } : {}
      const lista = await prisma.cliente.findMany({ where, orderBy: { nombre: 'asc' } })
      res.json(lista)
    } catch (err) {
      res.status(500).json({ error: 'Error al obtener clientes' })
    }
  },

  obtener: async (req, res) => {
    try {
      const cliente = await prisma.cliente.findUnique({
        where: { id_cliente: parseInt(req.params.id) },
        include: {
          vulcanizados: { orderBy: { fecha_ingreso: 'desc' }, take: 5 },
          reencauches: { orderBy: { fecha_ingreso: 'desc' }, take: 5 },
          reparaciones: { orderBy: { fecha: 'desc' }, take: 5 }
        }
      })
      if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado' })
      res.json(cliente)
    } catch (err) {
      res.status(500).json({ error: 'Error al obtener cliente' })
    }
  },

  crear: async (req, res) => {
    try {
      const { nombre, apellido, telefono, cedula, direccion, tipo_cliente, nombre_empresa } = req.body
      if (!nombre) return res.status(400).json({ error: 'El nombre es requerido' })
      const cliente = await prisma.cliente.create({
        data: {
          nombre,
          apellido,
          telefono,
          cedula,
          direccion,
          tipo_cliente: tipo_cliente || 'individual',
          nombre_empresa: tipo_cliente === 'empresa' ? nombre_empresa : null
        }
      })
      res.status(201).json(cliente)
    } catch (err) {
      if (err.code === 'P2002') return res.status(400).json({ error: 'Ya existe un cliente con esa cédula' })
      res.status(500).json({ error: 'Error al crear cliente' })
    }
  },

  actualizar: async (req, res) => {
    try {
      const { nombre, apellido, telefono, cedula, direccion, tipo_cliente, nombre_empresa } = req.body
      const cliente = await prisma.cliente.update({
        where: { id_cliente: parseInt(req.params.id) },
        data: {
          nombre,
          apellido,
          telefono,
          cedula,
          direccion,
          tipo_cliente: tipo_cliente || 'individual',
          nombre_empresa: tipo_cliente === 'empresa' ? nombre_empresa : null
        }
      })
      res.json(cliente)
    } catch (err) {
      res.status(500).json({ error: 'Error al actualizar cliente' })
    }
  }
}

// ─── USUARIOS ────────────────────────────────────────────────

const usuarios = {
  listar: async (req, res) => {
    try {
      const lista = await prisma.usuario.findMany({
        include: { rol: true },
        orderBy: { nombre: 'asc' }
      })
      // Eliminar contraseña manualmente
      const resultado = lista.map(({ contrasena, ...u }) => u)
      res.json(resultado)
    } catch (err) {
      console.error('Error listar usuarios:', err)
      res.status(500).json({ error: 'Error al obtener usuarios' })
    }
  },

  crear: async (req, res) => {
    try {
      const { nombre, apellido, correo, contrasena, id_rol } = req.body
      if (!nombre || !correo || !contrasena || !id_rol) {
        return res.status(400).json({ error: 'Todos los campos son requeridos' })
      }
      const hash = await bcrypt.hash(contrasena, 10)
      const usuario = await prisma.usuario.create({
        data: { nombre, apellido, correo, contrasena: hash, id_rol },
        include: { rol: true }
      })
      const { contrasena: _, ...resultado } = usuario
      res.status(201).json(resultado)
    } catch (err) {
      if (err.code === 'P2002') return res.status(400).json({ error: 'El correo ya está registrado' })
      res.status(500).json({ error: 'Error al crear usuario' })
    }
  },

  actualizar: async (req, res) => {
    try {
      const id = parseInt(req.params.id)
      const { nombre, apellido, correo, contrasena, id_rol, estado } = req.body
      const data = { nombre, apellido, correo, id_rol, estado }
      if (contrasena) data.contrasena = await bcrypt.hash(contrasena, 10)
      const usuario = await prisma.usuario.update({
        where: { id_usuario: id },
        data,
        include: { rol: true }
      })
      const { contrasena: _, ...resultado } = usuario
      res.json(resultado)
    } catch (err) {
      res.status(500).json({ error: 'Error al actualizar usuario' })
    }
  },

  desactivar: async (req, res) => {
    try {
      const usuario = await prisma.usuario.update({
        where: { id_usuario: parseInt(req.params.id) },
        data: { estado: false }
      })
      res.json({ mensaje: 'Usuario desactivado', id: usuario.id_usuario })
    } catch (err) {
      res.status(500).json({ error: 'Error al desactivar usuario' })
    }
  },

  listarRoles: async (req, res) => {
    try {
      const roles = await prisma.rolUsuario.findMany()
      res.json(roles)
    } catch (err) {
      res.status(500).json({ error: 'Error al obtener roles' })
    }
  }
}

// ─── REPARACIONES ────────────────────────────────────────────

const reparaciones = {
  listar: async (req, res) => {
    try {
      const { tipo, fecha } = req.query
      const where = {}
      if (tipo) where.tipo_reparacion = tipo
      if (fecha) {
        const inicio = new Date(fecha); inicio.setHours(0, 0, 0, 0)
        const fin = new Date(fecha); fin.setHours(23, 59, 59, 999)
        where.fecha = { gte: inicio, lte: fin }
      }
      const lista = await prisma.reparacion.findMany({
        where,
        include: {
          cliente: { select: { nombre: true, apellido: true } },
          usuario: { select: { nombre: true } },
          neumatico: true,
          detalles_cambio: true,
          uso_productos: { include: { producto: true } }
        },
        orderBy: { fecha: 'desc' }
      })
      res.json(lista)
    } catch (err) {
      res.status(500).json({ error: 'Error al obtener reparaciones' })
    }
  },

  obtener: async (req, res) => {
    try {
      const reparacion = await prisma.reparacion.findUnique({
        where: { id_reparacion: parseInt(req.params.id) },
        include: {
          cliente: true,
          usuario: { select: { nombre: true, apellido: true } },
          neumatico: true,
          detalles_cambio: { include: { neumatico_montado: true } },
          uso_productos: { include: { producto: { include: { categoria: true } } } }
        }
      })
      if (!reparacion) return res.status(404).json({ error: 'Reparación no encontrada' })
      res.json(reparacion)
    } catch (err) {
      res.status(500).json({ error: 'Error al obtener reparación' })
    }
  },

  crear: async (req, res) => {
    try {
      const { id_cliente, id_neumatico, tipo_reparacion, marca_neumatico, medida_neumatico, dot_neumatico, descripcion, costo, observaciones, insumos, detalles_cambio } = req.body

      if (!id_cliente) return res.status(400).json({ error: 'El cliente es requerido' })
      if (!['arreglo', 'cambio'].includes(tipo_reparacion)) return res.status(400).json({ error: 'Tipo inválido' })

      let id_neumatico_final = id_neumatico || null
      let qr_generado = null

      // Si es arreglo, no tiene id_neumatico pero sí marca y medida → crear neumático con QR
      if (tipo_reparacion === 'arreglo' && !id_neumatico_final && marca_neumatico && medida_neumatico) {
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
            marca: marca_neumatico,
            medida: medida_neumatico,
            dot: dot_neumatico || null,
            tipo_registro: 'taller',
            estado: 'activo'
          }
        })

        id_neumatico_final = neumatico.id_neumatico
        qr_generado = {
          codigo_qr,
          qr_imagen: qrImageBase64,
          marca: marca_neumatico,
          medida: medida_neumatico
        }
      }

      let chofer_servicio = null
      let placa_vehiculo = null
      if (req.body.id_vehiculo) {
        const vehiculo = await prisma.vehiculo.findUnique({
          where: { id_vehiculo: parseInt(req.body.id_vehiculo) }
        })
        if (vehiculo) {
          chofer_servicio = vehiculo.chofer || null
          placa_vehiculo = vehiculo.placa || null
        }
      }

      const reparacion = await prisma.reparacion.create({
        data: {
          id_cliente,
          id_usuario: req.usuario.id,
          id_neumatico: id_neumatico_final,
          id_vehiculo: req.body.id_vehiculo || null,
          chofer_servicio,
          placa_vehiculo,
          tipo_reparacion,
          marca_neumatico,
          medida_neumatico,
          dot_neumatico,
          descripcion,
          costo: costo || 0,
          observaciones
        }
      })

      // Registrar insumos y descontar stock
      if (insumos && insumos.length > 0) {
        for (const ins of insumos) {
          await prisma.usoProductoServicio.create({
            data: { id_producto: ins.id_producto, cantidad: ins.cantidad, id_reparacion: reparacion.id_reparacion }
          })
          await prisma.producto.update({
            where: { id_producto: ins.id_producto },
            data: { stock: { decrement: ins.cantidad } }
          })
          await prisma.movimientoInventario.create({
            data: { id_producto: ins.id_producto, id_usuario: req.usuario.id, tipo: 'salida', cantidad: ins.cantidad, motivo: `Reparación #${reparacion.id_reparacion}` }
          })
        }
      }

      // Detalle de cambio si aplica
      if (tipo_reparacion === 'cambio' && detalles_cambio) {
        for (const dc of detalles_cambio) {
          await prisma.detalleCambioNeumatico.create({
            data: {
              id_reparacion: reparacion.id_reparacion,
              marca_desmontado: dc.marca_desmontado || 'N/A',
              medida_desmontada: dc.medida_desmontada || 'N/A',
              marca_montado: dc.marca_montado || 'N/A',
              medida_montada: dc.medida_montada || 'N/A',
              es_neumatico_propio: dc.es_neumatico_propio ?? true,
              precio_mano_obra: dc.precio_mano_obra || 0,
              cantidad_cambios: dc.cantidad_cambios || 1,
            }
          })
        }
      }

      // Registrar en historial del neumático
      if (id_neumatico_final) {
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

      res.status(201).json({ reparacion, qr_generado })
    } catch (err) {
      console.error(err)
      res.status(500).json({ error: 'Error al crear reparación' })
    }
  }
}

// ─── REENCAUCHES ─────────────────────────────────────────────

const reencauches = {
  listar: async (req, res) => {
    try {
      const { estado } = req.query
      const where = estado ? { estado } : {}
      const lista = await prisma.reencauche.findMany({
        where,
        include: {
          cliente: { select: { nombre: true, apellido: true } },
          detalles: true
        },
        orderBy: { fecha_ingreso: 'desc' }
      })
      res.json(lista)
    } catch (err) {
      res.status(500).json({ error: 'Error al obtener reencauches' })
    }
  },

  obtenerPorCliente: async (req, res) => {
    try {
      const lista = await prisma.reencauche.findMany({
        where: { id_cliente: parseInt(req.params.clienteId) },
        include: { detalles: true, usuario: { select: { nombre: true } } },
        orderBy: { fecha_ingreso: 'desc' }
      })
      res.json(lista)
    } catch (err) {
      res.status(500).json({ error: 'Error al obtener reencauches del cliente' })
    }
  },

  crear: async (req, res) => {
    try {
      const { id_cliente, fecha_entrega_estimada, abono, observaciones, detalles } = req.body
      if (!id_cliente) return res.status(400).json({ error: 'El cliente es requerido' })
      if (!detalles || detalles.length === 0) return res.status(400).json({ error: 'Debe agregar al menos un neumático' })

      const total = detalles.reduce((sum, d) => sum + (parseFloat(d.precio) || 0), 0)
      const saldo = total - (parseFloat(abono) || 0)

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

      const reencauche = await prisma.reencauche.create({
        data: {
          id_cliente, id_usuario: req.usuario.id,
          id_vehiculo: req.body.id_vehiculo || null,
          chofer_servicio,
          placa_vehiculo,
          fecha_entrega_estimada: fecha_entrega_estimada ? new Date(fecha_entrega_estimada) : null,
          abono: abono || 0, saldo: saldo >= 0 ? saldo : 0,
          estado: 'pendiente', observaciones,
          detalles: { create: detalles.map(d => ({ id_neumatico: d.id_neumatico || null, marca: d.marca, medida: d.medida, dot: d.dot, tipo_reencauche: d.tipo_reencauche, estado_neumatico: d.estado_neumatico, precio: d.precio })) }
        },
        include: { cliente: true, detalles: true }
      })
      res.status(201).json(reencauche)
    } catch (err) {
      res.status(500).json({ error: 'Error al crear reencauche' })
    }
  },

  cambiarEstado: async (req, res) => {
    try {
      const id = parseInt(req.params.id)
      const { estado } = req.body
      if (!['pendiente', 'en_proceso', 'listo', 'entregado'].includes(estado)) {
        return res.status(400).json({ error: 'Estado inválido' })
      }
      const data = { estado }
      if (estado === 'entregado') {
        const ahora = new Date()
        data.fecha_entrega_real = new Date(ahora.getTime() - (5 * 60 * 60 * 1000))
      }
      const reencauche = await prisma.reencauche.update({ where: { id_reencauche: id }, data })
      res.json(reencauche)
    } catch (err) {
      res.status(500).json({ error: 'Error al cambiar estado' })
    }
  }
}

module.exports = { clientes, usuarios, reparaciones, reencauches }