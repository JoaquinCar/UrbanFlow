const express = require('express')
const router = express.Router()
const controller = require('./comms.controller')
const { authGuard } = require('../../shared/middleware/auth.middleware')
const { requireRole } = require('../../shared/middleware/role.middleware')

/**
 * @swagger
 * /api/comunicados/webhook:
 *   get:
 *     tags: [Comunicados]
 *     summary: Webhook de Meta (WhatsApp)
 *     description: Endpoint de verificación del webhook de Meta. No requiere autenticación JWT.
 *     parameters:
 *       - in: query
 *         name: hub.mode
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: hub.verify_token
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: hub.challenge
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Challenge verificado (texto plano)
 *       403:
 *         description: Token de verificación inválido
 */
router.get('/webhook', controller.verificarWebhook)

router.use(authGuard)

const soloAdmin = requireRole(['admin'])

/**
 * @swagger
 * /api/comunicados/canales:
 *   get:
 *     tags: [Comunicados]
 *     summary: Canales disponibles
 *     description: Retorna qué canales de envío están configurados (email, WhatsApp).
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Canales
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 email:
 *                   type: boolean
 *                 whatsapp:
 *                   type: boolean
 *                 whatsapp_plantilla:
 *                   type: boolean
 */
router.get('/canales', soloAdmin, controller.canales)

/**
 * @swagger
 * /api/comunicados/destinatarios:
 *   get:
 *     tags: [Comunicados]
 *     summary: Conteo de destinatarios
 *     description: Retorna el total de propietarios activos y cuántos tienen email/WhatsApp.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: ids
 *         schema:
 *           type: string
 *         description: IDs separados por coma para filtrar destinatarios específicos
 *     responses:
 *       200:
 *         description: Conteo de destinatarios
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 total:
 *                   type: integer
 *                 con_email:
 *                   type: integer
 *                 con_whatsapp:
 *                   type: integer
 */
router.get('/destinatarios', soloAdmin, controller.destinatarios)

/**
 * @swagger
 * /api/comunicados/mios:
 *   get:
 *     tags: [Comunicados]
 *     summary: Mis comunicados
 *     description: Retorna los comunicados enviados visibles para el usuario autenticado (vista de residente).
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *     responses:
 *       200:
 *         description: Lista de comunicados
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
 *                   titulo:
 *                     type: string
 *                   cuerpo:
 *                     type: string
 *                   enviado_at:
 *                     type: string
 *                     format: date-time
 *                   autor_nombre:
 *                     type: string
 */
router.get('/mios', controller.mios)

/**
 * @swagger
 * /api/comunicados/:
 *   get:
 *     tags: [Comunicados]
 *     summary: Listar comunicados
 *     description: Retorna todos los comunicados del fraccionamiento con paginación.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *     responses:
 *       200:
 *         description: Comunicados paginados
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 items:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Comunicado'
 *                 total:
 *                   type: integer
 */
router.get('/', soloAdmin, controller.listar)

/**
 * @swagger
 * /api/comunicados/:
 *   post:
 *     tags: [Comunicados]
 *     summary: Crear y enviar comunicado
 *     description: Crea un comunicado y lo envía por los canales seleccionados.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [titulo, cuerpo, canales]
 *             properties:
 *               titulo:
 *                 type: string
 *               cuerpo:
 *                 type: string
 *               canales:
 *                 type: object
 *                 properties:
 *                   email:
 *                     type: boolean
 *                   whatsapp:
 *                     type: boolean
 *               destinatarios:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: uuid
 *                 description: IDs de propietarios. Si se omite se envía a todos los activos.
 *     responses:
 *       201:
 *         description: Comunicado enviado
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 comunicado:
 *                   $ref: '#/components/schemas/Comunicado'
 *                 resultado:
 *                   type: object
 *                   description: Resultado del envío por cada canal
 *       400:
 *         description: Faltan campos requeridos
 *       409:
 *         description: No hay propietarios activos
 */
router.post('/', soloAdmin, controller.crear)

/**
 * @swagger
 * /api/comunicados/{id}:
 *   get:
 *     tags: [Comunicados]
 *     summary: Obtener comunicado
 *     description: Retorna los datos de un comunicado específico.
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
 *         description: Comunicado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Comunicado'
 *       404:
 *         description: Comunicado no encontrado
 */
router.get('/:id', soloAdmin, controller.obtener)

/**
 * @swagger
 * /api/comunicados/{id}:
 *   delete:
 *     tags: [Comunicados]
 *     summary: Eliminar comunicado
 *     description: Elimina un comunicado.
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
 *         description: Comunicado eliminado
 *       404:
 *         description: Comunicado no encontrado
 */
router.delete('/:id', soloAdmin, controller.eliminar)

module.exports = router
