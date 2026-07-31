const service = require('./reservations.service')

const fracc = (req) => req.user.fraccionamiento_id

// ── Áreas ───────────────────────────────────────────────────────────────────

async function listarAreas(req, res, next) {
  try {
    res.json(await service.listarAreas(fracc(req), req.query))
  } catch (err) { next(err) }
}

async function crearArea(req, res, next) {
  try {
    res.status(201).json(await service.crearArea(fracc(req), req.body))
  } catch (err) { next(err) }
}

async function actualizarArea(req, res, next) {
  try {
    res.json(await service.actualizarArea(fracc(req), req.params.id, req.body))
  } catch (err) { next(err) }
}

async function eliminarArea(req, res, next) {
  try {
    await service.eliminarArea(fracc(req), req.params.id)
    res.status(204).end()
  } catch (err) { next(err) }
}

async function disponibilidad(req, res, next) {
  try {
    res.json(await service.disponibilidad(fracc(req), req.params.id, req.query.fecha))
  } catch (err) { next(err) }
}

// ── Reservaciones ───────────────────────────────────────────────────────────

async function listar(req, res, next) {
  try {
    res.json(await service.listar(fracc(req), req.query))
  } catch (err) { next(err) }
}

async function mias(req, res, next) {
  try {
    res.json(await service.listarPropias(fracc(req), req.user.sub))
  } catch (err) { next(err) }
}

async function obtener(req, res, next) {
  try {
    const reserva = await service.obtener(fracc(req), req.params.id)
    // Un propietario solo ve las suyas; el administrador, todas.
    if (req.user.rol !== 'admin' && reserva.usuario_id !== req.user.sub) {
      return res.status(403).json({ error: 'Acceso denegado' })
    }
    res.json(reserva)
  } catch (err) { next(err) }
}

async function crear(req, res, next) {
  try {
    res.status(201).json(await service.crear(fracc(req), req.user, req.body))
  } catch (err) { next(err) }
}

async function actualizarEstado(req, res, next) {
  try {
    res.json(await service.actualizarEstado(fracc(req), req.params.id, req.body.estado))
  } catch (err) { next(err) }
}

async function cancelar(req, res, next) {
  try {
    res.json(await service.cancelar(fracc(req), req.params.id, req.user))
  } catch (err) { next(err) }
}

async function eliminar(req, res, next) {
  try {
    await service.eliminar(fracc(req), req.params.id)
    res.status(204).end()
  } catch (err) { next(err) }
}

module.exports = {
  listarAreas, crearArea, actualizarArea, eliminarArea, disponibilidad,
  listar, mias, obtener, crear, actualizarEstado, cancelar, eliminar,
}
