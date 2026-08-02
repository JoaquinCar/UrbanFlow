const express = require('express')
const router = express.Router()
const controller = require('./payments.controller')
const { authGuard } = require('../../shared/middleware/auth.middleware')
const { requireRole } = require('../../shared/middleware/role.middleware')

/**
 * @swagger
 * /api/pagos/webhook:
 *   post:
 *     tags: [Pagos]
 *     summary: Webhook de MercadoPago
 *     description: Endpoint que recibe notificaciones de MercadoPago. No requiere autenticación JWT; la firma se valida con HMAC.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             description: Payload de MercadoPago
 *     responses:
 *       200:
 *         description: Notificación recibida
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 received:
 *                   type: boolean
 *                 registrado:
 *                   type: boolean
 *                 duplicado:
 *                   type: boolean
 *                 cuota_id:
 *                   type: string
 *                   format: uuid
 *       401:
 *         description: Firma inválida
 */
router.post('/webhook', controller.webhook)

router.use(authGuard)

const soloAdmin = requireRole(['admin'])

/**
 * @swagger
 * /api/pagos/cuotas/mias:
 *   get:
 *     tags: [Pagos]
 *     summary: Mis cuotas
 *     description: Retorna las cuotas del propietario autenticado con sus totales por estado.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Cuotas del propietario
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 propietario:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       format: uuid
 *                     nombre_completo:
 *                       type: string
 *                     email:
 *                       type: string
 *                 cuotas:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Cuota'
 *                 totales:
 *                   type: object
 *                   properties:
 *                     pendiente:
 *                       type: number
 *                     pagado:
 *                       type: number
 *                     vencido:
 *                       type: number
 *                     adeudo:
 *                       type: number
 */
router.get('/cuotas/mias', requireRole(['propietario']), controller.misCuotas)

/**
 * @swagger
 * /api/pagos/cuotas/generar:
 *   post:
 *     tags: [Pagos]
 *     summary: Generar cuotas mensuales
 *     description: Genera cuotas para todos los propietarios del fraccionamiento para un mes dado. También marca como vencidas las cuotas de meses anteriores.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               mes_anio:
 *                 type: string
 *                 description: Mes en formato YYYY-MM-DD. Si se omite usa el mes actual.
 *                 example: 2026-07-01
 *     responses:
 *       200:
 *         description: Cuotas generadas
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 insertadas:
 *                   type: integer
 *                 marcadas_vencidas:
 *                   type: integer
 */
router.post('/cuotas/generar', soloAdmin, controller.generarMensuales)

/**
 * @swagger
 * /api/pagos/cuotas:
 *   get:
 *     tags: [Pagos]
 *     summary: Listar cuotas (admin)
 *     description: Lista todas las cuotas del fraccionamiento con filtros y paginación.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: estado
 *         schema:
 *           type: string
 *           enum: [pendiente, pagado, vencido]
 *       - in: query
 *         name: mes
 *         schema:
 *           type: string
 *         description: Filtrar por mes (YYYY-MM)
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
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *     responses:
 *       200:
 *         description: Lista de cuotas
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 items:
 *                   type: array
 *                   items:
 *                     allOf:
 *                       - $ref: '#/components/schemas/Cuota'
 *                       - type: object
 *                         properties:
 *                           propietario_nombre:
 *                             type: string
 *                 total:
 *                   type: integer
 *                 resumen:
 *                   type: object
 *                   properties:
 *                     total:
 *                       type: number
 *                     monto_pendiente:
 *                       type: number
 *                     monto_cobrado:
 *                       type: number
 */
router.get('/cuotas', soloAdmin, controller.listarCuotas)

/**
 * @swagger
 * /api/pagos/cuotas:
 *   post:
 *     tags: [Pagos]
 *     summary: Crear cuota manual
 *     description: Crea una cuota para un propietario específico o para todos.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [monto, concepto]
 *             properties:
 *               propietario_id:
 *                 type: string
 *                 format: uuid
 *                 description: UUID del propietario o "todos" para crear a todos
 *               monto:
 *                 type: number
 *               mes_anio:
 *                 type: string
 *                 example: 2026-07-01
 *               concepto:
 *                 type: string
 *     responses:
 *       201:
 *         description: Cuotas creadas
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 creadas:
 *                   type: integer
 *                 mes_anio:
 *                   type: string
 */
router.post('/cuotas', soloAdmin, controller.crearCuota)

/**
 * @swagger
 * /api/pagos/cuotas/{propietarioId}:
 *   get:
 *     tags: [Pagos]
 *     summary: Estado de cuenta de un propietario
 *     description: Retorna las cuotas y totales de un propietario específico.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: propietarioId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Estado de cuenta
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 propietario:
 *                   type: object
 *                 cuotas:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Cuota'
 *                 totales:
 *                   type: object
 *       404:
 *         description: Propietario no encontrado
 */
