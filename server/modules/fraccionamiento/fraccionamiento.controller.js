const service = require('./fraccionamiento.service')

// El fraccionamiento siempre sale del token, nunca del cuerpo o la URL: es lo
// que impide que un admin toque datos de otro fraccionamiento.
const fracc = (req) => req.user.fraccionamiento_id

async function obtener(req, res, next) {
  try {
    res.json(await service.obtenerFraccionamiento(fracc(req)))
  } catch (err) {
    next(err)
  }
}

async function actualizar(req, res, next) {
  try {
    res.json(await service.actualizarFraccionamiento(fracc(req), req.body))
  } catch (err) {
    next(err)
  }
}

async function listarLotes(req, res, next) {
  try {
    res.json(await service.listarLotes(fracc(req), req.query))
  } catch (err) {
    next(err)
  }
}

async function obtenerLote(req, res, next) {
  try {
    res.json(await service.obtenerLote(fracc(req), req.params.id))
  } catch (err) {
    next(err)
  }
}

async function crearLote(req, res, next) {
  try {
    res.status(201).json(await service.crearLote(fracc(req), req.body))
  } catch (err) {
    next(err)
  }
}

async function actualizarLote(req, res, next) {
  try {
    res.json(await service.actualizarLote(fracc(req), req.params.id, req.body))
  } catch (err) {
    next(err)
  }
}

async function eliminarLote(req, res, next) {
  try {
    await service.eliminarLote(fracc(req), req.params.id)
    res.status(204).end()
  } catch (err) {
    next(err)
  }
}

async function asignarPropietario(req, res, next) {
  try {
    // propietario_id en null desvincula el lote y lo devuelve a disponible.
    const { propietario_id } = req.body
    if (propietario_id === undefined) {
      return res.status(400).json({ error: 'propietario_id es requerido (usa null para desasignar)' })
    }
    res.json(await service.asignarPropietario(fracc(req), req.params.id, propietario_id))
  } catch (err) {
    next(err)
  }
}

async function obtenerMapa(req, res, next) {
  try {
    res.json(await service.obtenerMapa(fracc(req)))
  } catch (err) {
    next(err)
  }
}

async function dashboard(req, res, next) {
  try {
    const [metricas, actividad] = await Promise.all([
      service.obtenerMetricas(fracc(req)),
      service.actividadReciente(fracc(req)),
    ])
    res.json({ ...metricas, actividad })
  } catch (err) {
    next(err)
  }
}

async function listarEtapas(req, res, next) {
  try {
    res.json(await service.listarEtapas(fracc(req)))
  } catch (err) {
    next(err)
  }
}

module.exports = {
  obtener,
  actualizar,
  listarLotes,
  obtenerLote,
  crearLote,
  actualizarLote,
  eliminarLote,
  asignarPropietario,
  obtenerMapa,
  listarEtapas,
  dashboard,
}
