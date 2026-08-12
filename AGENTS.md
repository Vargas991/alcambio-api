# Repository Guidelines

## Project Structure & Module Organization

This repository is a NestJS backend for AlCambio.

Application code lives in `src/`, organized by domain modules such as:

- auth
- clientes
- cuentas
- dashboard
- operaciones
- entradas
- salidas
- usuarios

Shared helpers belong in `src/common`.

Prisma integration is under:

src/prisma

Database schema, migrations, and seed data live in:

prisma/

Generated Prisma client code is written to:

generated/

End-to-end tests are in:

test/

Unit tests should live beside source files as:

*.spec.ts

Compiled output goes to:

dist/

---

## Build, Test, and Development Commands

- `npm run start:dev`: run the NestJS API in watch mode.
- `npm run build`: compile the project into `dist/`.
- `npm run start:prod`: run the compiled app.
- `npm run lint`: run ESLint.
- `npm run format`: run Prettier.
- `npm test`: run Jest unit tests.
- `npm run test:e2e`: run e2e tests.
- `npm run test:cov`: run Jest with coverage.

---

## Coding Style & Naming Conventions

Use TypeScript and NestJS conventions.

Keep modules, controllers, services, and DTOs grouped by feature.

Prefer existing helpers and patterns before creating new abstractions.

Use Spanish domain terminology such as:

- operacion
- cuenta
- moneda
- cliente
- entrada
- salida

Use Prettier conventions:

- single quotes
- trailing commas

Do not modify unrelated business logic.

Do not modify currency calculations, debt rules, account balances, ledger behavior, or operation calculations unless explicitly requested.

---

# Timezone Policy

The organization timezone is the source of truth for business-facing date and time interpretation.

Timezone belongs to:

`ConfiguracionOrganizacion.zonaHoraria`

Use IANA timezone identifiers.

Initially supported values may include:

- `America/Caracas`
- `America/Bogota`

Do not use fixed UTC offsets as business configuration.

Never store values such as:

- `UTC-4`
- `UTC-5`
- `-04:00`
- `-05:00`

as the application's timezone source of truth.

---

## Timestamp Storage

Fields such as:

- `creadoEn`
- `actualizadoEn`

must remain real timestamps stored in UTC.

Prisma/database timestamps must NOT be shifted manually before persistence.

Do not modify timestamps using the organization's timezone before saving them.

Example stored timestamp:

`2026-08-11T20:32:00.000Z`

That same timestamp should display as:

- `4:32 p. m.` in `America/Caracas`
- `3:32 p. m.` in `America/Bogota`

The stored value must remain unchanged.

---

## Organization Timezone

Add or use:

```prisma
zonaHoraria String @default("America/Caracas")