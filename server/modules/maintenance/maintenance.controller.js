const service = require('./maintenance.service')
const { httpError } = require('../../shared/utils/errors')

const fracc = (req) => req.user.fraccionamiento_id

// Un ticket lo puede ver quien lo reportó, el técnico asignado, o cualquier
// administrador. El rol por sí solo no alcanza: 'tecnico' y 'propietario' son
// roles compartidos por varias personas.
function exigirAcceso(req, ticket) {
  if (req.user.rol === 'admin') return
  const esSolicitante = ticket.solicitante_id === req.user.sub
  const esAsignado = ticket.tecnico_id === req.user.sub
  if (!esSolicitante && !esAsignado) throw httpError(403, 'Acceso denegado')
}

async function listar(req, res, next) {
  try {
    res.json(await service.listar(fracc(req), req.query))
  } catch (err) {
    next(err)
  }
}

async function mios(req, res, next) {
  try {
    res.json(await service.listarPropios(fracc(req), req.user, req.query))
  } catch (err) {
    next(err)
  }
}

async function tecnicos(req, res, next) {
  try {
    res.json(await service.listarTecnicos(fracc(req)))
  } catch (err) {
    next(err)
  }
}

async function crear(req, res, next) {
  try {
    res.status(201).json(await service.crear(fracc(req), req.user.sub, req.body))
  } catch (err) {
    next(err)
  }
}

async function obtener(req, res, next) {
  try {
    const ticket = await service.obtener(fracc(req), req.params.id)
    exigirAcceso(req, ticket)
    res.json(ticket)
  } catch (err) {
    next(err)
  }
}

async function actualizar(req, res, next) {
  try {
    res.json(await service.actualizar(fracc(req), req.params.id, req.body))
  } catch (err) {
    next(err)
  }
}

async function asignar(req, res, next) {
  try {
    res.json(await service.asignar(fracc(req), req.params.id, req.body.tecnico_id))
  } catch (err) {
    next(err)
  }
}

async function cambiarEstado(req, res, next) {
  try {
    // El técnico solo mueve el estado de los tickets que tiene asignados.
    if (req.user.rol === 'tecnico') {
      const ticket = await service.obtener(fracc(req), req.params.id)
      if (ticket.tecnico_id !== req.user.sub) {
        throw httpError(403, 'Solo puedes actualizar los tickets que tienes asignados')
      }
    }
    res.json(await service.cambiarEstado(fracc(req), req.params.id, req.body.estado))
  } catch (err) {
    next(err)
  }
}

async function eliminar(req, res, next) {
  try {
    await service.eliminar(fracc(req), req.params.id)
    res.status(204).end()
  } catch (err) {
    next(err)
  }
}

async function estados(req, res) {
  res.json(service.ESTADOS)
}

module.exports = {
  listar,
  mios,
  tecnicos,
  crear,
  obtener,
  actualizar,
  asignar,
  cambiarEstado,
  eliminar,
  estados,
}
