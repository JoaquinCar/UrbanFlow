const nodemailer = require('nodemailer')
const { httpError } = require('../utils/errors')

// Envío de correo por SMTP. En desarrollo funciona con Gmail y una App
// Password; en producción conviene un servicio transaccional (SendGrid, SES).

// Tamaño del lote. Se envía por tandas y no todo en paralelo porque los
// servidores SMTP cierran la conexión ante ráfagas grandes.
const TAMANO_LOTE = 5
const ESPERA_MS = 200

let transporter = null

function configurado() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER)
}

function obtenerTransporter() {
  if (!configurado()) {
    throw httpError(500, 'SMTP no configurado. Faltan SMTP_HOST y SMTP_USER en el entorno.')
  }
  // Se reutiliza entre envíos: crear uno por correo abriría una conexión nueva
  // cada vez y agotaría el límite del servidor.
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT, 10) || 587,
      // 465 usa TLS implícito; 587 arranca en claro y sube con STARTTLS.
      secure: parseInt(process.env.SMTP_PORT, 10) === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    })
  }
  return transporter
}

// Escapa el contenido antes de meterlo en el HTML del correo: el título y el
// cuerpo los escribe un administrador, pero no hay razón para permitir que un
// '<' rompa la plantilla.
function escaparHtml(texto) {
  return String(texto)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function plantilla(titulo, cuerpo, fraccionamiento) {
  const cuerpoHtml = escaparHtml(cuerpo).replace(/\n/g, '<br>')
  return `
<div style="font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px">
  <div style="border-bottom:3px solid #101483;padding-bottom:12px;margin-bottom:20px">
    <span style="font-size:20px;font-weight:700;color:#101483">UrbanFlow</span>
    <span style="font-size:13px;color:#6b7280;display:block">${escaparHtml(fraccionamiento)}</span>
  </div>
  <h1 style="font-size:18px;color:#111827;margin:0 0 14px">${escaparHtml(titulo)}</h1>
  <div style="font-size:14px;color:#374151;line-height:1.6">${cuerpoHtml}</div>
  <p style="font-size:11px;color:#9ca3af;margin-top:28px;border-top:1px solid #e5e7eb;padding-top:12px">
    Este mensaje se envió a los residentes de ${escaparHtml(fraccionamiento)}. No respondas a este correo.
  </p>
</div>`.trim()
}

async function enviarBatch(destinatarios, { titulo, cuerpo, fraccionamiento }) {
  const tx = obtenerTransporter()
  const from = process.env.SMTP_FROM || process.env.SMTP_USER
  const html = plantilla(titulo, cuerpo, fraccionamiento)

  const resultado = { intentados: destinatarios.length, enviados: 0, fallidos: 0, errores: [] }

  for (let i = 0; i < destinatarios.length; i += TAMANO_LOTE) {
    const lote = destinatarios.slice(i, i + TAMANO_LOTE)

    // Dentro del lote sí van en paralelo; entre lotes se espera.
    const resultados = await Promise.allSettled(
      lote.map(to => tx.sendMail({ from, to, subject: titulo, text: cuerpo, html }))
    )

    resultados.forEach((r, idx) => {
      if (r.status === 'fulfilled') {
        resultado.enviados++
      } else {
        resultado.fallidos++
        resultado.errores.push({ to: lote[idx], error: r.reason?.message ?? 'error desconocido' })
      }
    })

    if (i + TAMANO_LOTE < destinatarios.length) {
      await new Promise(r => setTimeout(r, ESPERA_MS))
    }
  }

  return resultado
}

module.exports = { enviarBatch, configurado }
