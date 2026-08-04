const express = require('express')
const rateLimit = require('express-rate-limit')
const router = express.Router()
const controller = require('./auth.controller')
const { authGuard } = require('../../shared/middleware/auth.middleware')

// Freno a la fuerza bruta sobre el login.
//
// Solo cuentan los intentos FALLIDOS. Limitar también los que aciertan no
// protege de nada —quien acierta ya tiene la contraseña— y en cambio castiga el
// uso normal: cuatro roles distintos desde la misma IP, una colección de
// peticiones que inicia sesión al principio, o varias personas tras el mismo
// NAT agotaban la cuota en minutos y se quedaban fuera un cuarto de hora.
// La ventana es de 5 minutos y no de 15: quince deja fuera a alguien que se
// equivocó de contraseña un rato largo, y contra la fuerza bruta la diferencia
// es irrelevante —diez intentos cada cinco minutos siguen siendo dos por
// minuto, nada para adivinar una contraseña—.
const VENTANA_MIN = parseInt(process.env.LOGIN_VENTANA_MIN, 10) || 5

const loginLimiter = rateLimit({
  windowMs: VENTANA_MIN * 60 * 1000,
  max: parseInt(process.env.LOGIN_MAX_INTENTOS, 10) || 10,
  skipSuccessfulRequests: true,
  message: { error: `Demasiados intentos fallidos. Intenta de nuevo en ${VENTANA_MIN} minutos.` },
  standardHeaders: true,
  legacyHeaders: false,
})

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     tags: [Auth]
 *     summary: Iniciar sesión
 *     description: Autentica un usuario con email y contraseña. Devuelve un JWT y establece un refresh token en cookie httpOnly.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: admin@urbanflow.com
 *               password:
 *                 type: string
 *                 format: password
 *                 example: UrbanFlow2026!
 *     responses:
 *       200:
 *         description: Login exitoso
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 accessToken:
 *                   type: string
 *                   description: JWT access token
 *                 user:
 *                   $ref: '#/components/schemas/User'
 *       400:
 *         description: Faltan credenciales
 *       401:
 *         description: Credenciales incorrectas
 *       403:
 *         description: Cuenta desactivada
 *       429:
 *         description: Demasiados intentos
 */
router.post('/login', loginLimiter, controller.login)

/**
 * @swagger
 * /api/auth/refresh:
 *   post:
 *     tags: [Auth]
 *     summary: Refrescar access token
 *     description: Usa el refresh token almacenado en cookie httpOnly para generar un nuevo access token.
 *     responses:
 *       200:
 *         description: Token refrescado
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 accessToken:
 *                   type: string
 *       401:
 *         description: Refresh token inválido o expirado
 */
router.post('/refresh', controller.refresh)

/**
 * @swagger
 * /api/auth/logout:
 *   post:
 *     tags: [Auth]
 *     summary: Cerrar sesión
 *     description: Revoca el refresh token y limpia la cookie. No requiere access token válido.
 *     responses:
 *       200:
 *         description: Sesión cerrada
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Sesión cerrada
 */
router.post('/logout', controller.logout)

/**
 * @swagger
 * /api/auth/me:
 *   get:
 *     tags: [Auth]
 *     summary: Obtener usuario actual
 *     description: Retorna los datos del usuario autenticado.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Datos del usuario
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                   format: uuid
 *                 fraccionamiento_id:
 *                   type: string
 *                   format: uuid
 *                 nombre:
 *                   type: string
 *                 email:
 *                   type: string
 *                   format: email
 *                 rol:
 *                   type: string
 *                   enum: [admin, propietario, vigilante, tecnico]
 *                 created_at:
 *                   type: string
 *                   format: date-time
 *       401:
 *         description: No autenticado
 *       404:
 *         description: Usuario no encontrado
 */
router.get('/me', authGuard, controller.me)

/**
 * @swagger
 * /api/auth/change-password:
 *   post:
 *     tags: [Auth]
 *     summary: Cambiar contraseña
 *     description: Cambia la contraseña del usuario autenticado. Se cierra la sesión después del cambio.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [passwordActual, passwordNueva]
 *             properties:
 *               passwordActual:
 *                 type: string
 *                 format: password
 *               passwordNueva:
 *                 type: string
 *                 format: password
 *                 minLength: 8
 *     responses:
 *       200:
 *         description: Contraseña actualizada
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Contraseña actualizada. Inicia sesión de nuevo.
 *       400:
 *         description: Faltan campos o contraseña muy corta
 *       401:
 *         description: Contraseña actual incorrecta
 */
router.post('/change-password', authGuard, controller.cambiarPassword)

module.exports = router
