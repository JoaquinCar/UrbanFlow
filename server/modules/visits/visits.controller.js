const service = require('./visits.service')
const { emitirCaseta } = require('../../shared/utils/realtime')

const fracc = (req) => req.user.fraccionamiento_id

async function registrarEntrada(req, res, next) {
  try {
    const visita = await service.registrarEntrada(fracc(req), req.user.sub, req.body)
    // Se emite DESPUÉS de que la escritura haya ido bien: nunca se anuncia una
    // visita que no llegó a guardarse.
    emitirCaseta(req, 'nueva-visita', visita)
    res.status(201).json(visita)
  } catch (err) {
    next(err)
  }
}

async function entradaPorQr(req, res, next) {
  try {
    const resultado = await service.entradaPorQr(fracc(req), req.user.sub, req.body.token)
    emitirCaseta(req, 'qr-entrada', resultado)
    res.status(201).json(resultado)
  } catch (err) {
    next(err)
  }
}

async function registrarSalida(req, res, next) {
  try {
    const visita = await service.registrarSalida(fracc(req), req.params.id)
    emitirCaseta(req, 'salida-visita', visita)
    res.json(visita)
  } catch (err) {
    next(err)
  }
}

async function listarActivas(req, res, next) {
  try {
    res.json(await service.listarActivas(fracc(req)))
  } catch (err) {
    next(err)
  }
}

async function bitacora(req, res, next) {
  try {
    res.json(await service.bitacora(fracc(req), req.query))
  } catch (err) {
    next(err)
  }
}

async function bitacoraCsv(req, res, next) {
  try {
    const csv = await service.bitacoraCsv(fracc(req), req.query)
    const hoy = new Date().toISOString().slice(0, 10)
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="bitacora-${hoy}.csv"`)
    res.send(csv)
  } catch (err) {
    next(err)
  }
}

async function misVisitas(req, res, next) {
  try {
    res.json(await service.listarPorPropietario(fracc(req), req.user.sub, req.query))
  } catch (err) {
    next(err)
  }
}

async function obtener(req, res, next) {
  try {
    res.json(await service.obtener(fracc(req), req.params.id))
  } catch (err) {
    next(err)
  }
}

async function tipos(req, res) {
  res.json(service.TIPOS)
}

module.exports = {
  registrarEntrada,
  entradaPorQr,
  registrarSalida,
  listarActivas,
  bitacora,
  bitacoraCsv,
  misVisitas,
  obtener,
  tipos,
}
