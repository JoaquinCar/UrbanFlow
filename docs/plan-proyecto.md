# Plan de Proyecto — Sistema de Gestión de Fraccionamiento

**Fecha de inicio:** 8 de mayo de 2026
**Fecha de entrega:** 31 de julio de 2026
**Duración:** 12 semanas
**Equipo:** 3 integrantes

---

## Tecnologías

| Capa | Tecnología |
|------|-----------|
| Frontend | React 18 + Vite + TailwindCSS + React Router |
| Backend | Node.js + Express.js |
| Base de datos | PostgreSQL |
| Autenticación | JWT + Refresh Tokens |
| Tiempo real | Socket.io (notificaciones caseta) |
| Pagos | MercadoPago API |
| Mensajería | Meta Cloud API (WhatsApp) + Nodemailer (email) |
| PDF | PDFKit |
| QR | qrcode (npm) |
| Mapa | SVG interactivo + React overlay |
| Deploy | Railway / Render |

---

## Equipo e Integrantes

Todos los integrantes participan en los tres roles: **Frontend, Backend y Desarrollo e integración de APIs**.

### Miroslava Moheno — Módulos asignados

| Módulo | Frontend | Backend | API |
|--------|----------|---------|-----|
| **Auth + Roles** | Páginas Login, Register, PrivateRoute por rol | Middleware JWT, refresh tokens, hash de contraseñas | `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout` |
| **Mapa SVG interactivo** | Overlay React sobre SVG, colores por estado de lote, modal detalle al hacer click | Lotes CRUD, vinculación lote↔propietario | `GET/POST/PUT/DELETE /lotes`, `GET /lotes/:id` |
| **Reserva de áreas comunes** | Calendario de disponibilidad, flujo de reserva, confirmación/cancelación | Validación de solapamiento de horarios, lógica de estados | `GET /areas`, `POST /reservaciones`, `PUT /reservaciones/:id` |

### Joaquín Carmona — Módulos asignados

| Módulo | Frontend | Backend | API |
|--------|----------|---------|-----|
| **Propietarios + Documentos** | Formularios registro propietario, upload de documentos, vistas admin | CRUD propietarios, almacenamiento de archivos (multer) | `GET/POST/PUT/DELETE /propietarios`, `POST /documentos` |
| **Visitas + Caseta + QR** | UI caseta de vigilancia, escáner QR, bitácora de accesos, notificaciones push en tiempo real | Registro entrada/salida, generación QR server-side, Socket.io | `POST /visitas/entrada`, `PUT /visitas/:id/salida`, `GET /visitas/bitacora` |
| **Comunicados (Email + WhatsApp)** | Compose de comunicado, selección de canales, historial de envíos | Integración Nodemailer + Meta Cloud API, envío masivo | `POST /comunicados`, `GET /comunicados` |

### Jorge Ruiz — Módulos asignados

| Módulo | Frontend | Backend | API |
|--------|----------|---------|-----|
| **Cuotas + Pagos + PDF** | Estado de cuenta por propietario, flujo pago online, descarga de recibo PDF | Generación automática de cuotas mensuales (cron), integración MercadoPago, PDFKit | `GET /cuotas/:propietarioId`, `POST /pagos/checkout`, `GET /pagos/:id/pdf` |
| **Mantenimiento + Tickets** | Portal de solicitudes, asignación a técnico, seguimiento de estado | CRUD tickets, lógica de asignación y cambio de estado | `GET/POST /mantenimiento`, `PUT /mantenimiento/:id` |
| **Portal Propietario** | Dashboard propietario: resumen lote, cuotas pendientes, tickets abiertos, historial de visitas, reservar área | Integra servicios de cuotas, mantenimiento y visitas | Consume endpoints existentes, sin endpoints nuevos propios |

---

## Cronograma Detallado

### FASE 1 — Fundación (Semanas 1–2)

#### Semana 1 · 8–14 de mayo
**Responsable:** Todos los integrantes

**Actividades:**
- Configuración del monorepo (`/client` React+Vite+Tailwind, `/server` Express)
- Configuración de ESLint, Prettier, variables de entorno
- Setup de PostgreSQL: tablas `fraccionamientos` y `usuarios`
- Estructura base de módulos en Express (`/modules/auth`, `/modules/lots`, etc.)
- Configuración de CORS, error handler global, logger

**Entregable:** Repositorio configurado, aplicación corre localmente, estructura de carpetas definida

---

