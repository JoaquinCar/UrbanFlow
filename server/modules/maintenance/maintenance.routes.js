const express = require('express')
const router = express.Router()
const controller = require('./maintenance.controller')
const { authGuard } = require('../../shared/middleware/auth.middleware')
const { requireRole } = require('../../shared/middleware/role.middleware')

router.use(authGuard)

const soloAdmin = requireRole(['admin'])

// Rutas literales antes de '/:id'.
router.get('/estados', controller.estados)
router.get('/mios', requireRole(['propietario', 'tecnico']), controller.mios)
router.get('/tecnicos', soloAdmin, controller.tecnicos)

// El vigilante también puede reportar: es quien detecta una luminaria fundida
// o un portón que falla durante su turno.
router.get('/', soloAdmin, controller.listar)
router.post('/', requireRole(['propietario', 'admin', 'vigilante']), controller.crear)

// El control de que el ticket sea suyo lo hace el controlador.
router.get('/:id', requireRole(['admin', 'tecnico', 'propietario']), controller.obtener)
router.put('/:id', soloAdmin, controller.actualizar)
router.put('/:id/asignar', soloAdmin, controller.asignar)
router.put('/:id/estado', requireRole(['admin', 'tecnico']), controller.cambiarEstado)
router.delete('/:id', soloAdmin, controller.eliminar)

module.exports = router
