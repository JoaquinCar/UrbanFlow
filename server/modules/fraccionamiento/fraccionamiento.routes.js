const express = require('express')
const router = express.Router()
const controller = require('./fraccionamiento.controller')
const { authGuard } = require('../../shared/middleware/auth.middleware')
const { requireRole } = require('../../shared/middleware/role.middleware')

// Todo el módulo requiere sesión.
router.use(authGuard)

const soloAdmin = requireRole(['admin'])

// Datos del fraccionamiento
router.get('/', controller.obtener)
router.put('/', soloAdmin, controller.actualizar)

// Panel de administración. Lee de seis tablas distintas, por eso vive aquí:
// el fraccionamiento es lo único que las abarca a todas.
router.get('/dashboard', soloAdmin, controller.dashboard)

// Mapa y catálogos
router.get('/mapa', controller.obtenerMapa)
router.get('/etapas', controller.listarEtapas)

// Lotes. El vigilante necesita leerlos para elegir el lote destino de una
// visita y el propietario para ver el suyo; escribir es solo de admin.
router.get('/lotes', controller.listarLotes)
router.post('/lotes', soloAdmin, controller.crearLote)
router.get('/lotes/:id', controller.obtenerLote)
router.put('/lotes/:id', soloAdmin, controller.actualizarLote)
router.delete('/lotes/:id', soloAdmin, controller.eliminarLote)
router.put('/lotes/:id/propietario', soloAdmin, controller.asignarPropietario)

module.exports = router
