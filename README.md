# Sistema de Gestión de Divisas

Backend para la administración de operaciones de compra y venta de divisas, cuentas, clientes, proveedores, cartera, abonos, salidas, movimientos financieros y reportes.

El sistema está diseñado para funcionar mediante instancias independientes por organización. Cada instancia utiliza su propia base de datos, configuración, usuarios, cuentas y archivos.

## Funcionalidades principales

- Autenticación mediante JWT.
- Gestión de usuarios y roles.
- Administración de clientes y proveedores.
- Cuentas base en COP.
- Cuentas operativas en BS, USD y USDT.
- Compra y venta de divisas.
- Operaciones directas entre cliente y proveedor.
- Abonos a cuentas propias.
- Abonos directos a proveedores.
- Registro de gastos, retiros y pagos a acreedores.
- Cartera por cobrar y por pagar.
- Libro de movimientos de clientes, proveedores y cuentas.
- Cálculo de utilidad por operación.
- Dashboard financiero.
- Reportes por cliente, proveedor y período.
- Configuración y logo de la organización.
- Activación e inactivación de entidades sin eliminación física.

## Tecnologías

- Node.js
- NestJS
- TypeScript
- Prisma ORM
- PostgreSQL
- JWT
- bcrypt
- Multer
- pnpm
- PM2
- Nginx

## Arquitectura

El backend utiliza una arquitectura modular basada en NestJS.

```text
src/
├── auth/
├── usuarios/
├── clientes/
├── proveedores/
├── cuentas/
├── operaciones/
├── entradas/
├── salidas/
├── cartera/
├── dashboard/
├── configuracion/
├── prisma/
└── common/
```

## Reglas financieras principales

### Balance de cliente

```text
saldo = débitos - créditos
```

```text
saldo > 0  → el cliente debe dinero
saldo < 0  → la organización debe dinero al cliente
saldo = 0  → cuenta saldada
```

### Balance de proveedor

```text
saldo = débitos - créditos
```

```text
saldo > 0  → la organización debe dinero al proveedor
saldo < 0  → existe saldo a favor de la organización
saldo = 0  → cuenta saldada
```

### Utilidad

```text
montoCompraCOP = montoTransacción × tasaCompra
montoVentaCOP  = montoTransacción × tasaVenta
utilidadCOP     = montoVentaCOP - montoCompraCOP
```

## Tipos de operación

### Compra

La organización recibe divisas de un proveedor y aumenta el saldo de una cuenta operativa.

### Venta

La organización entrega divisas desde una cuenta operativa a un cliente y genera una cuenta por cobrar.

### Operación directa

El proveedor entrega las divisas directamente al cliente. No se modifica una cuenta operativa propia, pero se registran los movimientos correspondientes en los libros del cliente y del proveedor.

## Entradas y abonos

### Abono a cuenta propia

El cliente realiza un abono a una cuenta de la organización. El saldo físico de la cuenta aumenta y la deuda del cliente disminuye.

### Abono directo a proveedor

El cliente paga directamente a un proveedor. No se modifica una cuenta propia, pero se reducen los balances del cliente y del proveedor.

## Requisitos

- Node.js 22 o superior.
- pnpm.
- PostgreSQL.
- Base de datos creada.
- Variables de entorno configuradas.

## Instalación

```bash
git clone git@github.com:TU_USUARIO/TU_REPOSITORIO.git sistema-gestion
cd sistema-gestion
pnpm install
```

Cuando pnpm solicite aprobar scripts de compilación:

```bash
pnpm approve-builds
pnpm rebuild
```

Genera Prisma y aplica las migraciones:

```bash
pnpm exec prisma generate
pnpm exec prisma migrate deploy
```

Compila el proyecto:

```bash
pnpm build
```

## Variables de entorno

Crea un archivo `.env` en la raíz:

```env
NODE_ENV=production
PORT=3009

DATABASE_URL="postgresql://usuario:clave@127.0.0.1:5432/sistema_gestion?schema=public"

JWT_SECRET="SECRETO_JWT_SEGURO"
JWT_EXPIRES_IN=86400

FRONTEND_URL="https://frontend-ejemplo.vercel.app"
```

No subas el archivo `.env` al repositorio.

