const express = require('express')
const router = express.Router()
const controller = require('./visits.controller')
const { authGuard } = require('../../shared/middleware/auth.middleware')
const { requireRole } = require('../../shared/middleware/role.middleware')

router.use(authGuard)

const caseta = requireRole(['vigilante', 'admin'])
const consulta = requireRole(['admin', 'vigilante'])

/**
 * @swagger
 * /api/visitas/tipos:
 *   get:
 *     tags: [Visitas]
 *     summary: Tipos de visita
 *     description: Retorna la lista de tipos de visita disponibles.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de tipos
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: string
 *                 enum: [visita, delivery, servicio, residente]
 */
router.get('/tipos', controller.tipos)

/**
 * @swagger
 * /api/visitas/activas:
 *   get:
 *     tags: [Visitas]
 *     summary: Visitas activas
 *     description: Retorna las visitas que actualmente están dentro del fraccionamiento (sin salida registrada).
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Visitas activas
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Visit'
 */
router.get('/activas', caseta, controller.listarActivas)

/**
 * @swagger
 * /api/visitas/bitacora.csv:
 *   get:
 *     tags: [Visitas]
 *     summary: Exportar bitácora CSV
 *     description: Descarga la bitácora de visitas en formato CSV.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: desde
 *         schema:
 *           type: string
 *           format: date-time
 *       - in: query
 *         name: hasta
 *         schema:
 *           type: string
 *           format: date-time
 *       - in: query
 *         name: tipo
 *         schema:
 *           type: string
 *       - in: query
 *         name: lote_id
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: q
 *         schema:
 *           type: string
 *         description: Búsqueda por nombre de visitante
 *     responses:
 *       200:
 *         description: Archivo CSV
 *         content:
 *           text/csv:
 *             schema:
 *               type: string
 *               format: binary
 */
router.get('/bitacora.csv', consulta, controller.bitacoraCsv)

/**
 * @swagger
 * /api/visitas/bitacora:
 *   get:
 *     tags: [Visitas]
 *     summary: Bitácora de visitas
 *     description: Retorna el historial de visitas con filtros y paginación.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: desde
 *         schema:
 *           type: string
 *           format: date-time
 *       - in: query
 *         name: hasta
 *         schema:
 *           type: string
 *           format: date-time
 *       - in: query
 *         name: tipo
 *         schema:
 *           type: string
 *       - in: query
 *         name: lote_id
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: q
 *         schema:
 *           type: string
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
 *         description: Bitácora paginada
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 items:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Visit'
 *                 total:
 *                   type: integer
 */
router.get('/bitacora', consulta, controller.bitacora)

/**
 * @swagger
 * /api/visitas/mis-visitas:
 *   get:
 *     tags: [Visitas]
 *     summary: Mis visitas
 *     description: Retorna las visitas recibidas por el propietario autenticado.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *     responses:
 *       200:
 *         description: Lista de visitas del propietario
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Visit'
 */
router.get('/mis-visitas', requireRole(['propietario']), controller.misVisitas)

/**
 * @swagger
 * /api/visitas/entrada:
 *   post:
 *     tags: [Visitas]
 *     summary: Registrar entrada de visitante
 *     description: Registra la entrada de un visitante al fraccionamiento. Emite evento por Socket.IO a la sala de caseta.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [lote_destino_id, nombre_visitante]
 *             properties:
 *               lote_destino_id:
 *                 type: string
 *                 format: uuid
 *               nombre_visitante:
 *                 type: string
 *               tipo:
 *                 type: string
 *                 enum: [visita, delivery, servicio, residente]
 *                 default: visita
 *               placa_vehiculo:
 *                 type: string
 *               notas:
 *                 type: string
 *     responses:
 *       201:
 *         description: Entrada registrada
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Visit'
 *       400:
 *         description: Faltan campos requeridos
 *       404:
 *         description: Lote no encontrado
 */
router.post('/entrada', caseta, controller.registrarEntrada)

/**
 * @swagger
 * /api/visitas/qr:
 *   post:
 *     tags: [Visitas]
 *     summary: Entrada por QR
 *     description: Registra la entrada de un residente escaneando su código QR.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [token]
 *             properties:
 *               token:
 *                 type: string
 *                 description: Token del código QR
 *     responses:
 *       201:
 *         description: Entrada registrada
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 visita:
 *                   $ref: '#/components/schemas/Visit'
 *                 residente:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       format: uuid
 *                     nombre:
 *                       type: string
 *                     propietario_id:
 *                       type: string
 *                       format: uuid
 *                     lote:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: string
 *                           format: uuid
 *                         numero:
 *                           type: string
 *       400:
 *         description: Token requerido
 *       403:
 *         description: QR de otro fraccionamiento o cuenta desactivada
 *       409:
 *         description: Residente sin lote asignado
 */
router.post('/qr', caseta, controller.entradaPorQr)

/**
 * @swagger
 * /api/visitas/{id}/salida:
 *   put:
 *     tags: [Visitas]
 *     summary: Registrar salida de visitante
 *     description: Registra la salida de un visitante. Emite evento por Socket.IO.
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
 *         description: Salida registrada
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Visit'
 *       404:
 *         description: Visita no encontrada
 *       409:
 *         description: Esta visita ya tiene salida registrada
 */
router.put('/:id/salida', caseta, controller.registrarSalida)

/**
 * @swagger
 * /api/visitas/{id}:
 *   get:
 *     tags: [Visitas]
 *     summary: Obtener visita
 *     description: Retorna los datos de una visita específica.
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
 *         description: Visita
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Visit'
 *       404:
 *         description: Visita no encontrada
 */
router.get('/:id', consulta, controller.obtener)

module.exports = router
