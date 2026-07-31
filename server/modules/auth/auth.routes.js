const express = require('express')
const rateLimit = require('express-rate-limit')
const router = express.Router()
const controller = require('./auth.controller')
const { authGuard } = require('../../shared/middleware/auth.middleware')

// El máximo es configurable para poder correr las pruebas de extremo a extremo,
// que hacen muchos logins seguidos, sin bajarlo en producción.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min window
  max: parseInt(process.env.LOGIN_MAX_INTENTOS, 10) || 10, // por IP y ventana
  message: { error: 'Demasiados intentos. Intenta de nuevo en 15 minutos.' },
  standardHeaders: true,
  legacyHeaders: false,
})

// POST /api/auth/login
router.post('/login', loginLimiter, controller.login)

// POST /api/auth/refresh  (refresh token en httpOnly cookie)
router.post('/refresh', controller.refresh)

// POST /api/auth/logout  (no requiere access token válido — usa cookie)
router.post('/logout', controller.logout)

// GET /api/auth/me
router.get('/me', authGuard, controller.me)

// POST /api/auth/change-password
router.post('/change-password', authGuard, controller.cambiarPassword)

module.exports = router
