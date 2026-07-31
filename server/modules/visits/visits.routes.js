const express = require('express')
const router = express.Router()
const controller = require('./visits.controller')
const { authGuard } = require('../../shared/middleware/auth.middleware')
const { requireRole } = require('../../shared/middleware/role.middleware')

router.use(authGuard)

const caseta = requireRole(['vigilante', 'admin'])
const consulta = requireRole(['admin', 'vigilante'])

// Las rutas literales van antes de '/:id' o Express las tomaría por un id.
router.get('/tipos', controller.tipos)
router.get('/activas', caseta, controller.listarActivas)
router.get('/bitacora.csv', consulta, controller.bitacoraCsv)
router.get('/bitacora', consulta, controller.bitacora)
router.get('/mis-visitas', requireRole(['propietario']), controller.misVisitas)

// Operación de caseta
router.post('/entrada', caseta, controller.registrarEntrada)
router.post('/qr', caseta, controller.entradaPorQr)
router.put('/:id/salida', caseta, controller.registrarSalida)

router.get('/:id', consulta, controller.obtener)

module.exports = router
