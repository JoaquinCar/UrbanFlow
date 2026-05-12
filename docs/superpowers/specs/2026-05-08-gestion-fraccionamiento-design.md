# Design Spec — Sistema de Gestión de Fraccionamiento

**Fecha:** 2026-05-08
**Equipo:** Miroslava Moheno, Joaquín Carmona, Jorge Ruiz
**Deadline:** 2026-07-31
**Estado:** Aprobado

---

## 1. Objetivo

Web app para gestión integral de un fraccionamiento residencial cerrado. Operada principalmente por guardia en caseta. Residentes acceden via portal propio. Admin gestiona lotes, finanzas y comunicaciones.

Sistema single-tenant pero con `fraccionamiento_id` en todas las tablas core — preparado para escalar a multi-tenant SaaS sin migración mayor.

---

## 2. Usuarios y Roles

| Rol | Acceso principal |
|-----|-----------------|
| **Admin** | Todo — lotes, propietarios, cuotas, comunicados, dashboard métricas |
| **Vigilante** | Caseta — registro entrada/salida, QR, notificaciones push |
| **Propietario** | Portal propio — estado de cuenta, pagar, reportar incidencia, reservar área |
| **Técnico** | Tickets de mantenimiento asignados a él |

---

## 3. Arquitectura

### Enfoque: Monorepo Feature-First

```
/gestion-fracc
  /client                   ← React 18 + Vite + TailwindCSS
    /src
      /pages                ← una por módulo/rol
      /components
      /hooks
      /api                  ← axios instances centralizadas
  /server                   ← Node.js + Express
    /modules
      /auth
      /fraccionamiento      ← lotes + mapa
      /owners               ← propietarios + documentos
      /visits               ← caseta + QR + bitácora
      /payments             ← cuotas + MercadoPago + PDF
      /maintenance          ← tickets
      /comms                ← email + WhatsApp
      /reservations         ← áreas comunes
    /shared
      /middleware            ← authGuard, roleGuard, errorHandler
      /db                   ← pg pool + migrations
    server.js
  /docs
```

### Flujo estándar de petición
```
React → axios → Express route → authGuard → roleGuard → controller → service → PostgreSQL → response
```

### Flujo real-time (caseta)
```
Visitante registrado → Socket.io emit('nueva-visita') → cliente vigilante recibe notif. push
```

---

## 4. Stack Tecnológico

| Capa | Tecnología | Justificación |
|------|-----------|--------------|
| Frontend | React 18 + Vite + TailwindCSS | Stack moderno, Vite rápido en dev |
| Routing | React Router v6 | Standard para SPAs React |
| Backend | Node.js + Express | Requisito escolar |
| Base de datos | PostgreSQL | Requisito escolar, superior a MySQL para JSONB y UUIDs |
| Auth | JWT + refresh tokens (httpOnly cookie) | Sin estado, escalable |
| Real-time | Socket.io | Push notif. caseta, más simple que WebSockets raw |
| Pagos | MercadoPago API | Mercado México, sandbox gratuito para pruebas |
| Email | Nodemailer + SMTP (Gmail dev / SendGrid prod) | Simple, sin costo en dev |
| WhatsApp | Meta Cloud API | Gratuito hasta 1,000 conversaciones/mes |
| PDF | PDFKit | Nativo Node, sin headless browser |
| QR | `qrcode` npm | Generación server-side, output PNG/SVG |
| Mapa | SVG estático + overlay React | SVG path por lote, `svg_path_id` en DB linkea lote con shape |
| Deploy | Railway o Render | Free tier suficiente para proyecto escolar |

---

## 5. Base de Datos

Ver `docs/db-schema.md` para schema completo con todos los campos.

### Tablas principales
`fraccionamientos`, `usuarios`, `lotes`, `propietarios`, `documentos`, `cuotas`, `pagos`, `visitas`, `solicitudes_mantenimiento`, `comunicados`, `areas_comunes`, `reservaciones`

### Decisiones de diseño
- UUIDs con `gen_random_uuid()` — sin colisiones entre fraccionamientos
- `fraccionamiento_id` en todas las tablas core — isolación de datos por fraccionamiento
- `usuarios.qr_token` — JWT firmado con secret propio, no expira; se invalida desactivando el usuario
- `lotes.svg_path_id` — string que coincide con el atributo `id` del `<path>` en el SVG del mapa
- `cuotas.mes_año` — DATE con primer día del mes (ej. `2026-05-01`) para queries simples por período
- Bitácora de visitas: `WHERE entrada_at >= NOW() - INTERVAL '30 days'` — sin tabla separada

---

## 6. Módulos y Decisiones Técnicas

### Auth
- Passwords: bcrypt (salt rounds 12)
- JWT access token: 15 min expiración
- Refresh token: 7 días, guardado en httpOnly cookie + columna `refresh_token` en tabla `usuarios` para poder invalidarlo en logout/desactivación
- Role guard como middleware Express: `requireRole(['admin', 'vigilante'])`

