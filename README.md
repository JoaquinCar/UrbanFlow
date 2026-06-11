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

# 2. Levantar base de datos (PostgreSQL + pgAdmin)
docker compose up -d

# 3. Instalar dependencias
cd client && npm install
cd ../server && npm install

# 4. Configurar variables de entorno
cp server/.env.example server/.env
cp client/.env.example client/.env
# Las credenciales de DB ya coinciden con docker-compose.yml

# 5. Crear tablas
psql -U postgres -c "CREATE DATABASE urbanflow;"
cd server && npm run migrate

# 6. Cargar datos de prueba
npm run seed

# 7. Iniciar en desarrollo
# Terminal 1:
npm run dev          # servidor en http://localhost:3000
# Terminal 2:
cd ../client && npm run dev   # frontend en http://localhost:5173
```

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
