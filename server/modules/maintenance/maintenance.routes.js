const express = require('express')
const router = express.Router()
const controller = require('./maintenance.controller')
const { authGuard } = require('../../shared/middleware/auth.middleware')
const { requireRole } = require('../../shared/middleware/role.middleware')

router.use(authGuard)

const soloAdmin = requireRole(['admin'])

/**
 * @swagger
 * /api/mantenimiento/estados:
 *   get:
 *     tags: [Mantenimiento]
 *     summary: Estados de ticket
 *     description: Retorna la lista de estados disponibles para tickets de mantenimiento.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de estados
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: string
 *                 enum: [abierto, en_proceso, resuelto]
 */
router.get('/estados', controller.estados)

/**
 * @swagger
 * /api/mantenimiento/mios:
 *   get:
 *     tags: [Mantenimiento]
 *     summary: Mis tickets
 *     description: Retorna los tickets del propietario o técnico autenticado.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: estado
 *         schema:
 *           type: string
 *           enum: [abierto, en_proceso, resuelto]
 *     responses:
 *       200:
 *         description: Lista de tickets
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Ticket'
 */
router.get('/mios', requireRole(['propietario', 'tecnico']), controller.mios)

/**
 * @swagger
 * /api/mantenimiento/tecnicos:
 *   get:
 *     tags: [Mantenimiento]
 *     summary: Listar técnicos
 *     description: Retorna los técnicos activos del fraccionamiento con cantidad de tickets asignados.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de técnicos
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
 *                   nombre:
 *                     type: string
 *                   email:
 *                     type: string
 *                   tickets_activos:
 *                     type: integer
 */
router.get('/tecnicos', soloAdmin, controller.tecnicos)

/**
 * @swagger
 * /api/mantenimiento/:
 *   get:
 *     tags: [Mantenimiento]
 *     summary: Listar tickets
 *     description: Retorna todos los tickets de mantenimiento del fraccionamiento con filtros.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: estado
 *         schema:
 *           type: string
 *       - in: query
 *         name: tecnico_id
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: q
 *         schema:
 *           type: string
 *         description: Búsqueda por descripción
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
 *         description: Tickets paginados
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 items:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Ticket'
 *                 total:
 *                   type: integer
 */
router.get('/', soloAdmin, controller.listar)

/**
 * @swagger
 * /api/mantenimiento/:
 *   post:
 *     tags: [Mantenimiento]
 *     summary: Crear ticket
 *     description: Crea un nuevo ticket de mantenimiento.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [descripcion]
 *             properties:
 *               descripcion:
 *                 type: string
 *               ubicacion:
 *                 type: string
 *     responses:
 *       201:
 *         description: Ticket creado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Ticket'
 *       400:
 *         description: La descripción es requerida
 */
router.post('/', requireRole(['propietario', 'admin', 'vigilante']), controller.crear)

/**
 * @swagger
 * /api/mantenimiento/{id}:
 *   get:
 *     tags: [Mantenimiento]
 *     summary: Obtener ticket
 *     description: Retorna los datos de un ticket específico.
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
 *         description: Ticket
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Ticket'
 *       404:
 *         description: Solicitud no encontrada
 */
router.get('/:id', requireRole(['admin', 'tecnico', 'propietario']), controller.obtener)

/**
 * @swagger
 * /api/mantenimiento/{id}:
 *   put:
 *     tags: [Mantenimiento]
 *     summary: Actualizar ticket
 *     description: Actualiza la descripción, ubicación, técnico o estado de un ticket.
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
 *               descripcion:
 *                 type: string
 *               ubicacion:
 *                 type: string
 *               tecnico_id:
 *                 type: string
 *                 format: uuid
 *               estado:
 *                 type: string
 *                 enum: [abierto, en_proceso, resuelto]
 *     responses:
 *       200:
 *         description: Ticket actualizado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Ticket'
 *       404:
 *         description: Solicitud no encontrada
 */
router.put('/:id', soloAdmin, controller.actualizar)

/**
 * @swagger
 * /api/mantenimiento/{id}/asignar:
 *   put:
 *     tags: [Mantenimiento]
 *     summary: Asignar técnico
 *     description: Asigna un técnico al ticket y cambia su estado a "en_proceso".
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
 *             required: [tecnico_id]
 *             properties:
 *               tecnico_id:
 *                 type: string
 *                 format: uuid
 *     responses:
 *       200:
 *         description: Técnico asignado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Ticket'
 *       400:
 *         description: tecnico_id requerido o usuario no es técnico
 */
router.put('/:id/asignar', soloAdmin, controller.asignar)

/**
 * @swagger
 * /api/mantenimiento/{id}/estado:
 *   put:
 *     tags: [Mantenimiento]
 *     summary: Cambiar estado de ticket
 *     description: Cambia el estado de un ticket de mantenimiento.
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
 *             required: [estado]
 *             properties:
 *               estado:
 *                 type: string
 *                 enum: [abierto, en_proceso, resuelto]
 *     responses:
 *       200:
 *         description: Estado actualizado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Ticket'
 *       400:
 *         description: Estado inválido
 *       403:
 *         description: Solo puedes actualizar tus tickets asignados
 */
router.put('/:id/estado', requireRole(['admin', 'tecnico']), controller.cambiarEstado)

/**
 * @swagger
 * /api/mantenimiento/{id}:
 *   delete:
 *     tags: [Mantenimiento]
 *     summary: Eliminar ticket
 *     description: Elimina un ticket de mantenimiento.
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
 *         description: Ticket eliminado
 *       404:
 *         description: Solicitud no encontrada
 */
router.delete('/:id', soloAdmin, controller.eliminar)

module.exports = router
