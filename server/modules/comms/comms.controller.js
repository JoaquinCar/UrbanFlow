const service = require('./comms.service')

const fracc = (req) => req.user.fraccionamiento_id

async function listar(req, res, next) {
  try {
    res.json(await service.listar(fracc(req), req.query))
  } catch (err) {
    next(err)
  }
}

async function mios(req, res, next) {
  try {
    res.json(await service.listarParaResidentes(fracc(req), req.query))
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

async function crear(req, res, next) {
  try {
    res.status(201).json(await service.crear(fracc(req), req.user.sub, req.body))
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

async function destinatarios(req, res, next) {
  try {
    const ids = req.query.ids ? String(req.query.ids).split(',') : null
    res.json(await service.previsualizarDestinatarios(fracc(req), ids))
  } catch (err) {
    next(err)
  }
}

// Deja que la interfaz avise ANTES de escribir un comunicado que no podrá
// enviarse por falta de credenciales.
function canales(req, res) {
  res.json(service.estadoCanales())
}

// Verificación del webhook de Meta. Va sin authGuard porque quien llama es
// Meta durante el alta de la suscripción, no un usuario.
function verificarWebhook(req, res) {
  const modo = req.query['hub.mode']
  const token = req.query['hub.verify_token']
  const challenge = req.query['hub.challenge']

  if (modo === 'subscribe' && token && token === process.env.META_VERIFY_TOKEN) {
    // Meta espera el challenge en texto plano, no en JSON.
    return res.status(200).send(String(challenge))
  }
  res.sendStatus(403)
}

module.exports = { listar, mios, obtener, crear, eliminar, destinatarios, canales, verificarWebhook }
