# UrbanFlow — Sistema de Gestión de Fraccionamiento

Sistema web para gestión integral de fraccionamientos residenciales cerrados.

**Equipo:** Miroslava Moheno · Joaquín Carmona · Jorge Ruiz
**Stack:** React + Node.js/Express + PostgreSQL
**Periodo:** Mayo – Julio 2026

---

## Módulos

| Módulo | Responsable |
|--------|------------|
| Auth + Roles | Miroslava Moheno |
| Lotes + Mapa SVG Interactivo | Miroslava Moheno |
| Reserva de Áreas Comunes | Miroslava Moheno |
| Propietarios + Documentos | Joaquín Carmona |
| Visitas + Caseta + QR | Joaquín Carmona |
| Comunicados Email + WhatsApp | Joaquín Carmona |
| Cuotas + Pagos + PDF Recibos | Jorge Ruiz |
| Mantenimiento + Tickets | Jorge Ruiz |
| Portal del Propietario | Jorge Ruiz |

---

## Estructura del Proyecto

```
UrbanFlow/
├── client/          # React 18 + Vite + TailwindCSS
│   └── src/
│       ├── api/         # axios instances por módulo
│       ├── components/  # componentes reutilizables
│       ├── hooks/       # custom hooks
│       └── pages/       # vistas por rol: admin, caseta, propietario, tecnico
├── server/          # Node.js + Express
│   ├── modules/     # auth, fraccionamiento, owners, visits, payments, maintenance, comms, reservations
│   └── shared/      # middleware (auth, roles, errors) + db (pool, migrations)
└── docs/            # diseño, schema DB, plan de proyecto
```

---

## Setup Local

### Requisitos
- Node.js 20+
- Docker + Docker Compose

### Instalación

```bash
# 1. Clonar repo
git clone https://github.com/JoaquinCar/UrbanFlow.git
cd UrbanFlow

# 2. Instalar dependencias (desde root — workspaces instala client + server)
npm install

# 3. Configurar variables de entorno
cp server/.env.example server/.env
cp client/.env.example client/.env
# Las credenciales de DB ya coinciden con docker-compose.yml
```

> **Windows/PowerShell:** usa `Copy-Item server\.env.example server\.env` en lugar de `cp`

```bash
# 4. Abrir Docker Desktop y esperar que esté listo, luego:
docker compose up -d
# Verifica que esté healthy:
docker ps

# 5. Crear tablas
psql -U postgres -c "CREATE DATABASE urbanflow;"
cd server && npm run migrate

# 6. Cargar datos de prueba
npm run seed

# 7. Volver al root e iniciar en desarrollo
cd ..
```

```bash
# Terminal 1:
npm run dev:server   # servidor en http://localhost:3000
# Terminal 2:
npm run dev:client   # frontend en http://localhost:5173
```

> **Nota — postgres local en conflicto:** Si tienes PostgreSQL instalado localmente, puede estar usando el puerto 5432 y bloquear la conexión al contenedor Docker. Detén el servicio local antes de levantar el proyecto:
> - Windows: `Stop-Service -Name "postgresql-x64-17"` (como Administrador)
> - O desde Servicios de Windows: busca `postgresql-x64-17` → Detener

> **Nota — volumen viejo:** Si el contenedor existía con datos de otra instalación:
> ```bash
> docker compose down -v   # elimina volúmenes — borra todos los datos
> docker compose up -d
> cd server
> npm run migrate
> npm run seed
> ```

### Usuarios de prueba (password: `UrbanFlow2026!`)

| Email | Rol |
|-------|-----|
| admin@urbanflow.test | Admin |
| vigilante@urbanflow.test | Vigilante |
| propietario@urbanflow.test | Propietario |
| tecnico@urbanflow.test | Técnico |

### pgAdmin (GUI para la DB)
- URL: http://localhost:5050
- Email: `admin@urbanflow.test`
- Password: `admin`
- Servidor: host `postgres`, port `5432`, DB `urbanflow`, user `postgres`, password `urbanflow2026`

### Variables de entorno requeridas

Ver `server/.env.example` y `client/.env.example`

---

## API — Endpoints implementados

### Auth (`/api/auth`)

| Método | Endpoint | Auth requerida | Descripción |
|--------|----------|---------------|-------------|
| POST | `/api/auth/login` | No | Login. Body: `{ email, password }`. Retorna `{ accessToken, user }` + cookie `refreshToken` (httpOnly) |
| POST | `/api/auth/refresh` | No | Renueva el access token usando la cookie `refreshToken`. Retorna `{ accessToken }` |
| POST | `/api/auth/logout` | No | Cierra sesión. Invalida refresh token en DB y limpia cookie |
| GET | `/api/auth/me` | Bearer token | Retorna datos del usuario autenticado |

**Uso desde el frontend:**
- Guarda el `accessToken` en memoria (no en localStorage)
- El `refreshToken` viaja solo en cookie httpOnly — el browser lo envía automáticamente
- En cada request protegida: header `Authorization: Bearer <accessToken>`
- Si el servidor retorna `401`, llama a `/api/auth/refresh` para obtener nuevo token
- El objeto `user` del login contiene: `id`, `nombre`, `email`, `rol`, `fraccionamiento_id`

**Roles disponibles:** `admin` | `vigilante` | `propietario` | `tecnico`

---

## Documentación

- [Schema de Base de Datos](docs/db-schema.md)
- [Plan de Proyecto](docs/plan-proyecto.md)
- [Spec de Diseño](docs/superpowers/specs/2026-05-08-gestion-fraccionamiento-design.md)

---

## Roles de Usuario

| Rol | Acceso |
|-----|--------|
| **Admin** | Dashboard completo, lotes, propietarios, cuotas, comunicados |
| **Vigilante** | Caseta — registro entrada/salida, QR, notificaciones |
| **Propietario** | Portal propio — estado de cuenta, pagos, incidencias, reservas |
| **Técnico** | Tickets de mantenimiento asignados |
