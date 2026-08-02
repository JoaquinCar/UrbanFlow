const { Vexor } = require('vexor')
const Stripe = require('stripe')
const { httpError } = require('../../shared/utils/errors')

let vexorInstance = null
let stripeInstance = null

function getVexor() {
  if (!vexorInstance) {
    const projectId = process.env.VEXOR_PROJECT
    const publishableKey = process.env.VEXOR_PUBLISHABLE_KEY
    const secretKey = process.env.VEXOR_SECRET_KEY
    if (!projectId || !publishableKey) {
      throw httpError(500, 'VEXOR_PROJECT y VEXOR_PUBLISHABLE_KEY no configurados. Añádelos a server/.env.')
    }
    vexorInstance = new Vexor({ projectId, publishableKey, secretKey })
  }
  return vexorInstance
}

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
  return Boolean(process.env.VEXOR_PROJECT && process.env.VEXOR_PUBLISHABLE_KEY)
}

async function crearPreferencia({ cuota, propietario }) {
  const vexor = getVexor()
  const response = await vexor.pay.stripe({
    items: [{
      id: cuota.id,
      title: cuota.concepto || `Cuota ${cuota.tipo}`,
      description: `Cuota ${cuota.tipo} - ${propietario.nombre_completo}`,
      quantity: 1,
      unit_price: Number(cuota.monto),
    }],
    options: {
      successRedirect: process.env.STRIPE_BACK_URL_SUCCESS,
      failureRedirect: process.env.STRIPE_BACK_URL_FAILURE,
    },
  })
  return { preference_id: response.identifier, init_point: response.payment_url, sandbox_init_point: response.payment_url }
}

// Valida la firma del webhook de Stripe directamente (sin pasar por Vexor).
function validarWebhookStripe(req) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET
  if (!secret) {
    throw httpError(500, 'STRIPE_WEBHOOK_SECRET no configurado. Añádelo a server/.env.')
  }

  const signature = req.headers['stripe-signature']
  if (!signature) throw httpError(401, 'Firma ausente')

  const stripe = getStripe()
  try {
    const event = stripe.webhooks.constructEvent(req.body, signature, secret)
    return event
  } catch (err) {
    throw httpError(401, `Firma inválida: ${err.message}`)
  }
}

module.exports = { crearPreferencia, validarWebhookStripe, configurado }
