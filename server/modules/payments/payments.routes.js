const express = require('express')
const router = express.Router()
const controller = require('./payments.controller')
const { authGuard } = require('../../shared/middleware/auth.middleware')
const { requireRole } = require('../../shared/middleware/role.middleware')

// ── Webhook ─────────────────────────────────────────────────────────────────
// Va ANTES de router.use(authGuard): quien llama es MercadoPago, no un usuario
// con sesión. Su autenticidad se comprueba con la firma HMAC del cuerpo.
router.post('/webhook', controller.webhook)

router.use(authGuard)

const soloAdmin = requireRole(['admin'])

// ── Cuotas ──────────────────────────────────────────────────────────────────
// Las rutas literales van antes que las paramétricas.
router.get('/cuotas/mias', requireRole(['propietario']), controller.misCuotas)
router.post('/cuotas/generar', soloAdmin, controller.generarMensuales)
router.get('/cuotas', soloAdmin, controller.listarCuotas)
router.post('/cuotas', soloAdmin, controller.crearCuota)
router.get('/cuotas/:propietarioId', soloAdmin, controller.estadoDeCuenta)
router.put('/cuotas/:id', soloAdmin, controller.actualizarCuota)
router.delete('/cuotas/:id', soloAdmin, controller.eliminarCuota)

// ── Morosidad ───────────────────────────────────────────────────────────────
router.get('/morosos', soloAdmin, controller.morosos)

// ── Pagos ───────────────────────────────────────────────────────────────────
router.post('/checkout', requireRole(['propietario', 'admin']), controller.checkout)
router.post('/manual', soloAdmin, controller.pagoManual)
router.get('/', soloAdmin, controller.listarPagos)
router.get('/:id/pdf', requireRole(['admin', 'propietario']), controller.recibo)

module.exports = router
