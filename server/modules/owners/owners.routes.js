const express = require('express')
const router = express.Router()
const controller = require('./owners.controller')
const { authGuard } = require('../../shared/middleware/auth.middleware')
const { requireRole } = require('../../shared/middleware/role.middleware')
const { subirDocumento } = require('../../shared/middleware/upload.middleware')

router.use(authGuard)

const soloAdmin = requireRole(['admin'])
const adminOVigilante = requireRole(['admin', 'vigilante'])
const conAccesoPropio = requireRole(['admin', 'vigilante', 'propietario'])

/**
 * @swagger
 * /api/propietarios/me:
 *   get:
 *     tags: [Propietarios]
 *     summary: Mi ficha de propietario
 *     description: Retorna la ficha del propietario asociada al usuario autenticado.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Ficha del propietario
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Owner'
 *       404:
 *         description: Tu usuario no tiene ficha de propietario
 */
router.get('/me', requireRole(['propietario']), controller.obtenerPropio)

/**
 * @swagger
 * /api/propietarios/documentos/{docId}:
 *   get:
 *     tags: [Propietarios]
 *     summary: Descargar documento
 *     description: Descarga un documento del propietario.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: docId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Archivo
 *       404:
 *         description: Documento no encontrado
 */
router.get('/documentos/:docId', conAccesoPropio, controller.descargarDocumento)

/**
 * @swagger
 * /api/propietarios/documentos/{docId}:
 *   delete:
 *     tags: [Propietarios]
 *     summary: Eliminar documento
 *     description: Elimina un documento del propietario.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: docId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       204:
 *         description: Documento eliminado
 *       404:
 *         description: Documento no encontrado
 */
router.delete('/documentos/:docId', soloAdmin, controller.eliminarDocumento)

/**
 * @swagger
 * /api/propietarios/:
 *   get:
 *     tags: [Propietarios]
 *     summary: Listar propietarios
 *     description: Retorna todos los propietarios del fraccionamiento con paginación y búsqueda.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: q
 *         schema:
 *           type: string
 *         description: Búsqueda por nombre o email
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *     responses:
 *       200:
 *         description: Lista de propietarios
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 items:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Owner'
 *                 total:
 *                   type: integer
 */
router.get('/', adminOVigilante, controller.listar)

/**
 * @swagger
 * /api/propietarios/:
 *   post:
 *     tags: [Propietarios]
 *     summary: Crear propietario
 *     description: Crea un nuevo propietario con su cuenta de usuario.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [nombre_completo, email]
 *             properties:
 *               nombre_completo:
 *                 type: string
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *                 description: Si se omite se genera una contraseña por defecto
 *               telefono:
 *                 type: string
 *               whatsapp:
 *                 type: string
 *               curp:
 *                 type: string
 *               num_escritura:
 *                 type: string
 *     responses:
 *       201:
 *         description: Propietario creado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Owner'
 *       400:
 *         description: Faltan campos requeridos
 *       409:
 *         description: Ya existe un usuario con ese email
 */
router.post('/', soloAdmin, controller.crear)

/**
 * @swagger
 * /api/propietarios/{id}:
 *   get:
 *     tags: [Propietarios]
 *     summary: Obtener propietario
 *     description: Retorna los datos de un propietario específico.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Propietario
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Owner'
 *       404:
 *         description: Propietario no encontrado
 */
router.get('/:id', conAccesoPropio, controller.obtener)

/**
 * @swagger
 * /api/propietarios/{id}:
 *   put:
 *     tags: [Propietarios]
 *     summary: Actualizar propietario
 *     description: Actualiza los datos de un propietario.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               nombre_completo:
 *                 type: string
 *               telefono:
 *                 type: string
 *               whatsapp:
 *                 type: string
 *               curp:
 *                 type: string
 *               num_escritura:
 *                 type: string
 *     responses:
 *       200:
 *         description: Propietario actualizado
 *       404:
 *         description: Propietario no encontrado
 */
router.put('/:id', soloAdmin, controller.actualizar)

/**
 * @swagger
 * /api/propietarios/{id}:
 *   delete:
 *     tags: [Propietarios]
 *     summary: Eliminar propietario
 *     description: Elimina un propietario y desactiva su cuenta de usuario.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       204:
 *         description: Propietario eliminado
 *       404:
 *         description: Propietario no encontrado
 */
router.delete('/:id', soloAdmin, controller.eliminar)

/**
 * @swagger
 * /api/propietarios/{id}/qr:
 *   get:
 *     tags: [Propietarios]
 *     summary: Obtener QR de residente
 *     description: Genera o retorna el código QR del propietario para entrada por caseta.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: format
 *         schema:
 *           type: string
 *           enum: [png]
 *         description: Si es "png" retorna imagen PNG en lugar de JSON
 *     responses:
 *       200:
 *         description: QR del propietario
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 qr_token:
 *                   type: string
 *                 nombre_completo:
 *                   type: string
 *                 data_url:
 *                   type: string
 *                   description: data:image/png;base64,...
 *       404:
 *         description: Propietario no encontrado
 */
router.get('/:id/qr', requireRole(['admin', 'propietario']), controller.obtenerQr)

/**
 * @swagger
 * /api/propietarios/{id}/qr/rotar:
 *   post:
 *     tags: [Propietarios]
 *     summary: Rotar QR de residente
 *     description: Genera un nuevo token QR, invalidando el anterior.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Nuevo QR generado
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 qr_token:
 *                   type: string
 *                 data_url:
 *                   type: string
 */
router.post('/:id/qr/rotar', soloAdmin, controller.rotarQr)

/**
 * @swagger
 * /api/propietarios/{id}/documentos:
 *   get:
 *     tags: [Propietarios]
 *     summary: Listar documentos
 *     description: Retorna los documentos de un propietario.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Lista de documentos
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: string
 *                     format: uuid
 *                   propietario_id:
 *                     type: string
 *                     format: uuid
 *                   tipo:
 *                     type: string
 *                   nombre_archivo:
 *                     type: string
 *                   mime_type:
 *                     type: string
 *                   tamano_bytes:
 *                     type: integer
 *                   created_at:
 *                     type: string
 *                     format: date-time
 */
router.get('/:id/documentos', conAccesoPropio, controller.listarDocumentos)

/**
 * @swagger
 * /api/propietarios/{id}/documentos:
 *   post:
 *     tags: [Propietarios]
 *     summary: Subir documento
 *     description: Sube un documento para un propietario (multipart/form-data).
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [tipo, file]
 *             properties:
 *               tipo:
 *                 type: string
 *                 description: Tipo de documento (escritura, identificacion, etc.)
 *               file:
 *                 type: string
 *                 format: binary
 *     responses:
 *       201:
 *         description: Documento subido
 *       400:
 *         description: No se recibió archivo o falta tipo
 */
router.post('/:id/documentos', soloAdmin, subirDocumento, controller.subirDocumento)

module.exports = router
