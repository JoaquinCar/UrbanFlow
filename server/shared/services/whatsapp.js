const { httpError } = require('../utils/errors')

// Envío de WhatsApp por Meta Cloud API. Sin dependencias nuevas: Node trae
// fetch global.
//
// ⚠️ AVISO IMPORTANTE PARA EL EQUIPO
// Los mensajes de texto libre (type: 'text') SOLO se entregan dentro de la
// ventana de 24 horas de atención al cliente, es decir, si el residente
// escribió primero al número del negocio. Un comunicado en frío a vecinos que
// nunca han escrito NECESITA una plantilla aprobada por Meta.
//
// Sin plantilla, la API responde 200 y el mensaje NUNCA LLEGA. Es el peor modo
// de fallo posible: parece que funcionó. Por eso existe META_TEMPLATE_NAME:
// déjalo vacío solo para pruebas con el número de test de Meta (que permite 5
// destinatarios en lista blanca) y configúralo en producción.

const VERSION = process.env.META_API_VERSION || 'v21.0'

// Meta limita las ráfagas por número emisor; una pausa corta entre envíos
// evita el 429 en fraccionamientos con muchos propietarios.
const ESPERA_MS = 250

const espera = (ms) => new Promise(r => setTimeout(r, ms))

function configurado() {
  return Boolean(process.env.META_PHONE_NUMBER_ID && process.env.META_ACCESS_TOKEN)
}

function endpoint() {
  const id = process.env.META_PHONE_NUMBER_ID
  const token = process.env.META_ACCESS_TOKEN
  if (!id || !token) {
    throw httpError(500, 'Meta Cloud API no configurada. Faltan META_PHONE_NUMBER_ID y META_ACCESS_TOKEN.')
  }
  return { url: `https://graph.facebook.com/${VERSION}/${id}/messages`, token }
}

// Meta espera E.164 sin '+', sin espacios ni guiones: 5216671234567
function normalizar(numero) {
  return String(numero).replace(/\D/g, '')
}

function construirPayload(to, cuerpo) {
  const plantilla = process.env.META_TEMPLATE_NAME

  if (plantilla) {
    return {
      messaging_product: 'whatsapp',
      to,
      type: 'template',
      template: {
        name: plantilla,
        language: { code: process.env.META_TEMPLATE_LANG || 'es_MX' },
        components: [{ type: 'body', parameters: [{ type: 'text', text: cuerpo }] }],
      },
    }
  }

  return { messaging_product: 'whatsapp', to, type: 'text', text: { body: cuerpo } }
}

async function enviarUno(url, token, to, cuerpo) {
  for (let intento = 0; intento < 2; intento++) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(construirPayload(to, cuerpo)),
    })

    if (res.ok) return res.json()

    const detalle = await res.text()
    // Solo se reintenta lo transitorio: throttling y errores del servidor. Un
    // 400 por número inválido no mejora reintentándolo.
    const reintentable = res.status === 429 || res.status >= 500
    if (!reintentable || intento === 1) {
      throw new Error(`Meta ${res.status}: ${detalle.slice(0, 200)}`)
    }
    await espera(1000 * (intento + 1))
  }
}

// Envío secuencial a propósito, no en paralelo: Meta limita por número emisor y
// una ráfaga de 50 peticiones simultáneas acaba en 429 masivo.
async function enviarBatch(numeros, cuerpo) {
  const { url, token } = endpoint()
  const resultado = { intentados: numeros.length, enviados: 0, fallidos: 0, errores: [] }

  for (const numero of numeros) {
    const to = normalizar(numero)
    try {
      await enviarUno(url, token, to, cuerpo)
      resultado.enviados++
    } catch (err) {
      resultado.fallidos++
      // Se acumulan los errores en vez de abortar: que un número esté mal no
      // debe impedir que los demás reciban el comunicado.
      resultado.errores.push({ to, error: err.message })
    }
    await espera(ESPERA_MS)
  }

  return resultado
}

module.exports = { enviarBatch, configurado, normalizar }