## Base de datos

Aplicar migraciones:

```bash
pnpm exec prisma migrate deploy
```

Verificar estado:

```bash
pnpm exec prisma migrate status
```

Crear una migración durante desarrollo:

```bash
pnpm exec prisma migrate dev --name nombre_de_la_migracion
```

No uses `prisma migrate reset` en producción.

## Seed

```bash
pnpm exec prisma db seed
```

O directamente:

```bash
pnpm exec tsx prisma/seed.ts
```

Antes de ejecutarlo, verifica que `DATABASE_URL` apunte a la base correcta.

## Desarrollo

```bash
pnpm start:dev
```

La API utiliza el prefijo:

```text
/api
```

## Producción con PM2

```bash
pnpm build

pm2 start dist/src/main.js \
  --name sistema-gestion \
  --cwd /var/www/html/sistema-gestion

pm2 save
```

Consultar estado y logs:

```bash
pm2 list
pm2 logs sistema-gestion --lines 100
```

## Nginx

Ejemplo para publicar la instancia mediante un puerto alternativo:

```nginx
server {
    listen 8081;
    listen [::]:8081;

    server_name _;

    client_max_body_size 3M;

    location / {
        proxy_pass http://127.0.0.1:3009;
        proxy_http_version 1.1;

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

La API quedaría disponible en:

```text
http://IP_DEL_SERVIDOR:8081/api
```

## Archivos de organización

Los logos se almacenan en:

```text
uploads/organizacion/
```

Crear la carpeta:

```bash
mkdir -p uploads/organizacion
chmod -R 755 uploads
```

## Endpoints principales

```text
POST   /api/auth/login
GET    /api/auth/me

GET    /api/clientes
POST   /api/clientes
GET    /api/clientes/:id
PATCH  /api/clientes/:id

GET    /api/proveedores
POST   /api/proveedores
GET    /api/proveedores/:id
PATCH  /api/proveedores/:id

GET    /api/cuentas
POST   /api/cuentas
GET    /api/cuentas/:id
PATCH  /api/cuentas/:id

GET    /api/operaciones
POST   /api/operaciones
GET    /api/operaciones/:id

GET    /api/entradas
POST   /api/entradas

GET    /api/salidas
POST   /api/salidas

GET    /api/cartera
GET    /api/dashboard

GET    /api/configuracion/organizacion
PATCH  /api/configuracion/organizacion
POST   /api/configuracion/organizacion/logo
DELETE /api/configuracion/organizacion/logo
GET    /api/configuracion/organizacion/publica
```

Los nombres exactos pueden variar según la implementación de los controladores.

## Instancias por cliente

Cada cliente debe tener de forma independiente:

- Base de datos.
- Usuario PostgreSQL.
- Archivo `.env`.
- Puerto interno.
- Proceso PM2.
- Carpeta de archivos.
- Configuración de Nginx.
- Frontend y variables de entorno.

Ejemplo:

```text
Instancia principal
Puerto NestJS: 3008
Puerto público: 80
Proceso PM2: alcambio

Instancia de pruebas
Puerto NestJS: 3009
Puerto público: 8081
Proceso PM2: sistema-gestion
```

## Estrategia de cambios

Los cambios generales deben incorporarse al código principal.

Las diferencias por cliente deben manejarse preferiblemente mediante:

- Configuración por organización.
- Feature flags.
- Variables de entorno.
- Campos opcionales.
- Migraciones compatibles.

Las ramas específicas por cliente deben reservarse para casos excepcionales.

## Seguridad

- No almacenar contraseñas sin cifrar.
- No exponer `JWT_SECRET`.
- No subir `.env`.
- Usar HTTPS en producción.
- Validar tipos y tamaños de archivos.
- Mantener las dependencias actualizadas.
- Respaldar PostgreSQL y `uploads`.
- No eliminar registros financieros; deben anularse o inactivarse.

## Estado del proyecto

El sistema cuenta con una base funcional para autenticación, cuentas, clientes, proveedores, operaciones, abonos, salidas, cartera, dashboard, configuración de organización y despliegue de múltiples instancias.

## Licencia

Proyecto privado. Su uso, distribución o modificación requiere autorización del propietario.
