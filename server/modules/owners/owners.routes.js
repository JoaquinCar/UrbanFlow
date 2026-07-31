const express = require('express')
const router = express.Router()
const controller = require('./owners.controller')
const { authGuard } = require('../../shared/middleware/auth.middleware')
const { requireRole } = require('../../shared/middleware/role.middleware')
const { subirDocumento } = require('../../shared/middleware/upload.middleware')

router.use(authGuard)

const soloAdmin = requireRole(['admin'])
const adminOVigilante = requireRole(['admin', 'vigilante'])
// 'propietario' aquí solo abre la puerta: el controlador comprueba además que
// el recurso sea suyo (exigirPropioSiEsPropietario).
const conAccesoPropio = requireRole(['admin', 'vigilante', 'propietario'])

// ── Orden importante ────────────────────────────────────────────────────────
// '/me' y '/documentos/:docId' van ANTES de '/:id', o Express los interpreta
// como un id de propietario llamado "me" o "documentos".
router.get('/me', requireRole(['propietario']), controller.obtenerPropio)
router.get('/documentos/:docId', conAccesoPropio, controller.descargarDocumento)
router.delete('/documentos/:docId', soloAdmin, controller.eliminarDocumento)

// ── Propietarios ────────────────────────────────────────────────────────────
// El vigilante puede consultarlos: necesita saber a quién pertenece un lote.
router.get('/', adminOVigilante, controller.listar)
router.post('/', soloAdmin, controller.crear)
router.get('/:id', conAccesoPropio, controller.obtener)
router.put('/:id', soloAdmin, controller.actualizar)
router.delete('/:id', soloAdmin, controller.eliminar)

// ── QR de residente ─────────────────────────────────────────────────────────
router.get('/:id/qr', requireRole(['admin', 'propietario']), controller.obtenerQr)
router.post('/:id/qr/rotar', soloAdmin, controller.rotarQr)

// ── Documentos ──────────────────────────────────────────────────────────────
router.get('/:id/documentos', conAccesoPropio, controller.listarDocumentos)
router.post('/:id/documentos', soloAdmin, subirDocumento, controller.subirDocumento)

module.exports = router