#### Semana 2 · 15–21 de mayo
**Responsable principal:** Miroslava Moheno · Apoyo: todos

**Actividades:**
- Auth completo: UI login/register, JWT + refresh tokens, middleware de roles
- Seeding inicial: 2 fraccionamientos de prueba, 1 usuario por cada rol
- PrivateRoute en React con redirección según rol
- Rutas protegidas en Express por rol (admin, vigilante, propietario, tecnico)

**Entregable:** Login funcional con 4 roles, rutas protegidas en frontend y backend

---

### FASE 2 — Módulos Core (Semanas 3–6)

#### Semana 3 · 22–28 de mayo
**Responsables:** Miroslava Moheno (A), Joaquín Carmona (B), Jorge Ruiz (C)

**Actividades:**
- **Miroslava:** Lotes CRUD completo (modelo, service, controller, routes) + API `/lotes` + UI tabla admin de lotes
- **Joaquín:** Propietarios CRUD completo + upload documentos (multer) + API `/propietarios` + UI formularios
- **Jorge:** Schema cuotas y pagos en DB + cron job generación cuotas mensuales + UI lista cuotas básica

**Entregable:** CRUD de lotes y propietarios funcional, cuotas generándose automáticamente

---

#### Semana 4 · 29 de mayo – 4 de junio
**Responsables:** Miroslava (A), Joaquín (B), Jorge (C)

**Actividades:**
- **Miroslava:** Mapa SVG interactivo — overlay React, click en lote abre modal con detalle, colores por estado (disponible/proceso/vendido)
- **Joaquín:** UI caseta de vigilancia — formulario registro entrada/salida de visitantes, tabla de visitas del día
- **Jorge:** Vista estado de cuenta propietario — tabla cuotas con estado (pendiente/pagado/vencido), totales

**Entregable:** Mapa interactivo operativo, caseta puede registrar visitas, estado de cuenta visible

---

#### Semana 5 · 5–11 de junio
**Responsables:** Joaquín (B) principal, Miroslava (A), Jorge (C)

**Actividades:**
- **Joaquín:** Generación QR por residente (server-side con `qrcode`), escaneo en UI caseta, Socket.io: notificación push al vigilante cuando se registra entrada
- **Jorge:** Integración MercadoPago — crear preference, recibir webhook, confirmar pago en BD
- **Miroslava:** Vinculación lote↔propietario en UI admin, filtros en mapa por etapa y estado

**Entregable:** QR de residente funcional, pago online con MercadoPago operativo

---

#### Semana 6 · 12–18 de junio
**Responsables:** Jorge (C) principal, Joaquín (B), Miroslava (A)

**Actividades:**
- **Jorge:** Generación automática de PDF recibo con PDFKit post-pago, descarga desde frontend
- **Joaquín:** Bitácora de accesos — tabla con filtros por fecha y tipo, historial mínimo 30 días, exportar CSV
- **Miroslava:** Portal propietario base — dashboard con resumen: lote asignado, saldo pendiente, últimas visitas

**Entregable:** Recibos PDF descargables, bitácora 30 días, portal propietario operativo

---

### FASE 3 — Módulos Secundarios (Semanas 7–10)

#### Semana 7 · 19–25 de junio
**Responsables:** Jorge (C), Joaquín (B), Miroslava (A)

**Actividades:**
- **Jorge:** Módulo mantenimiento — CRUD tickets, UI solicitud de incidencia, asignación a técnico, cambio de estado
- **Joaquín:** Módulo comunicados — compose UI, selección email/WhatsApp, integración Nodemailer
- **Miroslava:** Áreas comunes — CRUD áreas (salón, alberca, cancha), calendario de disponibilidad

**Entregable:** Tickets de mantenimiento, envío de email a residentes, calendario de áreas comunes

---

#### Semana 8 · 26 de junio – 2 de julio
**Responsables:** Joaquín (B), Jorge (C), Miroslava (A)

**Actividades:**
- **Joaquín:** Comunicados WhatsApp — integración Meta Cloud API, envío masivo, manejo de errores y reintentos
- **Jorge:** Portal propietario completo — reportar incidencia, historial tickets propios, reservar área común
- **Miroslava:** Reservaciones — lógica validación solapamiento de horarios, confirmación/cancelación, notificación al propietario

**Entregable:** WhatsApp broadcast funcional, portal propietario completo con todos los flujos

---

#### Semana 9 · 3–9 de julio
**Responsable:** Todos los integrantes

