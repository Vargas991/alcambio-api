# Checklist de desarrollo — Backend Sistema de Gestión de Divisas

## Etapa 0 — Preparación del proyecto

* [ ] Confirmar que el proyecto NestJS ya corre correctamente.
* [x] Confirmar versión de Node.js.
* [x] Confirmar que PostgreSQL está instalado o disponible.
* [x] Crear base de datos del proyecto.
* [x] Instalar Prisma.
* [x] Configurar archivo `.env`.
* [x] Configurar conexión `DATABASE_URL`.
* [x] Crear módulo `prisma`.
* [x] Crear servicio `PrismaService`.
* [x] Probar conexión con base de datos.

### Solicitud que me puedes hacer

```txt
Ayúdame a configurar Prisma con PostgreSQL en mi proyecto NestJS.
```

---

# Etapa 1 — Schema de Prisma

* [x] Crear enums principales:

  * [ ] `Currency`
  * [ ] `AccountCategory`
  * [ ] `AccountType`
  * [ ] `EntityStatus`
  * [ ] `OperationType`
  * [ ] `OperationStatus`
  * [ ] `EntryType`
  * [ ] `AccountMovementType`
  * [ ] `ClientLedgerType`
  * [ ] `ProviderLedgerType`
  * [ ] `RoleName`

* [ ] Crear modelo `User`.

* [ ] Crear modelo `Client`.

* [ ] Crear modelo `Provider`.

* [ ] Crear modelo `Account`.

* [ ] Crear modelo `Operation`.

* [ ] Crear modelo `Entry`.

* [ ] Crear modelo `AccountMovement`.

* [ ] Crear modelo `ClientLedgerEntry`.

* [ ] Crear modelo `ProviderLedgerEntry`.

* [ ] Ejecutar migración inicial.

* [ ] Generar cliente Prisma.

* [ ] Validar tablas en la base de datos.

### Solicitud que me puedes hacer

```txt
Ayúdame a crear el schema.prisma completo para el sistema de gestión de divisas.
```

---

# Etapa 2 — Auth, usuarios y roles

* [x] Crear módulo `auth`.
* [x] Crear módulo `users`.
* [x] Crear controlador de usuarios.
* [x] Crear servicio de usuarios.
* [x] Crear DTO para crear usuario.
* [x] Encriptar contraseña con `bcrypt`.
* [x] Crear login con email y password.
* [x] Generar JWT.
* [x] Crear guard de autenticación.
* [x] Crear decorador para usuario autenticado.
* [x] Crear roles:

  * [ ] `ADMIN`
  * [ ] `OPERATOR`
  * [ ] `VIEWER`
* [ ] Proteger rutas con JWT.
* [ ] Proteger rutas por rol.

### Solicitud que me puedes hacer

```txt
Ayúdame a crear autenticación JWT con roles en NestJS usando Prisma.
```

---

# Etapa 3 — Clientes

* [ ] Crear módulo `clients`.
* [ ] Crear controlador `clients`.
* [ ] Crear servicio `clients`.
* [ ] Crear DTO `CreateClientDto`.
* [ ] Crear DTO `UpdateClientDto`.
* [ ] Endpoint para crear cliente.
* [ ] Endpoint para listar clientes.
* [ ] Endpoint para ver cliente por ID.
* [ ] Endpoint para editar cliente.
* [ ] Endpoint para activar/inactivar cliente.
* [ ] Endpoint para ver perfil del cliente.
* [ ] Endpoint para ver ledger del cliente.
* [ ] Endpoint para ver balance del cliente.

### Solicitud que me puedes hacer

```txt
Ayúdame a crear el módulo de clientes en NestJS con Prisma.
```

---

# Etapa 4 — Proveedores

