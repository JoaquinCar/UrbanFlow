const express = require('express')
const router = express.Router()
const controller = require('./comms.controller')
const { authGuard } = require('../../shared/middleware/auth.middleware')
const { requireRole } = require('../../shared/middleware/role.middleware')

// Verificación del webhook de Meta: va ANTES de authGuard porque quien llama
// es Meta, no un usuario con sesión. Se autentica con META_VERIFY_TOKEN.
router.get('/webhook', controller.verificarWebhook)

router.use(authGuard)

const soloAdmin = requireRole(['admin'])

// Rutas literales antes de '/:id'.
router.get('/canales', soloAdmin, controller.canales)
router.get('/destinatarios', soloAdmin, controller.destinatarios)
// El tablón de avisos lo ve cualquier residente.
router.get('/mios', controller.mios)

router.get('/', soloAdmin, controller.listar)
router.post('/', soloAdmin, controller.crear)
router.get('/:id', soloAdmin, controller.obtener)
router.delete('/:id', soloAdmin, controller.eliminar)

module.exports = router
