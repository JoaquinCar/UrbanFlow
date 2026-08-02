# UrbanFlow — Sistema de Gestión de Fraccionamiento

Sistema web para la gestión integral de fraccionamientos residenciales cerrados.

**Equipo:** Miroslava Moheno · Joaquín Carmona · Jorge Ruiz
**Stack:** React 18 + Vite · Node.js/Express · PostgreSQL
**Periodo:** Mayo – Julio 2026

---

## Módulos

| # | Módulo | Responsable | Estado |
|---|--------|-------------|--------|
| 1 | Auth + Roles | Miroslava Moheno | ✅ |
| 2 | Lotes + Mapa SVG interactivo | Miroslava Moheno | ✅ |
| 3 | Propietarios + Documentos | Joaquín Carmona | ✅ |
| 4 | Visitas + Caseta + QR + Socket.io | Joaquín Carmona | ✅ |
| 5 | Cuotas + Pagos + PDF + MercadoPago | Jorge Ruiz | ✅ |
| 6 | Mantenimiento + Tickets | Jorge Ruiz | ✅ |
| 7 | Comunicados Email + WhatsApp | Joaquín Carmona | ✅ |
| 8 | Reserva de áreas comunes | Miroslava Moheno | ✅ |
| 9 | Portal del Propietario | Jorge Ruiz | ✅ |
| 10 | Dashboard Admin + métricas | Todos | ✅ |
| 11 | API Docs (Swagger/OpenAPI) | Jorge Ruiz | ✅ |

---

## Estructura del proyecto

```
UrbanFlow/
├── client/                    React 18 + Vite
│   ├── scripts/               generador del plano SVG
│   └── src/
│       ├── api/               una capa por módulo (auth, lotes, pagos…)
│       ├── Components/        componentes reutilizables
│       ├── config/            nav.js — navegación por rol
│       ├── context/           AuthContext, ToastContext, SocketContext
│       ├── hooks/             useFetch
│       ├── lib/               utilidades (apiError)
│       ├── Routes/            tabla de rutas y guards
│       ├── screens/           pantallas: admin/, caseta/, portal/ y comunes
│       └── styles/            hojas por área
├── server/                    Node.js + Express
│   ├── modules/               auth, fraccionamiento, owners, visits,
│   │                          payments, maintenance, comms, reservations
│   ├── scripts/               smoke.js — pruebas HTTP de extremo a extremo
│   └── shared/
│       ├── db/                pool, migraciones, seed
│       ├── jobs/              cron de cuotas mensuales
│       ├── middleware/        auth, roles, errores, uploads
│       ├── services/          email (Nodemailer), whatsapp (Meta)
│       └── utils/             errores, qr, csv, realtime
└── docs/                      esquema, decisiones, pruebas y un .md por módulo
```

---

## Puesta en marcha

### Requisitos
- Node.js 20 o superior
- Docker + Docker Compose

### Instalación

```bash
git clone https://github.com/JoaquinCar/UrbanFlow.git
cd UrbanFlow

# 1. Dependencias (workspaces: instala client y server)
npm install

# 2. Variables de entorno
cp server/.env.example server/.env
cp client/.env.example client/.env
```

> **Windows/PowerShell:** usa `Copy-Item server\.env.example server\.env`

> **Node 22+ bloquea los install scripts.** Si falla `bcrypt` o Vite al
> arrancar, ejecuta `npm approve-scripts bcrypt esbuild` y repite
> `npm install`. Ambos compilan binarios nativos y los necesitan.

```bash
# 3. Base de datos
docker compose up -d
docker ps                     # espera a que urbanflow-db esté "healthy"

# 4. Tablas y datos de prueba
npm run migrate --workspace=server
npm run seed --workspace=server
```

Los dos comandos son **idempotentes**: se pueden repetir sin romper nada ni
duplicar datos.

```bash
# 5. Arrancar (dos terminales)
npm run dev:server            # API en http://localhost:3000
npm run dev:client            # App en http://localhost:5173
```

### Problemas frecuentes

**PostgreSQL local ocupando el puerto 5432.** Detén el servicio antes de
levantar Docker:
- Windows: `Stop-Service -Name "postgresql-x64-17"` como Administrador
- macOS: `brew services stop postgresql`

**Base de datos de una instalación anterior:**
```bash
docker compose down -v        # elimina los volúmenes: borra todos los datos
docker compose up -d
npm run migrate --workspace=server && npm run seed --workspace=server
```

---

## Usuarios de prueba

Contraseña para todos: **`UrbanFlow2026!`**

