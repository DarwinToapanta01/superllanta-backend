const express = require('express')
const router = express.Router()
const prisma = require('../utils/prisma')
const { verificarHorario } = require('../middleware/horario')

const { login, perfil } = require('../controllers/authController')
const productosCtrl = require('../controllers/productosController')
const neumaticosCtrl = require('../controllers/neumaticosController')
const vulcanizadosCtrl = require('../controllers/vulcanizadosController')
const { clientes, usuarios, reparaciones, reencauches } = require('../controllers/otrosControladores')
const { verificarToken, soloAdmin } = require('../middleware/auth')

// ─── AUTH ─────────────────────────────────────────────────────
router.post('/auth/login', login)
router.get('/auth/me', verificarToken, perfil)

// ─── PRODUCTOS E INVENTARIO ───────────────────────────────────
router.get('/categorias', verificarToken, productosCtrl.listarCategorias)
router.get('/productos', verificarToken, productosCtrl.listar)
router.get('/productos/alertas', verificarToken, soloAdmin, productosCtrl.alertasStock)
router.get('/productos/:id', verificarToken, productosCtrl.obtener)
router.post('/productos', verificarToken, soloAdmin, productosCtrl.crear)
router.put('/productos/:id', verificarToken, soloAdmin, productosCtrl.actualizar)
router.post('/productos/:id/movimiento', verificarToken, productosCtrl.registrarMovimiento)
router.get('/productos/:id/movimientos', verificarToken, productosCtrl.historialMovimientos)

// ─── NEUMÁTICOS ───────────────────────────────────────────────
// Ruta pública para escaneo QR (sin autenticación)
router.get('/qr/:codigo', neumaticosCtrl.hojaDeVida)

router.get('/neumaticos', verificarToken, neumaticosCtrl.listar)
router.get('/neumaticos/:id', verificarToken, neumaticosCtrl.obtener)
router.get('/neumaticos/:id/qr-imagen', verificarToken, neumaticosCtrl.obtenerQRImagen)
router.post('/neumaticos/taller', verificarToken, neumaticosCtrl.crearTaller)
router.post('/neumaticos/venta', verificarToken, soloAdmin, neumaticosCtrl.crearVenta)

// ─── CLIENTES ─────────────────────────────────────────────────
router.get('/clientes', verificarToken, clientes.listar)
router.post('/clientes', verificarToken, clientes.crear)
router.get('/clientes/:id/neumaticos', verificarToken, async (req, res) => {
    try {
        const neumaticos = await prisma.neumatico.findMany({
            where: {
                id_cliente: parseInt(req.params.id),
                tipo_registro: 'taller'
            },
            orderBy: { fecha_registro: 'desc' }
        })
        res.json(neumaticos)
    } catch (err) {
        res.status(500).json({ error: 'Error al obtener neumáticos del cliente' })
    }
})

router.get('/clientes/:id', verificarToken, clientes.obtener)
router.put('/clientes/:id', verificarToken, clientes.actualizar)

// ─── VULCANIZADOS ─────────────────────────────────────────────
router.get('/vulcanizados', verificarToken, vulcanizadosCtrl.listar)
router.get('/vulcanizados/:id', verificarToken, vulcanizadosCtrl.obtener)
router.post('/vulcanizados', verificarToken, vulcanizadosCtrl.crear)
router.patch('/vulcanizados/:id/estado', verificarToken, vulcanizadosCtrl.cambiarEstado)
router.patch('/vulcanizados/:id/abono', verificarToken, vulcanizadosCtrl.registrarAbono)

// ─── REENCAUCHES ──────────────────────────────────────────────
router.get('/reencauches', verificarToken, reencauches.listar)
router.get('/reencauches/cliente/:clienteId', verificarToken, reencauches.obtenerPorCliente)
router.post('/reencauches', verificarToken, reencauches.crear)
router.patch('/reencauches/:id/estado', verificarToken, reencauches.cambiarEstado)

// ─── REPARACIONES ─────────────────────────────────────────────
router.get('/reparaciones', verificarToken, reparaciones.listar)
router.get('/reparaciones/:id', verificarToken, reparaciones.obtener)
router.post('/reparaciones', verificarToken, reparaciones.crear)

// ─── USUARIOS (solo admin) ────────────────────────────────────
router.get('/usuarios', verificarToken, soloAdmin, usuarios.listar)
router.get('/roles', verificarToken, soloAdmin, usuarios.listarRoles)
router.post('/usuarios', verificarToken, soloAdmin, usuarios.crear)
router.put('/usuarios/:id', verificarToken, soloAdmin, usuarios.actualizar)
router.patch('/usuarios/:id/desactivar', verificarToken, soloAdmin, usuarios.desactivar)

