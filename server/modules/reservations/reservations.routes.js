const express = require('express')
const router = express.Router()
const controller = require('./reservations.controller')
const { authGuard } = require('../../shared/middleware/auth.middleware')
const { requireRole } = require('../../shared/middleware/role.middleware')

router.use(authGuard)

const soloAdmin = requireRole(['admin'])

// ── Orden crítico ───────────────────────────────────────────────────────────
// '/areas' DEBE ir antes que '/:id'. Si no, Express resuelve GET /areas como
// una reservación con id = 'areas' y falla con un error de UUID inválido.
router.get('/areas', controller.listarAreas)
router.post('/areas', soloAdmin, controller.crearArea)
router.get('/areas/:id/disponibilidad', controller.disponibilidad)
router.put('/areas/:id', soloAdmin, controller.actualizarArea)
router.delete('/areas/:id', soloAdmin, controller.eliminarArea)

router.get('/mias', requireRole(['propietario']), controller.mias)

// ── Reservaciones ───────────────────────────────────────────────────────────
router.get('/', soloAdmin, controller.listar)
router.post('/', requireRole(['propietario', 'admin']), controller.crear)
router.get('/:id', requireRole(['admin', 'propietario']), controller.obtener)
router.put('/:id', soloAdmin, controller.actualizarEstado)
router.put('/:id/cancelar', requireRole(['admin', 'propietario']), controller.cancelar)
router.delete('/:id', soloAdmin, controller.eliminar)

module.exports = router
