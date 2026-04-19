const prisma = require('../utils/prisma')

// GET /api/productos - Listar todos los productos con stock
const listar = async (req, res) => {
  try {
    const { categoria, estado } = req.query
    const where = {}
    if (categoria) where.id_categoria = parseInt(categoria)
    if (estado !== undefined) where.estado = estado === 'true'

    const productos = await prisma.producto.findMany({
      where,
      include: { categoria: true },
      orderBy: { nombre: 'asc' }
    })

    // Marcar productos con stock bajo
    const conAlerta = productos.map(p => ({
      ...p,
      stock_bajo: p.stock <= p.stock_minimo
    }))

    res.json(conAlerta)
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener productos' })
  }
}

// GET /api/productos/:id
const obtener = async (req, res) => {
  try {
    const producto = await prisma.producto.findUnique({
      where: { id_producto: parseInt(req.params.id) },
      include: { categoria: true }
    })
    if (!producto) return res.status(404).json({ error: 'Producto no encontrado' })
    res.json(producto)
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener producto' })
  }
}

// POST /api/productos - Crear nuevo producto
const crear = async (req, res) => {
  try {
    const { nombre, descripcion, id_categoria, unidad_medida, stock, stock_minimo, precio_compra, precio_venta } = req.body

    if (!nombre) return res.status(400).json({ error: 'El nombre es requerido' })

    const producto = await prisma.producto.create({
      data: { nombre, descripcion, id_categoria, unidad_medida, stock: stock || 0, stock_minimo: stock_minimo || 0, precio_compra, precio_venta },
      include: { categoria: true }
    })

    await prisma.log.create({
      data: { id_usuario: req.usuario.id, accion: 'CREAR_PRODUCTO', tabla: 'productos', id_registro: producto.id_producto }
    })

    res.status(201).json(producto)
  } catch (err) {
    res.status(500).json({ error: 'Error al crear producto' })
  }
}

// PUT /api/productos/:id - Actualizar producto
const actualizar = async (req, res) => {
  try {
    const id = parseInt(req.params.id)
    const { nombre, descripcion, id_categoria, unidad_medida, stock_minimo, precio_compra, precio_venta, estado } = req.body

    const producto = await prisma.producto.update({
      where: { id_producto: id },
      data: { nombre, descripcion, id_categoria, unidad_medida, stock_minimo, precio_compra, precio_venta, estado },
      include: { categoria: true }
    })

    await prisma.log.create({
      data: { id_usuario: req.usuario.id, accion: 'ACTUALIZAR_PRODUCTO', tabla: 'productos', id_registro: id }
    })

    res.json(producto)
  } catch (err) {
    res.status(500).json({ error: 'Error al actualizar producto' })
  }
}

// POST /api/productos/:id/movimiento - Registrar entrada o salida de stock
const registrarMovimiento = async (req, res) => {
  try {
    const id = parseInt(req.params.id)
    const { tipo, cantidad, motivo } = req.body

    if (!['entrada', 'salida', 'ajuste'].includes(tipo)) {
      return res.status(400).json({ error: 'Tipo de movimiento inválido' })
    }
    if (!cantidad || cantidad <= 0) {
      return res.status(400).json({ error: 'La cantidad debe ser mayor a 0' })
    }

    const producto = await prisma.producto.findUnique({ where: { id_producto: id } })
    if (!producto) return res.status(404).json({ error: 'Producto no encontrado' })

    // Calcular nuevo stock
    let nuevoStock = producto.stock
    if (tipo === 'entrada') nuevoStock += cantidad
    else if (tipo === 'salida') nuevoStock -= cantidad
    else if (tipo === 'ajuste') nuevoStock = cantidad

    if (nuevoStock < 0) {
      return res.status(400).json({ error: 'Stock insuficiente para esta salida' })
    }

    // Transacción: actualizar stock + crear movimiento
    const [productoActualizado, movimiento] = await prisma.$transaction([
      prisma.producto.update({
        where: { id_producto: id },
        data: { stock: nuevoStock }
      }),
      prisma.movimientoInventario.create({
        data: { id_producto: id, id_usuario: req.usuario.id, tipo, cantidad, motivo }
      })
    ])

    // Generar alerta si stock quedó bajo
    if (nuevoStock <= producto.stock_minimo) {
      await prisma.alerta.create({
        data: {
          id_producto: id,
          id_usuario: req.usuario.id,
          tipo: 'stock_minimo',
          mensaje: `Stock bajo: ${producto.nombre} tiene ${nuevoStock} unidades (mínimo: ${producto.stock_minimo})`,
          estado: 'nueva'
        }
      })
    }

    res.json({ producto: productoActualizado, movimiento })
  } catch (err) {
    res.status(500).json({ error: 'Error al registrar movimiento' })
  }
}

// GET /api/productos/:id/movimientos - Historial de movimientos
const historialMovimientos = async (req, res) => {
  try {
    const id = parseInt(req.params.id)
    const movimientos = await prisma.movimientoInventario.findMany({
      where: { id_producto: id },
      include: { usuario: { select: { nombre: true, apellido: true } } },
      orderBy: { fecha: 'desc' },
      take: 50
    })
    res.json(movimientos)
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener historial' })
  }
}

// GET /api/productos/alertas - Productos con stock bajo
const alertasStock = async (req, res) => {
  try {
    const alertas = await prisma.alerta.findMany({
      where: { estado: { in: ['nueva', 'vista'] } },
      include: { producto: { include: { categoria: true } } },
      orderBy: { fecha: 'desc' }
    })
    res.json(alertas)
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener alertas' })
  }
}

// GET /api/categorias - Listar categorías
const listarCategorias = async (req, res) => {
  try {
    const categorias = await prisma.categoria.findMany({ orderBy: { nombre: 'asc' } })
    res.json(categorias)
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener categorías' })
  }
}

module.exports = { listar, obtener, crear, actualizar, registrarMovimiento, historialMovimientos, alertasStock, listarCategorias }
