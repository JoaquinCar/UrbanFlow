require('dotenv').config()
const express = require('express')
const cors = require('cors')
const http = require('http')
const { Server } = require('socket.io')

const app = express()
const httpServer = http.createServer(app)
const io = new Server(httpServer, {
  cors: { origin: process.env.CLIENT_URL || 'http://localhost:5173', credentials: true },
})

// Middleware
app.use(cors({ origin: process.env.CLIENT_URL || 'http://localhost:5173', credentials: true }))
app.use(express.json())

// Health check
app.get('/api/health', (req, res) => res.json({ status: 'ok', env: process.env.NODE_ENV }))

// Routes — uncomment as modules are implemented
// const authRoutes = require('./modules/auth/auth.routes')
// const fraccionamientoRoutes = require('./modules/fraccionamiento/fraccionamiento.routes')
// const ownersRoutes = require('./modules/owners/owners.routes')
// const visitsRoutes = require('./modules/visits/visits.routes')
// const paymentsRoutes = require('./modules/payments/payments.routes')
// const maintenanceRoutes = require('./modules/maintenance/maintenance.routes')
// const commsRoutes = require('./modules/comms/comms.routes')
// const reservationsRoutes = require('./modules/reservations/reservations.routes')

// app.use('/api/auth', authRoutes)
// app.use('/api/fraccionamiento', fraccionamientoRoutes)
// app.use('/api/propietarios', ownersRoutes)
// app.use('/api/visitas', visitsRoutes)
// app.use('/api/pagos', paymentsRoutes)
// app.use('/api/mantenimiento', maintenanceRoutes)
// app.use('/api/comunicados', commsRoutes)
// app.use('/api/reservaciones', reservationsRoutes)

// Socket.io
io.on('connection', (socket) => {
  console.log(`Socket connected: ${socket.id}`)

  // Vigilante joins caseta room for their fraccionamiento
  socket.on('join-caseta', (fraccionamientoId) => {
    socket.join(`caseta-${fraccionamientoId}`)
  })

  socket.on('disconnect', () => {
    console.log(`Socket disconnected: ${socket.id}`)
  })
})

// Make io accessible to route handlers
app.set('io', io)

// Error handler
const { errorHandler } = require('./shared/middleware/error.middleware')
app.use(errorHandler)

const PORT = process.env.PORT || 3000
httpServer.listen(PORT, () => {
  console.log(`UrbanFlow server running on port ${PORT}`)
})
