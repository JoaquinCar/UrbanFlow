const Stripe = require('stripe')
const { httpError } = require('../../shared/utils/errors')

// Cobro con Stripe Checkout, hablando con Stripe directamente.
//
// Antes esta sesión se creaba a través del SDK de Vexor, que envuelve a Stripe.
// Se dejó de usar porque su interfaz no permite adjuntar datos propios a la
// sesión: el único identificador que devuelve es uno suyo, y la sesión llegaba
// a Stripe sin ninguna referencia a la cuota. Cuando Stripe avisara del pago,
// el webhook no habría tenido forma de saber qué cuota marcar como pagada.
//
// Tampoco propagaba la moneda, así que una cuota de $2,500 MXN se cobraba como
// $2,500 USD. Ambas cosas se arreglan enviando la sesión nosotros.
//
// Las claves son las mismas: Vexor cobraba sobre esta misma cuenta de Stripe.

let stripeInstance = null

function getStripe() {
  if (!stripeInstance) {
    const secretKey = process.env.STRIPE_SECRET_KEY
    if (!secretKey) {
      throw httpError(500, 'STRIPE_SECRET_KEY no configurado. Añádelo a server/.env.')
    }
    stripeInstance = new Stripe(secretKey)
  }
  return stripeInstance
}

function configurado() {
  return Boolean(process.env.STRIPE_SECRET_KEY)
}

// Stripe exige success_url y cancel_url absolutas. Si no vienen configuradas se
// derivan de CLIENT_URL, que es donde vive la pantalla que las recibe
// (/pagos/:estado). Sin ninguna de las dos, el checkout no puede crearse: es
// preferible decirlo aquí que mandar al residente a una URL rota tras pagar.
function urlRetorno(variable, ruta) {
  const explicita = process.env[variable]
  if (explicita) return explicita

  const base = (process.env.CLIENT_URL || process.env.PUBLIC_URL || '').replace(/\/+$/, '')
  if (!base) {
    throw httpError(500, `${variable} no configurado y no hay CLIENT_URL del que derivarlo. Añade uno de los dos a server/.env.`)
  }
  return `${base}${ruta}`
}

async function crearPreferencia({ cuota, propietario }) {
  const stripe = getStripe()

  // Stripe cobra en la unidad mínima: centavos. El monto viene de Postgres como
  // NUMERIC, que node-postgres entrega como cadena.
  const centavos = Math.round(Number(cuota.monto) * 100)
  if (!Number.isFinite(centavos) || centavos <= 0) {
    throw httpError(400, 'La cuota no tiene un monto cobrable')
  }

  const moneda = (process.env.STRIPE_CURRENCY || process.env.MP_CURRENCY || 'mxn').toLowerCase()

  // El id de la cuota viaja por duplicado a propósito:
  //  - client_reference_id lo trae el evento checkout.session.completed
  //  - la metadata del payment intent la trae payment_intent.payment_succeeded
  // El webhook acepta los dos tipos de evento, así que ambos deben poder
  // resolver la cuota por su cuenta.
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    client_reference_id: cuota.id,
    metadata: { cuota_id: cuota.id },
    payment_intent_data: { metadata: { cuota_id: cuota.id } },
    customer_email: propietario.email || undefined,
    line_items: [{
      quantity: 1,
      price_data: {
        currency: moneda,
        unit_amount: centavos,
        product_data: {
          name: cuota.concepto || `Cuota ${cuota.tipo}`,
          description: `${propietario.nombre_completo} · cuota ${cuota.tipo}`,
        },
      },
    }],
    success_url: urlRetorno('STRIPE_BACK_URL_SUCCESS', '/pagos/exito'),
    cancel_url: urlRetorno('STRIPE_BACK_URL_FAILURE', '/pagos/error'),
  })

  // Se conservan los nombres que ya consumía el cliente cuando el proveedor era
  // MercadoPago, para no tocar la pantalla de pago.
  return { preference_id: session.id, init_point: session.url, sandbox_init_point: session.url }
}

function validarWebhookStripe(req) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET
  if (!secret) {
    throw httpError(500, 'STRIPE_WEBHOOK_SECRET no configurado. Añádelo a server/.env.')
  }

  const signature = req.headers['stripe-signature']
  if (!signature) throw httpError(401, 'Firma ausente')

  const stripe = getStripe()
  try {
    // req.body debe ser el Buffer crudo: si Express ya lo parseó a objeto, la
    // firma no cuadra porque se calculó sobre los bytes originales.
    return stripe.webhooks.constructEvent(req.body, signature, secret)
  } catch (err) {
    throw httpError(401, `Firma inválida: ${err.message}`)
  }
}

module.exports = { crearPreferencia, validarWebhookStripe, configurado }