* [ ] Crear módulo `providers`.
* [ ] Crear controlador `providers`.
* [ ] Crear servicio `providers`.
* [ ] Crear DTO `CreateProviderDto`.
* [ ] Crear DTO `UpdateProviderDto`.
* [ ] Endpoint para crear proveedor.
* [ ] Endpoint para listar proveedores.
* [ ] Endpoint para ver proveedor por ID.
* [ ] Endpoint para editar proveedor.
* [ ] Endpoint para activar/inactivar proveedor.
* [ ] Endpoint para ver perfil del proveedor.
* [ ] Endpoint para ver ledger del proveedor.
* [ ] Endpoint para ver balance del proveedor.

### Solicitud que me puedes hacer

```txt
Ayúdame a crear el módulo de proveedores en NestJS con Prisma.
```

---

# Etapa 5 — Cuentas propias

## 5.1 Cuentas base COP

* [ ] Crear cuentas base:

  * [ ] Caja.
  * [ ] Oficina.
  * [ ] Bancolombia.

Estas cuentas deben tener:

```txt
category = BASE_COP
currency = COP
```

## 5.2 Cuentas operativas

* [ ] Crear cuentas operativas:

  * [ ] Minoristas — BS.
  * [ ] Mayoristas — BS.
  * [ ] Zelle — USD.
  * [ ] Binance — USDT.

Estas cuentas deben tener:

```txt
category = OPERATIVE
```

## 5.3 Backend de cuentas

* [ ] Crear módulo `accounts`.
* [ ] Crear controlador `accounts`.
* [ ] Crear servicio `accounts`.
* [ ] Crear DTO `CreateAccountDto`.
* [ ] Crear DTO `UpdateAccountDto`.
* [ ] Endpoint para crear cuenta.
* [ ] Endpoint para listar todas las cuentas.
* [ ] Endpoint para listar cuentas base COP.
* [ ] Endpoint para listar cuentas operativas.
* [ ] Endpoint para ver cuenta por ID.
* [ ] Endpoint para editar cuenta.
* [ ] Endpoint para ver movimientos de cuenta.
* [ ] Validar que `BASE_COP` solo use moneda `COP`.
* [ ] Validar que `OPERATIVE` use `BS`, `USD` o `USDT`.

### Solicitud que me puedes hacer

```txt
Ayúdame a crear el módulo de cuentas propias separando cuentas BASE_COP y OPERATIVE.
```

---

# Etapa 6 — Ledger / libro de movimientos

* [ ] Crear módulo `ledger`.
* [ ] Crear lógica para registrar movimientos de cliente.
* [ ] Crear lógica para registrar movimientos de proveedor.
* [ ] Crear lógica para registrar movimientos de cuenta.
* [ ] Crear función para calcular saldo de cliente.
* [ ] Crear función para calcular saldo de proveedor.
* [ ] Crear función para consultar historial de cliente.
* [ ] Crear función para consultar historial de proveedor.
* [ ] Crear función para consultar movimientos de cuenta.

### Reglas principales

```txt
Débito cliente = aumenta deuda del cliente.
Crédito cliente = reduce deuda del cliente.

Débito proveedor = aumenta deuda al proveedor.
Crédito proveedor = reduce deuda al proveedor.
```

### Solicitud que me puedes hacer

```txt
Ayúdame a crear el módulo ledger para manejar balances de clientes y proveedores.
```

---

# Etapa 7 — Operaciones

## 7.1 Tipos de operación

* [ ] Implementar venta desde cuenta propia:

  * [ ] `SELL_FROM_OWN_ACCOUNT`

* [ ] Implementar compra hacia cuenta propia:

  * [ ] `BUY_TO_OWN_ACCOUNT`

* [ ] Implementar operación directa:

  * [ ] `DIRECT_OPERATION`

## 7.2 Módulo de operaciones

* [ ] Crear módulo `operations`.
* [ ] Crear controlador `operations`.
* [ ] Crear servicio `operations`.
* [ ] Crear DTO `CreateOperationDto`.
* [ ] Crear DTO `UpdateOperationDto`.
* [ ] Crear endpoint para crear operación.
* [ ] Crear endpoint para listar operaciones.
* [ ] Crear endpoint para ver operación por ID.
* [ ] Crear endpoint para anular operación.

