const express = require('express')
const router = express.Router()
const controller = require('./fraccionamiento.controller')
const { authGuard } = require('../../shared/middleware/auth.middleware')
const { requireRole } = require('../../shared/middleware/role.middleware')

router.use(authGuard)

const soloAdmin = requireRole(['admin'])

/**
 * @swagger
 * /api/fraccionamiento/:
 *   get:
 *     tags: [Fraccionamiento]
 *     summary: Datos del fraccionamiento
 *     description: Retorna la información general del fraccionamiento del usuario autenticado.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Datos del fraccionamiento
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Fraccionamiento'
 */
router.get('/', controller.obtener)

/**
 * @swagger
 * /api/fraccionamiento/:
 *   put:
 *     tags: [Fraccionamiento]
 *     summary: Actualizar fraccionamiento
 *     description: Actualiza la información del fraccionamiento.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               nombre:
 *                 type: string
 *               direccion:
 *                 type: string
 *               config_mapa:
 *                 type: object
 *                 description: Configuración del mapa SVG
 *     responses:
 *       200:
 *         description: Fraccionamiento actualizado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Fraccionamiento'
 */
router.put('/', soloAdmin, controller.actualizar)

/**
 * @swagger
 * /api/fraccionamiento/dashboard:
 *   get:
 *     tags: [Fraccionamiento]
 *     summary: Dashboard administrativo
 *     description: Retorna métricas consolidadas del fraccionamiento: lotes, propietarios, cuotas, visitas, tickets, reservaciones y actividad reciente.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Datos del dashboard
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 lotes:
 *                   type: object
 *                   properties:
 *                     total:
 *                       type: integer
 *                     disponible:
 *                       type: integer
 *                     proceso:
 *                       type: integer
 *                     vendido:
 *                       type: integer
 *                 propietarios:
 *                   type: object
 *                   properties:
 *                     total:
 *                       type: integer
 *                 cuotas:
 *                   type: object
 *                   properties:
 *                     pendientes:
 *                       type: integer
 *                     vencidas:
 *                       type: integer
 *                     monto_adeudado:
 *                       type: number
 *                     cobrado_mes:
 *                       type: number
 *                     morosos:
 *                       type: integer
 *                 visitas:
 *                   type: object
 *                   properties:
 *                     hoy:
 *                       type: integer
 *                     dentro:
 *                       type: integer
 *                 tickets:
 *                   type: object
 *                   properties:
 *                     abiertos:
 *                       type: integer
 *                     en_proceso:
 *                       type: integer
 *                 reservaciones:
 *                   type: object
 *                   properties:
 *                     proximas:
 *                       type: integer
 *                     por_confirmar:
 *                       type: integer
 *                 actividad:
 *                   type: object
 *                   description: Actividad reciente (visitas, tickets, morosos)
 */
router.get('/dashboard', soloAdmin, controller.dashboard)

/**
 * @swagger
 * /api/fraccionamiento/mapa:
 *   get:
 *     tags: [Fraccionamiento]
 *     summary: Mapa del fraccionamiento
 *     description: Retorna la configuración del mapa SVG con todos los lotes y su estado.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Datos del mapa
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 config_mapa:
 *                   type: object
 *                 lotes:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                         format: uuid
 *                       numero:
 *                         type: string
 *                       estado:
 *                         type: string
 *                       etapa:
 *                         type: string
 *                         nullable: true
 *                       svg_path_id:
 *                         type: string
 *                         nullable: true
 *                       propietario_nombre:
 *                         type: string
 *                         nullable: true
 *                 resumen:
 *                   type: object
 *                   properties:
 *                     disponible:
 *                       type: integer
 *                     proceso:
 *                       type: integer
 *                     vendido:
 *                       type: integer
 *                 total:
 *                   type: integer
 */
router.get('/mapa', controller.obtenerMapa)

/**
 * @swagger
 * /api/fraccionamiento/etapas:
 *   get:
 *     tags: [Fraccionamiento]
 *     summary: Listar etapas
 *     description: Retorna las etapas del fraccionamiento.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de etapas
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: string
 *                 example: Etapa 1
 */
router.get('/etapas', controller.listarEtapas)

