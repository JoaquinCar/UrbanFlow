const express = require('express')
const router = express.Router()
const controller = require('./auth.controller')
const { authGuard } = require('../../shared/middleware/auth.middleware')

// POST /api/auth/login
router.post('/login', controller.login)

// GET /api/auth/me (requiere autenticación)
router.get('/me', authGuard, controller.me)

module.exports = router