## 7.3 Cálculos

* [ ] Calcular `buyTotalCop`.
* [ ] Calcular `sellTotalCop`.
* [ ] Calcular `profitCop`.

Fórmulas:

```txt
buyTotalCop = transactionAmount × buyRate
sellTotalCop = transactionAmount × sellRate
profitCop = sellTotalCop - buyTotalCop
```

## 7.4 Movimientos según tipo

### Venta desde cuenta propia

* [ ] Disminuir cuenta operativa.
* [ ] Crear movimiento de cuenta `OPERATION_OUT`.
* [ ] Crear débito en ledger del cliente.

### Compra hacia cuenta propia

* [ ] Aumentar cuenta operativa.
* [ ] Crear movimiento de cuenta `OPERATION_IN`.
* [ ] Crear débito en ledger del proveedor.

### Operación directa

* [ ] No mover cuenta propia.
* [ ] Crear débito en ledger del cliente.
* [ ] Crear débito en ledger del proveedor.
* [ ] Registrar utilidad.

### Solicitud que me puedes hacer

```txt
Ayúdame a implementar el módulo de operaciones con los tres tipos: venta, compra y operación directa.
```

---

# Etapa 8 — Entradas / abonos

## 8.1 Tipos de entrada

* [ ] Abono normal a cuenta propia:

  * [ ] `TO_OWN_ACCOUNT`

* [ ] Abono directo a proveedor:

  * [ ] `DIRECT_TO_PROVIDER`

## 8.2 Módulo de entradas

* [ ] Crear módulo `entries`.
* [ ] Crear controlador `entries`.
* [ ] Crear servicio `entries`.
* [ ] Crear DTO `CreateEntryDto`.
* [ ] Crear endpoint para registrar abono.
* [ ] Crear endpoint para listar abonos.
* [ ] Crear endpoint para ver abono por ID.

## 8.3 Abono normal

* [ ] Validar cliente.
* [ ] Validar cuenta base COP.
* [ ] Aumentar saldo de cuenta.
* [ ] Crear movimiento de cuenta `INCOME`.
* [ ] Crear crédito en ledger del cliente.

## 8.4 Abono directo a proveedor

* [ ] Validar cliente.
* [ ] Validar proveedor.
* [ ] No mover cuentas propias.
* [ ] Crear crédito en ledger del cliente.
* [ ] Crear crédito en ledger del proveedor.

### Solicitud que me puedes hacer

```txt
Ayúdame a crear el módulo de entradas y abonos con TO_OWN_ACCOUNT y DIRECT_TO_PROVIDER.
```

---

# Etapa 9 — Cartera

* [ ] Crear módulo `portfolio`.
* [ ] Crear endpoint cartera por cobrar.
* [ ] Crear endpoint cartera por pagar.
* [ ] Crear endpoint saldos a favor de clientes.
* [ ] Crear endpoint resumen general de cartera.

## Reglas

```txt
Cliente con saldo > 0 = cartera por cobrar.
Cliente con saldo < 0 = saldo a favor del cliente.

Proveedor con saldo > 0 = cartera por pagar.
Proveedor con saldo < 0 = saldo a favor del negocio o proveedor.
```

### Solicitud que me puedes hacer

```txt
Ayúdame a crear el módulo de cartera por cobrar y cartera por pagar usando los ledgers.
```

---

# Etapa 10 — Perfil de cliente

* [ ] Crear endpoint `GET /clients/:id/profile`.
* [ ] Mostrar datos del cliente.
* [ ] Mostrar saldo actual.
* [ ] Mostrar total operaciones.
* [ ] Mostrar total abonado.
* [ ] Mostrar saldo pendiente o a favor.
* [ ] Mostrar historial de movimientos.
* [ ] Permitir filtro por fecha.
* [ ] Permitir filtro por moneda.
* [ ] Permitir filtro por tipo de movimiento.