// ─── VENTAS ───────────────────────────────────────────────────
router.post('/ventas', verificarToken, async (req, res) => {
    try {
        const { id_cliente, id_neumatico, precio } = req.body

        const venta = await prisma.venta.create({
            data: {
                id_cliente: id_cliente || null,
                id_usuario: req.usuario.id,
                total: precio,
                detalles: {
                    create: [{ id_neumatico, precio }]
                }
            },
            include: { detalles: true }
        })

        // Marcar neumático como vendido
        await prisma.neumatico.update({
            where: { id_neumatico },
            data: { estado: 'vendido' }
        })

        await prisma.log.create({
            data: { id_usuario: req.usuario.id, accion: 'VENTA_NEUMATICO', tabla: 'ventas', id_registro: venta.id_venta }
        })

        res.status(201).json(venta)
    } catch (err) {
        console.error(err)
        res.status(500).json({ error: 'Error al registrar venta' })
    }
})

module.exports = router

// ─── REPORTES ─────────────────────────────────────────────────

router.get('/reportes/servicios', verificarToken, soloAdmin, async (req, res) => {
    try {
        const { desde, hasta, tipo } = req.query
        const filtroFecha = desde && hasta ? {
            gte: new Date(desde + 'T00:00:00.000-05:00'),
            lte: new Date(hasta + 'T23:59:59.999-05:00')
        } : undefined

        const [vulcanizados, reencauches, reparaciones] = await Promise.all([
            (!tipo || tipo === 'vulcanizado') ? prisma.vulcanizado.findMany({
                where: filtroFecha ? { fecha_ingreso: filtroFecha } : {},
                include: { cliente: { select: { nombre: true, apellido: true } }, usuario: { select: { nombre: true } } }
            }) : [],
            (!tipo || tipo === 'reencauche') ? prisma.reencauche.findMany({
                where: filtroFecha ? { fecha_ingreso: filtroFecha } : {},
                include: { cliente: { select: { nombre: true, apellido: true } }, detalles: true }
            }) : [],
            (!tipo || tipo === 'reparacion' || tipo === 'arreglo' || tipo === 'cambio') ? prisma.reparacion.findMany({
                where: {
                    ...(filtroFecha ? { fecha: filtroFecha } : {}),
                    ...(tipo === 'arreglo' || tipo === 'cambio' ? { tipo_reparacion: tipo } : {})
                },
                include: { cliente: { select: { nombre: true, apellido: true } }, usuario: { select: { nombre: true } } }
            }) : []
        ])

        const totalVulcanizados = vulcanizados.reduce((s, v) => s + parseFloat(v.saldo || 0) + parseFloat(v.abono || 0), 0)
        const totalReencauches = reencauches.reduce((s, r) => s + parseFloat(r.saldo || 0) + parseFloat(r.abono || 0), 0)
        const totalReparaciones = reparaciones.reduce((s, r) => s + parseFloat(r.costo || 0), 0)

        res.json({
            resumen: {
                vulcanizados: { cantidad: vulcanizados.length, total: totalVulcanizados },
                reencauches: { cantidad: reencauches.length, total: totalReencauches },
                arreglos: { cantidad: reparaciones.filter(r => r.tipo_reparacion === 'arreglo').length, total: reparaciones.filter(r => r.tipo_reparacion === 'arreglo').reduce((s, r) => s + parseFloat(r.costo || 0), 0) },
                cambios: { cantidad: reparaciones.filter(r => r.tipo_reparacion === 'cambio').length, total: reparaciones.filter(r => r.tipo_reparacion === 'cambio').reduce((s, r) => s + parseFloat(r.costo || 0), 0) },
                total_general: totalVulcanizados + totalReencauches + totalReparaciones
            },
            detalle: {
                vulcanizados,
                reencauches,
                reparaciones
            }
        })
    } catch (err) {
        console.error(err)
        res.status(500).json({ error: 'Error al generar reporte de servicios' })
    }
})

router.get('/reportes/insumos', verificarToken, soloAdmin, async (req, res) => {
    try {
        const { desde, hasta } = req.query

        // Traer todos los usos y filtrar en memoria por fecha del servicio asociado
        const usos = await prisma.usoProductoServicio.findMany({
            include: {
                producto: { include: { categoria: true } },
                reparacion: { select: { tipo_reparacion: true, fecha: true } },
                parchado: { select: { fecha: true } }
            }
        })

        // Filtrar por fecha
        const filtrados = usos.filter(uso => {
            if (!desde || !hasta) return true
            const fechaServicio = uso.reparacion?.fecha || uso.parchado?.fecha
            if (!fechaServicio) return false
            const fecha = new Date(fechaServicio)
            const inicio = new Date(desde + 'T00:00:00.000-05:00')
            const fin = new Date(hasta + 'T23:59:59.999-05:00')
            return fecha >= inicio && fecha <= fin
        })

        // Agrupar por producto
        const agrupado = {}
        for (const uso of filtrados) {
            const id = uso.id_producto
            if (!agrupado[id]) {
                agrupado[id] = {
                    id_producto: id,
                    nombre: uso.producto.nombre,
                    categoria: uso.producto.categoria?.nombre,
                    unidad_medida: uso.producto.unidad_medida,
                    total_cantidad: 0,
                    usos: []
                }
            }
            agrupado[id].total_cantidad += uso.cantidad
            agrupado[id].usos.push({
                cantidad: uso.cantidad,
                servicio: uso.reparacion ? `Reparación (${uso.reparacion.tipo_reparacion})` : 'Parchado',
                fecha: uso.reparacion?.fecha || uso.parchado?.fecha
            })
        }

        res.json({
            insumos: Object.values(agrupado).sort((a, b) => b.total_cantidad - a.total_cantidad),
            total_registros: filtrados.length
        })
    } catch (err) {
        console.error(err)
        res.status(500).json({ error: 'Error al generar reporte de insumos' })
    }
})