/**
 * @swagger
 * /api/fraccionamiento/lotes:
 *   get:
 *     tags: [Fraccionamiento]
 *     summary: Listar lotes
 *     description: Retorna los lotes del fraccionamiento con filtros y paginación.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: estado
 *         schema:
 *           type: string
 *           enum: [disponible, proceso, vendido]
 *       - in: query
 *         name: etapa
 *         schema:
 *           type: string
 *       - in: query
 *         name: q
 *         schema:
 *           type: string
 *         description: Búsqueda por número de lote
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
 *         description: Lotes paginados
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 items:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Lote'
 *                 total:
 *                   type: integer
 */
router.get('/lotes', controller.listarLotes)

/**
 * @swagger
 * /api/fraccionamiento/lotes:
 *   post:
 *     tags: [Fraccionamiento]
 *     summary: Crear lote
 *     description: Crea un nuevo lote en el fraccionamiento.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [numero]
 *             properties:
 *               numero:
 *                 type: string
 *               superficie_m2:
 *                 type: number
 *               precio:
 *                 type: number
 *               etapa:
 *                 type: string
 *               estado:
 *                 type: string
 *                 enum: [disponible, proceso, vendido]
 *                 default: disponible
 *               svg_path_id:
 *                 type: string
 *               propietario_id:
 *                 type: string
 *                 format: uuid
 *     responses:
 *       201:
 *         description: Lote creado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Lote'
 *       400:
 *         description: Número requerido o estado inválido
 *       404:
 *         description: Propietario no encontrado
 *       409:
 *         description: Ya existe el lote
 */
router.post('/lotes', soloAdmin, controller.crearLote)

/**
 * @swagger
 * /api/fraccionamiento/lotes/{id}:
 *   get:
 *     tags: [Fraccionamiento]
 *     summary: Obtener lote
 *     description: Retorna los datos de un lote con información de su propietario.
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
 *         description: Lote
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/Lote'
 *                 - type: object
 *                   properties:
 *                     propietario:
 *                       type: object
 *                       nullable: true
 *                       properties:
 *                         id:
 *                           type: string
 *                           format: uuid
 *                         nombre_completo:
 *                           type: string
 *                         telefono:
 *                           type: string
 *                           nullable: true
 *                         whatsapp:
 *                           type: string
 *                           nullable: true
 *       404:
 *         description: Lote no encontrado
 */
router.get('/lotes/:id', controller.obtenerLote)

/**
 * @swagger
 * /api/fraccionamiento/lotes/{id}:
 *   put:
 *     tags: [Fraccionamiento]
 *     summary: Actualizar lote
 *     description: Actualiza los datos de un lote.
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
 *               numero:
 *                 type: string
 *               superficie_m2:
 *                 type: number
 *               precio:
 *                 type: number
 *               etapa:
 *                 type: string
 *               estado:
 *                 type: string
 *               svg_path_id:
 *                 type: string
 *     responses:
 *       200:
 *         description: Lote actualizado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Lote'
 *       404:
 *         description: Lote no encontrado
 */
router.put('/lotes/:id', soloAdmin, controller.actualizarLote)

/**
 * @swagger
 * /api/fraccionamiento/lotes/{id}:
 *   delete:
 *     tags: [Fraccionamiento]
 *     summary: Eliminar lote
 *     description: Elimina un lote. No se puede eliminar si tiene registros asociados.
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
 *         description: Lote eliminado
 *       404:
 *         description: Lote no encontrado
 *       409:
 *         description: El lote tiene registros asociados
 */
router.delete('/lotes/:id', soloAdmin, controller.eliminarLote)

/**
 * @swagger
 * /api/fraccionamiento/lotes/{id}/propietario:
 *   put:
 *     tags: [Fraccionamiento]
 *     summary: Asignar propietario a lote
 *     description: Asigna o desasigna un propietario a un lote. El estado del lote cambia automáticamente entre "vendido" y "disponible".
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
 *         application/json:
 *           schema:
 *             type: object
 *             required: [propietario_id]
 *             properties:
 *               propietario_id:
 *                 type: string
 *                 format: uuid
 *                 description: UUID del propietario, o null para desasignar
 *     responses:
 *       200:
 *         description: Propietario asignado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Lote'
 *       400:
 *         description: propietario_id requerido
 *       404:
 *         description: Lote o propietario no encontrado
 */
router.put('/lotes/:id/propietario', soloAdmin, controller.asignarPropietario)

module.exports = router
