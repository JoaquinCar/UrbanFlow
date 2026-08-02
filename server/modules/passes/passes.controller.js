const service = require('./passes.service')
const { qrDataUrl } = require('../../shared/utils/qr')

const fracc = (req) => req.user.fraccionamiento_id

async function crear(req, res, next) {
  try {
    const pase = await service.crear(fracc(req), req.user.sub, req.body)
    res.status(201).json({ ...pase, data_url: await qrDataUrl(pase.token) })
  } catch (err) {
    next(err)
  }
}

async function misPases(req, res, next) {
  try {
    res.json(await service.misPases(fracc(req), req.user.sub))
  } catch (err) {
    next(err)
  }
}

async function obtenerQr(req, res, next) {
  try {
    const token = await service.obtenerToken(fracc(req), req.user.sub, req.params.id)
    res.json({ data_url: await qrDataUrl(token) })
  } catch (err) {
    next(err)
  }
}

async function cancelar(req, res, next) {
  try {
    await service.cancelar(fracc(req), req.user.sub, req.params.id)
    res.status(204).end()
  } catch (err) {
    next(err)
  }
}

function tipos(req, res) {
  res.json(service.TIPOS)
}

module.exports = { crear, misPases, obtenerQr, cancelar, tipos }