**Actividades:**
- Notificaciones push para vigilante — Web Push API o Socket.io rooms por turno
- Responsive móvil — caseta y portal propietario adaptados a celular
- Dashboard admin — métricas: lotes por estado, cuotas vencidas del mes, visitas del día, tickets abiertos
- Pruebas de flujo completo por cada rol

**Entregable:** App funcional en móvil, dashboard admin con métricas en tiempo real

---

#### Semana 10 · 10–16 de julio
**Responsables:** Jorge (C), Joaquín (B), Miroslava (A)

**Actividades:**
- **Jorge + Joaquín:** Cuotas extraordinarias — UI admin para crear cuota y asignar a uno o todos los propietarios
- **Jorge:** Estado de morosidad — cálculo automático, listado de morosos con monto adeudado para admin
- **Miroslava + Joaquín:** Documentos propietario — vista propietario puede ver y descargar sus propios documentos adjuntos

**Entregable:** Módulo financiero completo (ordinarias + extraordinarias + morosidad)

---

### FASE 4 — Integración, Pruebas y Entrega (Semanas 11–12)

#### Semana 11 · 17–23 de julio
**Responsable:** Todos los integrantes

**Actividades:**
- Pruebas end-to-end de flujos completos por cada rol (admin, vigilante, propietario, técnico)
- Corrección de bugs críticos identificados en pruebas
- Deploy en Railway o Render con variables de entorno de producción
- Configuración de dominio, HTTPS, CORS en producción
- Seed final con datos realistas: 2 fraccionamientos, ~20 lotes, ~10 propietarios

**Entregable:** Aplicación desplegada en URL pública y estable

---

#### Semana 12 · 24–31 de julio
**Responsable:** Todos los integrantes

**Actividades:**
- Documentación técnica — README con instrucciones de setup local, variables de entorno necesarias, descripción de endpoints API
- Preparación de demo — flujo completo por cada rol para presentación
- Entrega del plan de proyecto final
- Presentación del sistema

**Entregable:** README completo, plan de proyecto entregado, demo funcional lista para presentar

---

## Resumen de Entregables

| Fecha | Entregable |
|-------|-----------|
| 21 de mayo | Autenticación completa con 4 roles, estructura base funcional |
| 4 de junio | CRUD lotes y propietarios, caseta operativa, mapa interactivo |
| 18 de junio | QR residentes, pagos MercadoPago, PDF recibos, bitácora 30 días |
| 2 de julio | Todos los módulos secundarios operativos, portal propietario completo |
| 16 de julio | Módulo financiero completo, app responsive en móvil |
| 31 de julio | Deploy en producción, documentación, demo final |

---

## Módulos del Sistema

| # | Módulo | Responsable | Fase |
|---|--------|------------|------|
| 1 | Auth + Roles | Miroslava Moheno | 1 |
| 2 | Lotes + Mapa SVG interactivo | Miroslava Moheno | 2 |
| 3 | Propietarios + Documentos | Joaquín Carmona | 2 |
| 4 | Visitas + Caseta + QR + Socket.io | Joaquín Carmona | 2 |
| 5 | Cuotas + Pagos + MercadoPago + PDF | Jorge Ruiz | 2 |
| 6 | Mantenimiento + Tickets | Jorge Ruiz | 3 |
| 7 | Comunicados Email + WhatsApp | Joaquín Carmona | 3 |
| 8 | Reserva de áreas comunes | Miroslava Moheno | 3 |
| 9 | Portal Propietario (integración) | Jorge Ruiz | 3 |
| 10 | Dashboard Admin | Todos | 3–4 |

---

## Participación por Integrante en los Tres Roles

| Integrante | Frontend | Backend | Integración de APIs |
|-----------|----------|---------|---------------------|
| **Miroslava Moheno** | Login/Register UI, mapa SVG interactivo, calendario reservas, dashboard admin | JWT middleware, lotes service, reservaciones service | `/auth/*`, `/lotes/*`, `/reservaciones/*` |
| **Joaquín Carmona** | Caseta vigilancia, formularios propietarios, UI comunicados, QR scanner | Propietarios service, visitas + Socket.io, multer uploads | `/propietarios/*`, `/visitas/*`, `/comunicados/*` |
| **Jorge Ruiz** | Estado de cuenta, flujo pago online, tickets UI, portal propietario | MercadoPago integration, PDFKit, cron cuotas, mantenimiento service | `/cuotas/*`, `/pagos/*`, `/mantenimiento/*` |
