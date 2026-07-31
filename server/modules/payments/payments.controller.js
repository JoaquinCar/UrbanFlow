const service = require('./payments.service')
const { httpError } = require('../../shared/utils/errors')
const { generarReciboBuffer } = require('./payments.pdf')

const fracc = (req) => req.user.fraccionamiento_id

async function listarCuotas(req, res, next) {
  try {
    res.json(await service.listarCuotas(fracc(req), req.query))
  } catch (err) {
    next(err)
  }
}

async function misCuotas(req, res, next) {
  try {
    const propietarioId = await service.obtenerPropietarioDeUsuario(fracc(req), req.user.sub)
    res.json(await service.estadoDeCuenta(fracc(req), propietarioId))
  } catch (err) {
    next(err)
  }
}

async function estadoDeCuenta(req, res, next) {
  try {
    res.json(await service.estadoDeCuenta(fracc(req), req.params.propietarioId))
  } catch (err) {
    next(err)
  }
}

async function crearCuota(req, res, next) {
  try {
    res.status(201).json(await service.crearCuotaExtraordinaria(fracc(req), req.body))
  } catch (err) {
    next(err)
  }
}

async function actualizarCuota(req, res, next) {
  try {
    res.json(await service.actualizarCuota(fracc(req), req.params.id, req.body))
  } catch (err) {
    next(err)
  }
}

async function eliminarCuota(req, res, next) {
  try {
    await service.eliminarCuota(fracc(req), req.params.id)
    res.status(204).end()
  } catch (err) {
    next(err)
  }
}

async function generarMensuales(req, res, next) {
  try {
    res.json(await service.generarMensuales(fracc(req), req.body?.mes_anio))
  } catch (err) {
    next(err)
  }
}

async function morosos(req, res, next) {
  try {
    res.json(await service.listarMorosos(fracc(req)))
  } catch (err) {
    next(err)
  }
}

async function checkout(req, res, next) {
  try {
    const { cuota_id } = req.body
    if (!cuota_id) return res.status(400).json({ error: 'cuota_id es requerido' })
    res.status(201).json(await service.crearPreferencia(fracc(req), cuota_id, req.user))
  } catch (err) {
    next(err)
  }
}

async function pagoManual(req, res, next) {
  try {
    res.status(201).json(await service.registrarPagoManual(fracc(req), req.body))
  } catch (err) {
    next(err)
  }
}

// Webhook de MercadoPago. Va sin authGuard: quien llama es MercadoPago, no un
// usuario, y la autenticidad se comprueba con la firma HMAC.
async function webhook(req, res) {
  try {
    const resultado = await service.procesarWebhook(req)
    res.status(200).json({ received: true, ...resultado })
  } catch (err) {
    // La firma inválida sí se responde con 401: es el único caso en que
    // queremos que MercadoPago sepa que rechazamos el aviso.
    if (err.status === 401) {
      return res.status(401).json({ error: err.message })
    }
    // Cualquier otro fallo se registra pero se responde 200. Un 5xx haría que
    // MercadoPago reintentara indefinidamente ante un error permanente nuestro.
    console.error('[pagos/webhook] error procesando notificación:', err.message)
    res.status(200).json({ received: true, error: err.message })
  }
}

async function listarPagos(req, res, next) {
  try {
    res.json(await service.listarPagos(fracc(req), req.query))
  } catch (err) {
    next(err)
  }
}

async function recibo(req, res, next) {
  try {
    const datos = await service.obtenerPagoParaRecibo(fracc(req), req.params.id)

    // Un propietario solo descarga sus propios recibos.
    if (req.user.rol === 'propietario' && datos.usuario_id !== req.user.sub) {
      throw httpError(403, 'Acceso denegado')
    }

    const buffer = await generarReciboBuffer(datos)
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Length', buffer.length)
    res.setHeader('Content-Disposition', `attachment; filename="recibo-${datos.pago_id}.pdf"`)
    res.send(buffer)
  } catch (err) {
    next(err)
  }
}

module.exports = {
  listarCuotas,
  misCuotas,
  estadoDeCuenta,
  crearCuota,
  actualizarCuota,
  eliminarCuota,
  generarMensuales,
  morosos,
  checkout,
  pagoManual,
  webhook,
  listarPagos,
  recibo,
}
