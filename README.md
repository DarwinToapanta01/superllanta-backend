# Superllanta Backend — API REST

Sistema de gestión para vulcanizadora de transporte.

## Requisitos
- Node.js v18+
- PostgreSQL 14+

## Instalación

```bash
# 1. Instalar dependencias
npm install

# 2. Configurar variables de entorno
cp .env.example .env
# Edita .env con tus datos de PostgreSQL

# 3. Ejecutar el script SQL en tu base de datos

# 4. Generar cliente Prisma
npm run db:generate

# 5. Cargar datos iniciales
npm run db:seed

# 6. Iniciar en desarrollo
npm run dev
```

## Credenciales por defecto
- Email: admin@superllanta.com
- Password: admin123
- ⚠️ Cambiar en producción
