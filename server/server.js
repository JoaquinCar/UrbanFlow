require('dotenv').config()
const express = require('express')
const cors = require('cors')
const cookieParser = require('cookie-parser')
const http = require('http')
const { Server } = require('socket.io')
const swaggerUi = require('swagger-ui-express')
const swaggerSpec = require('./swagger')

const app = express()
const httpServer = http.createServer(app)
const io = new Server(httpServer, {
  cors: { origin: process.env.CLIENT_URL || 'http://localhost:5173', credentials: true },
})

// Detrás del proxy de Railway/Render, express-rate-limit necesita confiar en
// X-Forwarded-For o limita por la IP del proxy (una sola para todo el mundo).
app.set('trust proxy', 1)

// Middleware
app.use(cors({ origin: process.env.CLIENT_URL || 'http://localhost:5173', credentials: true }))
app.use(cookieParser())

// Stripe necesita el body RAW (buffer) para validar la firma del webhook.
// Se aplica ANTES de express.json() y solo a la ruta del webhook.
app.use('/api/pagos/webhook', express.raw({ type: 'application/json' }))
app.use(express.json())

// Health check
app.get('/api/health', (req, res) => res.json({ status: 'ok', env: process.env.NODE_ENV }))

// Routes
const authRoutes = require('./modules/auth/auth.routes')
const fraccionamientoRoutes = require('./modules/fraccionamiento/fraccionamiento.routes')
const ownersRoutes = require('./modules/owners/owners.routes')
const visitsRoutes = require('./modules/visits/visits.routes')
const paymentsRoutes = require('./modules/payments/payments.routes')
const maintenanceRoutes = require('./modules/maintenance/maintenance.routes')
const commsRoutes = require('./modules/comms/comms.routes')
const reservationsRoutes = require('./modules/reservations/reservations.routes')
const passesRoutes = require('./modules/passes/passes.routes')

app.use('/api/auth', authRoutes)
app.use('/api/fraccionamiento', fraccionamientoRoutes)
app.use('/api/propietarios', ownersRoutes)
app.use('/api/visitas', visitsRoutes)
app.use('/api/pases', passesRoutes)
app.use('/api/pagos', paymentsRoutes)
app.use('/api/mantenimiento', maintenanceRoutes)
app.use('/api/comunicados', commsRoutes)
app.use('/api/reservaciones', reservationsRoutes)

// Swagger docs
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'UrbanFlow API Docs',
}))
app.get('/api/docs.json', (req, res) => res.json(swaggerSpec))

// Socket.io
//
// La conexión exige el mismo access token que la API. Antes no lo pedía y
// 'join-caseta' aceptaba el fraccionamiento que mandara el cliente: cualquier
// navegador podía unirse a caseta-<uuid> ajeno y recibir en vivo la bitácora
// de visitantes de otro fraccionamiento.
const jwt = require('jsonwebtoken')

io.use((socket, next) => {
  const token = socket.handshake.auth?.token
  if (!token) return next(new Error('No autorizado'))
  try {
    socket.user = jwt.verify(token, process.env.JWT_SECRET)
    next()
  } catch {
    next(new Error('Token inválido o expirado'))
  }
})

io.on('connection', (socket) => {
  console.log(`Socket conectado: ${socket.id} (${socket.user.email})`)

  socket.on('join-caseta', () => {
    // El fraccionamiento sale del token, nunca de un argumento del cliente.
    socket.join(`caseta-${socket.user.fraccionamiento_id}`)
  })

  socket.on('disconnect', () => {
    console.log(`Socket desconectado: ${socket.id}`)
  })
})

// Make io accessible to route handlers
app.set('io', io)

// Cron jobs
const { iniciarCronCuotas } = require('./shared/jobs/cuota-cron')
iniciarCronCuotas()

// Aquí vivían /pagos/exito, /pagos/error y /pagos/pendiente, que rebotaban el
// navegador hacia CLIENT_URL. Existían porque MercadoPago exigía que las
// back_urls fueran HTTPS públicas y en local la única que había era la de
// ngrok, apuntando al backend.
//
// En producción el backend y el cliente comparten origen, así que el rebote se
// redirigía a sí mismo: bucle infinito y ERR_TOO_MANY_REDIRECTS justo al volver
// de pagar. Y ya no hacen falta: STRIPE_BACK_URL_* apunta directamente al
// cliente, que es quien tiene la pantalla. Las rutas se sirven como cualquier
// otra del SPA.

// 404 — cualquier ruta /api no reconocida. Va antes del errorHandler para que
// el cliente reciba JSON y no el HTML por defecto de Express.
app.use((req, res) => {
  res.status(404).json({ error: 'Ruta no encontrada' })
})

// Error handler
const { errorHandler } = require('./shared/middleware/error.middleware')
app.use(errorHandler)

const PORT = process.env.PORT || 3000
httpServer.listen(PORT, () => {
  console.log(`UrbanFlow server running on port ${PORT}`)
})