router.get('/cuotas/:propietarioId', soloAdmin, controller.estadoDeCuenta)

/**
 * @swagger
 * /api/pagos/cuotas/{id}:
 *   put:
 *     tags: [Pagos]
 *     summary: Actualizar cuota
 *     description: Modifica el monto, concepto o estado de una cuota.
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
 *               monto:
 *                 type: number
 *               concepto:
 *                 type: string
 *               estado:
 *                 type: string
 *                 enum: [pendiente, pagado, vencido]
 *     responses:
 *       200:
 *         description: Cuota actualizada
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Cuota'
 *       404:
 *         description: Cuota no encontrada
 */
router.put('/cuotas/:id', soloAdmin, controller.actualizarCuota)

/**
 * @swagger
 * /api/pagos/cuotas/{id}:
 *   delete:
 *     tags: [Pagos]
 *     summary: Eliminar cuota
 *     description: Elimina una cuota. No se puede eliminar si tiene pagos registrados.
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
 *         description: Cuota eliminada
 *       404:
 *         description: Cuota no encontrada
 *       409:
 *         description: La cuota tiene pagos registrados
 */
router.delete('/cuotas/:id', soloAdmin, controller.eliminarCuota)

/**
 * @swagger
 * /api/pagos/morosos:
 *   get:
 *     tags: [Pagos]
 *     summary: Listar morosos
 *     description: Retorna propietarios con cuotas vencidas, ordenados por monto adeudado descendente.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de morosos
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   propietario_id:
 *                     type: string
 *                     format: uuid
 *                   nombre_completo:
 *                     type: string
 *                   telefono:
 *                     type: string
 *                   whatsapp:
 *                     type: string
 *                   email:
 *                     type: string
 *                   cuotas_vencidas:
 *                     type: integer
 *                   monto_adeudado:
 *                     type: number
 *                   desde:
 *                     type: string
 */
router.get('/morosos', soloAdmin, controller.morosos)

/**
 * @swagger
 * /api/pagos/checkout:
 *   post:
 *     tags: [Pagos]
 *     summary: Iniciar pago (checkout)
 *     description: Crea una preferencia de MercadoPago para pagar una cuota. Devuelve la URL de redirección.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [cuota_id]
 *             properties:
 *               cuota_id:
 *                 type: string
 *                 format: uuid
 *     responses:
 *       201:
 *         description: Preferencia de pago creada
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 preference_id:
 *                   type: string
 *                 init_point:
 *                   type: string
 *                   description: URL de pago en MercadoPago
 *                 sandbox_init_point:
 *                   type: string
 *       400:
 *         description: cuota_id requerido
 *       404:
 *         description: Cuota no encontrada
 *       409:
 *         description: Cuota ya pagada
 *       403:
 *         description: Solo puedes pagar tus propias cuotas
 */
router.post('/checkout', requireRole(['propietario', 'admin']), controller.checkout)

/**
 * @swagger
 * /api/pagos/manual:
 *   post:
 *     tags: [Pagos]
 *     summary: Registrar pago manual
 *     description: Registra un pago fuera de línea (efectivo o transferencia).
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [cuota_id, metodo]
 *             properties:
 *               cuota_id:
 *                 type: string
 *                 format: uuid
 *               monto_pagado:
 *                 type: number
 *               metodo:
 *                 type: string
 *                 enum: [efectivo, transferencia]
 *               referencia:
 *                 type: string
 *     responses:
 *       201:
 *         description: Pago registrado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Pago'
 */
router.post('/manual', soloAdmin, controller.pagoManual)

/**
 * @swagger
 * /api/pagos/:
 *   get:
 *     tags: [Pagos]
 *     summary: Listar pagos
 *     description: Retorna el historial de pagos del fraccionamiento con filtros y paginación.
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
 *         name: metodo
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
 *         description: Lista de pagos
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 items:
 *                   type: array
 *                   items:
 *                     allOf:
 *                       - $ref: '#/components/schemas/Pago'
 *                       - type: object
 *                         properties:
 *                           mes_anio:
 *                             type: string
 *                           concepto:
 *                             type: string
 *                           tipo:
 *                             type: string
 *                           propietario_nombre:
 *                             type: string
 *                 total:
 *                   type: integer
 */
router.get('/', soloAdmin, controller.listarPagos)

/**
 * @swagger
 * /api/pagos/{id}/pdf:
 *   get:
 *     tags: [Pagos]
 *     summary: Descargar recibo PDF
 *     description: Genera y descarga el recibo de pago en formato PDF.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: ID del pago
 *     responses:
 *       200:
 *         description: Archivo PDF
 *         content:
 *           application/pdf:
 *             schema:
 *               type: string
 *               format: binary
 *       404:
 *         description: Pago no encontrado
 */
router.get('/:id/pdf', requireRole(['admin', 'propietario']), controller.recibo)

module.exports = router
