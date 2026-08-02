const express = require('express')
const router = express.Router()
const controller = require('./reservations.controller')
const { authGuard } = require('../../shared/middleware/auth.middleware')
const { requireRole } = require('../../shared/middleware/role.middleware')

router.use(authGuard)

const soloAdmin = requireRole(['admin'])

/**
 * @swagger
 * /api/reservaciones/areas:
 *   get:
 *     tags: [Reservaciones]
 *     summary: Listar áreas
 *     description: Retorna las áreas comunes del fraccionamiento.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: activa
 *         schema:
 *           type: string
 *           enum: ['true']
 *         description: Filtrar solo áreas activas
 *     responses:
 *       200:
 *         description: Lista de áreas
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Area'
 */
router.get('/areas', controller.listarAreas)

/**
 * @swagger
 * /api/reservaciones/areas:
 *   post:
 *     tags: [Reservaciones]
 *     summary: Crear área
 *     description: Crea una nueva área común para reservaciones.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [nombre]
 *             properties:
 *               nombre:
 *                 type: string
 *               capacidad:
 *                 type: integer
 *                 minimum: 1
 *               activa:
 *                 type: boolean
 *                 default: true
 *     responses:
 *       201:
 *         description: Área creada
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Area'
 *       400:
 *         description: Nombre requerido o capacidad inválida
 *       409:
 *         description: Ya existe un área con ese nombre
 */
router.post('/areas', soloAdmin, controller.crearArea)

/**
 * @swagger
 * /api/reservaciones/areas/{id}/disponibilidad:
 *   get:
 *     tags: [Reservaciones]
 *     summary: Consultar disponibilidad
 *     description: Retorna las reservaciones existentes para un área en una fecha específica.
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
 *         name: fecha
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *           example: '2026-07-15'
 *     responses:
 *       200:
 *         description: Disponibilidad del área
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 area:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     nombre:
 *                       type: string
 *                     capacidad:
 *                       type: integer
 *                       nullable: true
 *                     activa:
 *                       type: boolean
 *                 fecha:
 *                   type: string
 *                 ocupado:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       hora_inicio:
 *                         type: string
 *                       hora_fin:
 *                         type: string
 *                       estado:
 *                         type: string
 *                       propietario_nombre:
 *                         type: string
 *       400:
 *         description: Fecha requerida
 *       404:
 *         description: Área no encontrada
 */
router.get('/areas/:id/disponibilidad', controller.disponibilidad)

/**
 * @swagger
 * /api/reservaciones/areas/{id}:
 *   put:
 *     tags: [Reservaciones]
 *     summary: Actualizar área
 *     description: Actualiza el nombre, capacidad o estado de un área.
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
 *               nombre:
 *                 type: string
 *               capacidad:
 *                 type: integer
 *               activa:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Área actualizada
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Area'
 *       404:
 *         description: Área no encontrada
 *       409:
 *         description: Ya existe un área con ese nombre
 */
router.put('/areas/:id', soloAdmin, controller.actualizarArea)

/**
 * @swagger
 * /api/reservaciones/areas/{id}:
 *   delete:
 *     tags: [Reservaciones]
 *     summary: Eliminar área
 *     description: Elimina un área. No se puede eliminar si tiene reservaciones registradas.
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
 *         description: Área eliminada
 *       404:
 *         description: Área no encontrada
 *       409:
 *         description: El área tiene reservaciones registradas
 */
router.delete('/areas/:id', soloAdmin, controller.eliminarArea)

/**
 * @swagger
 * /api/reservaciones/mias:
 *   get:
 *     tags: [Reservaciones]
 *     summary: Mis reservaciones
 *     description: Retorna las reservaciones del propietario autenticado.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de reservaciones
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Reservacion'
 */
router.get('/mias', requireRole(['propietario']), controller.mias)

/**
 * @swagger
 * /api/reservaciones/:
 *   get:
 *     tags: [Reservaciones]
 *     summary: Listar reservaciones
 *     description: Retorna todas las reservaciones del fraccionamiento con filtros.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: area_id
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: fecha
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: estado
 *         schema:
 *           type: string
 *           enum: [pendiente, confirmada, cancelada]
 *       - in: query
 *         name: propietario_id
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *     responses:
 *       200:
 *         description: Reservaciones paginadas
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 items:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Reservacion'
 *                 total:
 *                   type: integer
 */
router.get('/', soloAdmin, controller.listar)

/**
 * @swagger
 * /api/reservaciones/:
 *   post:
 *     tags: [Reservaciones]
 *     summary: Crear reservación
 *     description: Crea una nueva reservación para un área común. Verifica disponibilidad del horario.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [area_id, fecha, hora_inicio, hora_fin]
 *             properties:
 *               area_id:
 *                 type: string
 *                 format: uuid
 *               fecha:
 *                 type: string
 *                 format: date
 *                 example: '2026-07-15'
 *               hora_inicio:
 *                 type: string
 *                 example: '10:00'
 *               hora_fin:
 *                 type: string
 *                 example: '12:00'
 *               propietario_id:
 *                 type: string
 *                 format: uuid
 *                 description: Solo admin puede reservar a nombre de otro propietario
 *     responses:
 *       201:
 *         description: Reservación creada
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Reservacion'
 *       400:
 *         description: Faltan campos o horario inválido
 *       404:
 *         description: Área no encontrada
 *       409:
 *         description: Horario ocupado o área no disponible
 */
router.post('/', requireRole(['propietario', 'admin']), controller.crear)

/**
 * @swagger
 * /api/reservaciones/{id}:
 *   get:
 *     tags: [Reservaciones]
 *     summary: Obtener reservación
 *     description: Retorna los datos de una reservación específica.
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
 *         description: Reservación
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Reservacion'
 *       404:
 *         description: Reservación no encontrada
 *       403:
 *         description: Acceso denegado
 */
router.get('/:id', requireRole(['admin', 'propietario']), controller.obtener)

/**
 * @swagger
 * /api/reservaciones/{id}:
 *   put:
 *     tags: [Reservaciones]
 *     summary: Actualizar estado de reservación
 *     description: Cambia el estado de una reservación (admin only).
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
 *                 enum: [pendiente, confirmada, cancelada]
 *     responses:
 *       200:
 *         description: Estado actualizado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Reservacion'
 *       400:
 *         description: Estado inválido
 *       404:
 *         description: Reservación no encontrada
 */
router.put('/:id', soloAdmin, controller.actualizarEstado)

/**
 * @swagger
 * /api/reservaciones/{id}/cancelar:
 *   put:
 *     tags: [Reservaciones]
 *     summary: Cancelar reservación
 *     description: Cancela una reservación. El propietario solo puede cancelar las suyas.
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
 *         description: Reservación cancelada
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Reservacion'
 *       404:
 *         description: Reservación no encontrada
 *       403:
 *         description: Solo puedes cancelar tus propias reservaciones
 *       409:
 *         description: Ya estaba cancelada
 */
router.put('/:id/cancelar', requireRole(['admin', 'propietario']), controller.cancelar)

/**
 * @swagger
 * /api/reservaciones/{id}:
 *   delete:
 *     tags: [Reservaciones]
 *     summary: Eliminar reservación
 *     description: Elimina una reservación permanentemente.
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
 *         description: Reservación eliminada
 *       404:
 *         description: Reservación no encontrada
 */
router.delete('/:id', soloAdmin, controller.eliminar)

module.exports = router