### Mapa SVG Interactivo
- SVG del fraccionamiento cargado como componente React
- Cada `<path id="lote-A12">` corresponde a un lote en DB por `svg_path_id`
- Overlay: clase CSS en path según `lote.estado` (verde/amarillo/rojo)
- Click en path → modal con datos del lote + propietario

### Control de Visitas + QR
- QR de residente: JWT firmado `{ userId, fraccionamientoId, type: 'resident-qr' }` sin expiración
- QR se genera al crear el usuario-propietario, se muestra en portal propietario
- Caseta escanea QR con cámara del dispositivo (API `getUserMedia` + librería `jsQR`)
- Al escanear: POST `/visitas/qr` → valida token → registra entrada → Socket.io emite a room `caseta-{fraccionamientoId}`

### Pagos (MercadoPago)
- Flujo: frontend solicita preference → backend crea preference en MP → frontend redirige a MP checkout → MP hace webhook POST a backend → backend confirma pago en BD → genera PDF
- Webhook endpoint: `POST /pagos/webhook` — valida firma MP antes de procesar
- PDF: PDFKit genera buffer en memoria → se devuelve como descarga directa (`Content-Type: application/pdf`) sin guardar en disco — Railway/Render no tienen storage persistente en free tier. `pagos.pdf_url` se omite o se genera on-demand

### Generación de Cuotas
- Cron job con `node-cron`: se ejecuta día 1 de cada mes a las 00:01
- Inserta una cuota `tipo=mensual` por cada propietario activo del fraccionamiento
- Cuotas extraordinarias: admin crea manualmente, puede asignar a uno o todos los propietarios

### Comunicados
- Email: Nodemailer con SMTP Gmail (dev) o SendGrid (prod) — envío en batch, no en paralelo masivo
- WhatsApp: Meta Cloud API, endpoint `POST /messages` por número — loop sobre propietarios con `whatsapp` registrado
- Registro en tabla `comunicados` con `enviado_at` y canales usados

### Notificaciones Push (Caseta)
- Socket.io rooms: vigilante se une a room `caseta-{fraccionamientoId}` al iniciar sesión
- Eventos: `nueva-visita` (con datos del visitante), `qr-entrada` (residente escaneó QR)
- Sin Web Push API — Socket.io es suficiente para caseta que tiene tab abierta

### Reservaciones
- Validación de solapamiento: `WHERE area_id = $1 AND fecha = $2 AND estado != 'cancelada' AND NOT (hora_fin <= $3 OR hora_inicio >= $4)`
- Cancelación: solo el propietario que reservó o admin puede cancelar
- Sin pago asociado a reservas (sin depósito) — simplificación para proyecto escolar

---

## 7. Requerimientos No Funcionales

| Requerimiento | Solución |
|--------------|---------|
| Mapa SVG responsivo | Viewbox relativo, CSS `width: 100%; height: auto` |
| Notificaciones push caseta | Socket.io (ver arriba) |
| Acceso móvil vigilante | TailwindCSS responsive, UI caseta mobile-first |
| Pago online + recibo PDF | MercadoPago + PDFKit (ver arriba) |
| Historial bitácora 30 días | Query con `INTERVAL '30 days'`, índice en `visitas.entrada_at` |

---

## 8. Asignación de Módulos por Integrante

Todos los integrantes participan en **Frontend + Backend + APIs** en sus módulos asignados.

| Integrante | Módulos | Ejemplo de trabajo full-stack |
|-----------|---------|------------------------------|
| **Miroslava Moheno** | Auth, Mapa + Lotes, Reservaciones | Login UI + JWT middleware + `/auth/*` endpoints |
| **Joaquín Carmona** | Propietarios + Docs, Visitas + Caseta + QR, Comunicados | Caseta UI + Socket.io + `/visitas/*` endpoints |
| **Jorge Ruiz** | Cuotas + Pagos + PDF, Mantenimiento, Portal Propietario | Estado de cuenta UI + MercadoPago + `/pagos/*` endpoints |

---

## 9. Cronograma

Ver `docs/plan-proyecto.md` para cronograma completo con actividades y fechas.

### Fases
- **Fase 1** (Sem 1–2, May 8–21): Fundación — setup, auth, estructura base
- **Fase 2** (Sem 3–6, May 22–Jun 18): Módulos core — lotes, propietarios, visitas, pagos
- **Fase 3** (Sem 7–10, Jun 19–Jul 16): Módulos secundarios — mantenimiento, comunicados, reservas, portal
- **Fase 4** (Sem 11–12, Jul 17–31): Integración, deploy, documentación, demo

---

## 10. Qué NO entra en scope

- Multi-tenancy completa (SaaS) — arquitectura preparada pero no implementada
- App nativa móvil — web responsive es suficiente
- Videocámara/CCTV integrada — fuera de scope
- Contabilidad avanzada / facturación fiscal — solo recibos simples PDF
- Chat entre residentes — comunicación es solo admin→residentes (broadcast)
- Marketplace o servicios de terceros dentro de la plataforma
