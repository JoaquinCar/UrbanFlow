const express = require('express')
const router = express.Router()
const controller = require('./passes.controller')
const { authGuard } = require('../../shared/middleware/auth.middleware')
const { requireRole } = require('../../shared/middleware/role.middleware')

router.use(authGuard)

const soloPropietario = requireRole(['propietario'])

router.get('/tipos', soloPropietario, controller.tipos)
router.get('/mis-pases', soloPropietario, controller.misPases)
router.post('/', soloPropietario, controller.crear)
router.get('/:id/qr', soloPropietario, controller.obtenerQr)
router.delete('/:id', soloPropietario, controller.cancelar)

module.exports = router
