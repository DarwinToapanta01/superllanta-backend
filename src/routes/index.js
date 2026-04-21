const express = require('express')
const router = express.Router()
const prisma = require('../utils/prisma')

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