| Email | Rol | Aterriza en |
|-------|-----|-------------|
| `admin@urbanflow.test` | Admin | Panel de administración |
| `vigilante@urbanflow.test` | Vigilante | Caseta |
| `propietario@urbanflow.test` | Propietario | Portal del propietario |
| `tecnico@urbanflow.test` | Técnico | Sus asignaciones |

También existen `propietario2..10@urbanflow.test`, `vigilante2@`, `tecnico2@` y
`admin2@urbanflow.test` (este último en el **segundo** fraccionamiento, útil
para comprobar el aislamiento de datos entre fraccionamientos).

### Qué trae el seed

2 fraccionamientos · 40 lotes · 10 propietarios · 6 meses de cuotas con
3 morosos · 45 visitas de los últimos 30 días · 6 tickets · 8 áreas comunes ·
5 reservaciones.

---

## Pruebas

```bash
npm run dev:server                                # en una terminal
npm run smoke --workspace=server                  # en otra
npm run smoke --workspace=server -- --only=visits # una sola suite
```

**167 comprobaciones** contra el servidor real y la base en Docker. Suites:
`auth`, `fraccionamiento`, `dashboard`, `owners`, `visits`, `payments`,
`maintenance`, `comms`, `reservations`.

### Colección de Bruno

Los 85 endpoints en [`bruno/`](bruno/), listos para abrir con
[Bruno](https://www.usebruno.com) y ejecutar de arriba abajo: los logins guardan
los tokens y cada petición encadena los datos que necesita la siguiente.

Ver [bruno/README.md](bruno/README.md).

### Verificación en navegador

Además hay scripts que manejan un navegador real y comprueban lo que la API no
puede ver: que la pantalla muestre de verdad lo que devuelve el servidor.

```bash
npm install --no-save puppeteer-core
node client/scripts/e2e/verificar-caseta.mjs
```

Ver [client/scripts/e2e/README.md](client/scripts/e2e/README.md) para la lista
completa y cómo apuntar al navegador instalado.

Para el recorrido manual por rol, ver [docs/pruebas-e2e.md](docs/pruebas-e2e.md).

---

## API

Todas las rutas cuelgan de `/api`. Salvo las indicadas, requieren
`Authorization: Bearer <accessToken>`.

### Documentación interactiva (Swagger/OpenAPI)

La API incluye documentación interactiva generada con **Swagger UI**:

| Recurso | URL |
|---|---|
| UI interactiva | `http://localhost:3000/api/docs` |
| Spec JSON | `http://localhost:3000/api/docs.json` |

**79 endpoints documentados** en 8 módulos: Auth, Pagos, Propietarios, Visitas,
Mantenimiento, Comunicados, Reservaciones y Fraccionamiento.

Para agregar o modificar documentación, edita los bloques `@swagger` en cada
archivo `*.routes.js` dentro de `server/modules/`. La configuración base de
OpenAPI (schemas compartidos, servers, security) está en `server/swagger.js`.

### Autenticación — `/api/auth`

| Método | Ruta | Auth | Descripción |
|--------|------|------|-------------|
| POST | `/login` | No | `{ email, password }` → `{ accessToken, user }` + cookie `refreshToken` |
| POST | `/refresh` | Cookie | Renueva el access token |
| POST | `/logout` | No | Invalida el refresh token |
| GET | `/me` | Sí | Usuario autenticado |
| POST | `/change-password` | Sí | `{ passwordActual, passwordNueva }` |

**Cómo consumirla desde el cliente:** el `accessToken` se guarda **en memoria**,
nunca en `localStorage`. El `refreshToken` viaja en una cookie `httpOnly` que el
navegador manda solo. Ante un `401` se llama a `/auth/refresh` y se reintenta.
Ya está implementado en `client/src/api/client.js`, incluida la cola que evita
que varias peticiones caducando a la vez disparen refresh en paralelo.

### Lotes y mapa — `/api/fraccionamiento`

| Método | Ruta | Rol |
|--------|------|-----|
| GET / PUT | `/` | todos / admin |
| GET | `/dashboard` | admin |
| GET | `/mapa`, `/etapas` | todos |
| GET | `/lotes`, `/lotes/:id` | todos |
| POST / PUT / DELETE | `/lotes`, `/lotes/:id` | admin |
| PUT | `/lotes/:id/propietario` | admin |

### Propietarios — `/api/propietarios`

| Método | Ruta | Rol |
|--------|------|-----|
| GET | `/` | admin, vigilante |
| GET | `/me` | propietario |
| GET | `/:id` | admin, vigilante, propietario (suyo) |
| POST / PUT / DELETE | `/`, `/:id` | admin |
| GET | `/:id/qr` (`?format=png`) | admin, propietario (suyo) |
| POST | `/:id/qr/rotar` | admin |
| GET / POST | `/:id/documentos` | según rol |
| GET / DELETE | `/documentos/:docId` | según rol |

### Visitas — `/api/visitas`

| Método | Ruta | Rol |
|--------|------|-----|
| POST | `/entrada`, `/qr` | vigilante, admin |
| PUT | `/:id/salida` | vigilante, admin |
| GET | `/activas` | vigilante, admin |
| GET | `/bitacora`, `/bitacora.csv` | admin, vigilante |
| GET | `/mis-visitas` | propietario |

### Cuotas y pagos — `/api/pagos`

| Método | Ruta | Rol |
|--------|------|-----|
| POST | `/webhook` | **ninguno** (firma HMAC de MercadoPago) |
| GET | `/cuotas`, `/cuotas/:propietarioId`, `/morosos`, `/` | admin |
| GET | `/cuotas/mias` | propietario |
| POST | `/cuotas`, `/cuotas/generar`, `/manual` | admin |
| POST | `/checkout` | propietario, admin |
| GET | `/:id/pdf` | admin, propietario (suyo) |

### Mantenimiento — `/api/mantenimiento`

| Método | Ruta | Rol |
|--------|------|-----|
| GET | `/`, `/tecnicos` | admin |
| GET | `/mios` | propietario, técnico |
| POST | `/` | propietario, admin, vigilante |
| PUT | `/:id/asignar` | admin |
| PUT | `/:id/estado` | admin, técnico (asignado) |

### Comunicados — `/api/comunicados`

| Método | Ruta | Rol |
|--------|------|-----|
| GET | `/webhook` | **ninguno** (verificación de Meta) |
| GET | `/`, `/:id`, `/canales`, `/destinatarios` | admin |
| POST | `/` | admin |
| GET | `/mios` | todos |

### Reservaciones — `/api/reservaciones`

| Método | Ruta | Rol |
|--------|------|-----|
| GET | `/areas`, `/areas/:id/disponibilidad` | todos |
| POST / PUT / DELETE | `/areas`, `/areas/:id` | admin |
| GET | `/mias` | propietario |
| GET | `/` | admin |
| POST | `/` | propietario, admin |
| PUT | `/:id/cancelar` | admin, propietario (dueño) |

**Roles:** `admin` · `vigilante` · `propietario` · `tecnico`
**Formato de error:** siempre `{ "error": "mensaje en español" }`

---

## Integraciones externas

Los tres servicios están implementados contra sus APIs reales. Sin credenciales
responden con un error explícito en lugar de simular éxito.

| Servicio | Variables | Sin configurar |
|---|---|---|
| MercadoPago | `MP_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET` | El checkout responde `500` diciendo qué falta |
| Correo | `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS` | El comunicado se guarda; el resultado marca el canal como fallido |
| WhatsApp | `META_PHONE_NUMBER_ID`, `META_ACCESS_TOKEN` | Igual que el correo |
| Swagger UI | — | Siempre disponible en `/api/docs` |

**Los webhooks necesitan una URL pública.** En local: `ngrok http 3000` y
`PUBLIC_URL` con la URL que devuelva.

> ⚠️ **WhatsApp:** Meta solo entrega mensajes de texto libre dentro de una
> ventana de 24 h de atención al cliente. Un comunicado en frío **necesita una
> plantilla aprobada** (`META_TEMPLATE_NAME`); sin ella la API responde `200` y
> el mensaje **nunca llega**. Detalle en
> [docs/modulos/06-comunicados.md](docs/modulos/06-comunicados.md).

---

## pgAdmin

- URL: http://localhost:5050 · `admin@urbanflow.mx` / `admin`
- Servidor: host `postgres`, puerto `5432`, BD `urbanflow`, usuario `postgres`,
  contraseña `urbanflow2026`

---

## Documentación

| Documento | Contenido |
|---|---|
| `/api/docs` | Swagger UI — documentación interactiva de la API |
| `/api/docs.json` | Spec OpenAPI 3.0 en JSON |
| [docs/db-schema.md](docs/db-schema.md) | Esquema implementado y las restricciones que impiden datos incoherentes |
| [docs/decisiones.md](docs/decisiones.md) | Decisiones de arquitectura y por qué se tomaron |
| [docs/pruebas-e2e.md](docs/pruebas-e2e.md) | Guion de prueba manual por rol |
| [docs/plan-proyecto.md](docs/plan-proyecto.md) | Plan y cronograma del equipo |
| [bruno/README.md](bruno/README.md) | Colección de Bruno con los 85 endpoints |
| [docs/modulos/](docs/modulos/) | Un documento por módulo, con las decisiones de cada uno |
