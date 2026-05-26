const express = require('express')
const rateLimit = require('express-rate-limit')
const router = express.Router()
const controller = require('./auth.controller')
const { authGuard } = require('../../shared/middleware/auth.middleware')

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min window
  max: 10,                   // 10 attempts per window per IP
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

module.exports = router
