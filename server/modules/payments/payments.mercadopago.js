const crypto = require('crypto')
const { MercadoPagoConfig, Preference, Payment } = require('mercadopago')
const { httpError } = require('../../shared/utils/errors')

// Integración real con MercadoPago. Sin credenciales configuradas, estas
// funciones lanzan un 500 con un mensaje explícito en lugar de fingir que
// funcionan: un pago simulado que parece exitoso es peor que un error claro.

function cliente() {
  const accessToken = process.env.MP_ACCESS_TOKEN
  if (!accessToken) {
    throw httpError(500, 'MP_ACCESS_TOKEN no configurado. Añádelo a server/.env para habilitar el pago en línea.')
  }
  return new MercadoPagoConfig({ accessToken, options: { timeout: 10000 } })
}

function configurado() {
  return Boolean(process.env.MP_ACCESS_TOKEN)
}

async function crearPreferencia({ cuota, propietario }) {
  const preference = new Preference(cliente())

  const respuesta = await preference.create({
    body: {
      items: [{
        id: cuota.id,
        title: cuota.concepto || `Cuota ${cuota.tipo}`,
        quantity: 1,
        unit_price: Number(cuota.monto),
        currency_id: process.env.MP_CURRENCY || 'MXN',
      }],
      payer: {
        name: propietario.nombre_completo,
        email: propietario.email,
      },
      // Clave de reconciliación: es lo que permite saber a qué cuota
      // corresponde el pago cuando llega el webhook.
      external_reference: cuota.id,
      notification_url: `${process.env.PUBLIC_URL}/api/pagos/webhook`,
      back_urls: {
        success: process.env.MP_BACK_URL_SUCCESS,
        failure: process.env.MP_BACK_URL_FAILURE,
        pending: process.env.MP_BACK_URL_PENDING,
      },
      auto_return: 'approved',
    },
  })

  return {
    preference_id: respuesta.id,
    init_point: respuesta.init_point,
    sandbox_init_point: respuesta.sandbox_init_point,
  }
}

// Valida la firma HMAC del webhook.
//
// MercadoPago manda la cabecera x-signature con el formato
//   ts=1704908010,v1=618c85345248dd820d5fd456117c2ab2ef8eda45a0282ff693eac24131a5e839
// y el manifiesto que se firma es literalmente:
//   id:<data.id>;request-id:<x-request-id>;ts:<ts>;
//
// Sin esta validación, cualquiera que conozca la URL del webhook podría marcar
// cuotas como pagadas mandando un POST.
function validarFirma(req) {
  const secret = process.env.MP_WEBHOOK_SECRET
  if (!secret) {
    throw httpError(500, 'MP_WEBHOOK_SECRET no configurado. El webhook no puede validarse.')
  }

  const signature = req.headers['x-signature']
  const requestId = req.headers['x-request-id']
  if (!signature) throw httpError(401, 'Firma ausente')

  const partes = Object.fromEntries(
    String(signature).split(',').map(p => {
      const i = p.indexOf('=')
      return [p.slice(0, i).trim(), p.slice(i + 1).trim()]
    })
  )

  const { ts, v1 } = partes
  if (!ts || !v1) throw httpError(401, 'Firma malformada')

  // MercadoPago exige data.id en minúsculas cuando es alfanumérico.
  const dataId = String(req.query['data.id'] || req.query.id || '').toLowerCase()

  let manifest = ''
  if (dataId) manifest += `id:${dataId};`
  if (requestId) manifest += `request-id:${requestId};`
  manifest += `ts:${ts};`

  const esperado = crypto.createHmac('sha256', secret).update(manifest).digest('hex')

  // timingSafeEqual exige buffers del mismo tamaño; si v1 no es hex válido de
  // 32 bytes, la comparación de longitud lo descarta antes.
  let a, b
  try {
    a = Buffer.from(esperado, 'hex')
    b = Buffer.from(v1, 'hex')
  } catch {
    throw httpError(401, 'Firma inválida')
  }
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    throw httpError(401, 'Firma inválida')
  }

  return dataId
}

// El estado autoritativo se lee de la API, nunca del cuerpo de la notificación:
// el aviso solo dice "algo pasó con el pago X", y su contenido no está firmado
// campo por campo.
async function obtenerPago(paymentId) {
  return new Payment(cliente()).get({ id: paymentId })
}

module.exports = { crearPreferencia, validarFirma, obtenerPago, configurado }
