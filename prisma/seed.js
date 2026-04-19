// ============================================================
// SEED - Datos iniciales del sistema Superllanta
// Ejecutar con: npm run db:seed
// ============================================================

const { PrismaClient } = require('@prisma/client')
const bcrypt = require('bcryptjs')

const prisma = new PrismaClient()

async function main() {
  console.log('Sembrando datos iniciales...')

  // Roles
  const adminRol = await prisma.rolUsuario.upsert({
    where: { nombre: 'administrador' },
    update: {},
    create: { nombre: 'administrador', descripcion: 'Acceso total al sistema' }
  })
  const tecnicoRol = await prisma.rolUsuario.upsert({
    where: { nombre: 'tecnico' },
    update: {},
    create: { nombre: 'tecnico', descripcion: 'Acceso operativo a servicios e inventario' }
  })

  // Usuario administrador por defecto
  const passwordHash = await bcrypt.hash('admin123', 10)
  await prisma.usuario.upsert({
    where: { correo: 'admin@superllanta.com' },
    update: {},
    create: {
      id_rol: adminRol.id_rol,
      nombre: 'Darwin',
      apellido: 'Toapanta',
      correo: 'admin@superllanta.com',
      contrasena: passwordHash,
      estado: true
    }
  })

  // Categorías de insumos
  const categorias = [
    'Parches', 'Pegamento', 'Moñones',
    'Herramientas', 'Válvulas', 'Otros insumos', 'Mano de obra cambio'
  ]
  for (const nombre of categorias) {
    await prisma.categoria.upsert({
      where: { nombre },
      update: {},
      create: { nombre }
    })
  }

  console.log('✅ Datos iniciales cargados correctamente')
  console.log('   Admin: admin@superllanta.com / admin123')
  console.log('   ⚠️  Cambia la contraseña en producción')
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(async () => { await prisma.$disconnect() })