// ─── DASHBOARD ────────────────────────────────────────────────
router.get('/dashboard', verificarToken, async (req, res) => {
    try {
        const hoyInicio = new Date()
        hoyInicio.setHours(0, 0, 0, 0)
        const hoyFin = new Date()
        hoyFin.setHours(23, 59, 59, 999)

        const mesInicio = new Date(new Date().getFullYear(), new Date().getMonth(), 1)

        const [
            // Totales generales
            totalClientes,
            totalNeumaticos,
            totalUsuarios,
            // Servicios de hoy
            vulcanizadosHoy,
            reencauchesHoy,
            reparacionesHoy,
            // Servicios del mes
            vulcanizadosMes,
            reencauchesMes,
            reparacionesMes,
            // Pendientes
            vulcanizadosPendientes,
            reencauchesPendientes,
            // Alertas stock
            alertasStock,
            // Últimas reparaciones
            ultimasReparaciones,
            // Últimos vulcanizados
            ultimosVulcanizados,
        ] = await Promise.all([
            prisma.cliente.count(),
            prisma.neumatico.count({ where: { tipo_registro: 'taller' } }),
            prisma.usuario.count({ where: { estado: true } }),

            prisma.vulcanizado.findMany({ where: { fecha_ingreso: { gte: hoyInicio, lte: hoyFin } } }),
            prisma.reencauche.findMany({ where: { fecha_ingreso: { gte: hoyInicio, lte: hoyFin } } }),
            prisma.reparacion.findMany({ where: { fecha: { gte: hoyInicio, lte: hoyFin } } }),

            prisma.vulcanizado.findMany({ where: { fecha_ingreso: { gte: mesInicio } } }),
            prisma.reencauche.findMany({ where: { fecha_ingreso: { gte: mesInicio } } }),
            prisma.reparacion.findMany({ where: { fecha: { gte: mesInicio } } }),

            prisma.vulcanizado.count({ where: { estado: { in: ['pendiente', 'listo'] } } }),
            prisma.reencauche.count({ where: { estado: { in: ['pendiente', 'en_proceso', 'listo'] } } }),

            prisma.producto.findMany({
                where: { estado: true },
                select: { id_producto: true, nombre: true, stock: true, stock_minimo: true }
            }),

            prisma.reparacion.findMany({
                take: 5,
                orderBy: { fecha: 'desc' },
                include: { cliente: { select: { nombre: true, apellido: true } } }
            }),

            prisma.vulcanizado.findMany({
                take: 5,
                orderBy: { fecha_ingreso: 'desc' },
                include: { cliente: { select: { nombre: true, apellido: true } } }
            }),
        ])

        const ingresoHoy =
            vulcanizadosHoy.reduce((s, v) => s + parseFloat(v.abono || 0), 0) +
            reencauchesHoy.reduce((s, r) => s + parseFloat(r.abono || 0), 0) +
            reparacionesHoy.reduce((s, r) => s + parseFloat(r.costo || 0), 0)

        const ingresoMes =
            vulcanizadosMes.reduce((s, v) => s + parseFloat(v.abono || 0), 0) +
            reencauchesMes.reduce((s, r) => s + parseFloat(r.abono || 0), 0) +
            reparacionesMes.reduce((s, r) => s + parseFloat(r.costo || 0), 0)

        const productosEnAlerta = alertasStock.filter(p => p.stock <= p.stock_minimo)

        res.json({
            hoy: {
                servicios: vulcanizadosHoy.length + reencauchesHoy.length + reparacionesHoy.length,
                vulcanizados: vulcanizadosHoy.length,
                reencauches: reencauchesHoy.length,
                reparaciones: reparacionesHoy.length,
                ingreso: ingresoHoy,
            },
            mes: {
                servicios: vulcanizadosMes.length + reencauchesMes.length + reparacionesMes.length,
                vulcanizados: vulcanizadosMes.length,
                reencauches: reencauchesMes.length,
                reparaciones: reparacionesMes.length,
                ingreso: ingresoMes,
            },
            pendientes: {
                vulcanizados: vulcanizadosPendientes,
                reencauches: reencauchesPendientes,
                total: vulcanizadosPendientes + reencauchesPendientes,
            },
            generales: {
                clientes: totalClientes,
                neumaticos: totalNeumaticos,
                usuarios: totalUsuarios,
                alertasStock: productosEnAlerta.length,
            },
            alertasStock: productosEnAlerta,
            ultimasReparaciones,
            ultimosVulcanizados,
        })
    } catch (err) {
        console.error(err)
        res.status(500).json({ error: 'Error al obtener datos del dashboard' })
    }
})