### Solicitud que me puedes hacer

```txt
Ayúdame a crear el endpoint de perfil del cliente con balance e historial.
```

---

# Etapa 11 — Perfil de proveedor

* [ ] Crear endpoint `GET /providers/:id/profile`.
* [ ] Mostrar datos del proveedor.
* [ ] Mostrar saldo actual.
* [ ] Mostrar total operaciones.
* [ ] Mostrar total pagado.
* [ ] Mostrar saldo por pagar.
* [ ] Mostrar historial de movimientos.
* [ ] Permitir filtro por fecha.
* [ ] Permitir filtro por moneda.
* [ ] Permitir filtro por tipo de movimiento.

### Solicitud que me puedes hacer

```txt
Ayúdame a crear el endpoint de perfil del proveedor con balance e historial.
```

---

# Etapa 12 — Dashboard

* [ ] Crear módulo `dashboard`.
* [ ] Crear endpoint `GET /dashboard`.
* [ ] Mostrar ganancias del día.
* [ ] Mostrar operaciones del día.
* [ ] Mostrar abonos del día.
* [ ] Mostrar cartera por cobrar.
* [ ] Mostrar cartera por pagar.
* [ ] Mostrar saldos de cuentas base COP.
* [ ] Mostrar saldos de cuentas operativas.
* [ ] Mostrar volumen transado por moneda.
* [ ] Mostrar últimas operaciones.
* [ ] Mostrar últimos abonos.

### Solicitud que me puedes hacer

```txt
Ayúdame a crear el endpoint dashboard con ganancias del día, cartera y saldos.
```

---

# Etapa 13 — Reportes

## 13.1 Reporte por cliente

* [ ] Crear endpoint `GET /reports/clients/:id`.
* [ ] Filtro por fecha desde.
* [ ] Filtro por fecha hasta.
* [ ] Filtro por moneda de transacción.
* [ ] Filtro por tipo de movimiento.
* [ ] Calcular saldo inicial.
* [ ] Calcular total operaciones.
* [ ] Calcular total abonado.
* [ ] Calcular saldo final.
* [ ] Calcular utilidad.
* [ ] Generar historial.
* [ ] Generar texto copiable para WhatsApp.

## 13.2 Reporte por proveedor

* [ ] Crear endpoint `GET /reports/providers/:id`.
* [ ] Calcular saldo inicial.
* [ ] Calcular operaciones.
* [ ] Calcular pagos.
* [ ] Calcular saldo final.
* [ ] Generar historial.
* [ ] Generar texto copiable.

## 13.3 Reporte general

* [ ] Crear endpoint `GET /reports/general`.
* [ ] Mostrar operaciones por fecha.
* [ ] Mostrar utilidad total.
* [ ] Mostrar abonos.
* [ ] Mostrar cartera.
* [ ] Mostrar saldos de cuentas.
* [ ] Mostrar volumen por moneda.

### Solicitud que me puedes hacer

```txt
Ayúdame a crear los endpoints de reportes por cliente, proveedor y general.
```

---

# Etapa 14 — PDF y texto para WhatsApp

* [ ] Definir librería para PDF.
* [ ] Crear servicio `PdfService`.
* [ ] Crear reporte PDF de cliente.
* [ ] Crear reporte PDF de proveedor.
* [ ] Crear reporte PDF general.
* [ ] Crear endpoint para texto copiable de cliente.
* [ ] Crear endpoint para texto copiable de proveedor.
* [ ] Crear endpoint para texto copiable general.

### Solicitud que me puedes hacer

```txt
Ayúdame a generar reportes PDF y textos copiables para WhatsApp desde NestJS.
```

---

# Etapa 15 — Cancelaciones y reversos

* [ ] Crear lógica para cancelar operación.
* [ ] No borrar operación.
* [ ] Cambiar estado a `CANCELLED`.
* [ ] Crear movimiento inverso en cuenta si aplica.
* [ ] Crear reverso en ledger del cliente si aplica.
* [ ] Crear reverso en ledger del proveedor si aplica.
* [ ] Evitar cancelar dos veces la misma operación.

### Solicitud que me puedes hacer

```txt
Ayúdame a implementar cancelación de operaciones con reversos en cuentas y ledgers.
```

---

# Etapa 16 — Pruebas funcionales

## Flujo 1 — Venta desde cuenta propia

* [ ] Crear cliente Carlos.
* [ ] Crear cuenta Minoristas en BS.
* [ ] Crear operación de venta de BS.
* [ ] Verificar que Minoristas disminuye.
* [ ] Verificar que Carlos queda debiendo COP.
* [ ] Registrar abono a Oficina.
* [ ] Verificar que Oficina aumenta.
* [ ] Verificar que saldo de Carlos baja.

## Flujo 2 — Compra hacia cuenta propia

* [ ] Crear proveedor Pedro.
* [ ] Crear cuenta Mayoristas en BS.
* [ ] Crear operación de compra de BS.
* [ ] Verificar que Mayoristas aumenta.
* [ ] Verificar que Pedro queda por pagar.

## Flujo 3 — Operación directa

* [ ] Crear cliente Carlos.
* [ ] Crear proveedor Pedro.
* [ ] Crear operación directa.
* [ ] Verificar que no se mueve ninguna cuenta propia.
* [ ] Verificar que Carlos queda por cobrar.
* [ ] Verificar que Pedro queda por pagar.

## Flujo 4 — Abono directo a proveedor

* [ ] Registrar abono directo de Carlos a Pedro.
* [ ] Verificar que baja saldo de Carlos.
* [ ] Verificar que baja saldo de Pedro.
* [ ] Verificar que no cambia Caja, Oficina ni Bancolombia.

### Solicitud que me puedes hacer

```txt
Ayúdame a crear casos de prueba para validar los flujos principales del sistema.
```

---

# Etapa 17 — Orden de trabajo recomendado

## Semana / bloque 1

* [ ] Prisma.
* [ ] Auth.
* [ ] Users.
* [ ] Roles.
* [ ] Clients.
* [ ] Providers.

## Semana / bloque 2

* [ ] Accounts.
* [ ] Account movements.
* [ ] Ledger base.
* [ ] Balances.

## Semana / bloque 3

* [ ] Operations.
* [ ] Venta desde cuenta propia.
* [ ] Compra hacia cuenta propia.
* [ ] Operación directa.

## Semana / bloque 4

* [ ] Entries.
* [ ] Abonos.
* [ ] Abono directo a proveedor.
* [ ] Cartera.
* [ ] Perfil cliente.
* [ ] Perfil proveedor.

## Semana / bloque 5

* [ ] Dashboard.
* [ ] Reportes.
* [ ] PDF.
* [ ] Texto WhatsApp.
* [ ] Pruebas.
* [ ] Ajustes finales.

---

# Comandos de ayuda que puedes pedirme durante el desarrollo

```txt
Ayúdame a crear el schema.prisma.
```

```txt
Revisa este modelo de Prisma y dime si está bien.
```

```txt
Ayúdame a crear el módulo de cuentas.
```

```txt
Ayúdame a implementar esta regla de negocio.
```

```txt
Este es mi service, revísalo.
```

```txt
Tengo este error en Prisma/NestJS, ayúdame a resolverlo.
```

```txt
Ayúdame a probar este endpoint con Postman.
```

```txt
Ayúdame a crear un DTO con class-validator.
```

```txt
Ayúdame a crear el endpoint de balance del cliente.
```

```txt
Ayúdame a crear una transacción Prisma para operación + ledger + cuenta.
```

```txt
Ayúdame a crear los reportes.
```
