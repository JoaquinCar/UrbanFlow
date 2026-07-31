const PDFDocument = require('pdfkit')

// Recibo en PDF generado en memoria.
//
// Se acumula en un buffer en vez de hacer doc.pipe(res) a propósito: si el
// documento falla a mitad del stream, las cabeceras ya se enviaron y el
// navegador recibe un PDF truncado sin ningún mensaje de error. Con el buffer,
// cualquier fallo llega al errorHandler y el cliente recibe un JSON claro.
//
// Tampoco se guarda en disco: el spec lo pide explícitamente porque el plan
// gratuito de Railway/Render no tiene almacenamiento persistente. Por eso
// pagos.pdf_url se queda siempre en NULL y el recibo se genera bajo demanda.

const AZUL = '#101483'
const GRIS = '#6b7280'

function moneda(valor) {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' })
    .format(Number(valor || 0))
}

function fechaLarga(valor) {
  return new Date(valor).toLocaleDateString('es-MX', {
    day: '2-digit', month: 'long', year: 'numeric',
  })
}

function periodo(mesAnio) {
  if (!mesAnio) return '—'
  const d = new Date(mesAnio)
  const texto = d.toLocaleDateString('es-MX', { month: 'long', year: 'numeric', timeZone: 'UTC' })
  return texto.charAt(0).toUpperCase() + texto.slice(1)
}

function generarReciboBuffer(datos) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'LETTER', margin: 56 })
    const partes = []

    doc.on('data', c => partes.push(c))
    doc.on('end', () => resolve(Buffer.concat(partes)))
    doc.on('error', reject)

    // Encabezado
    doc.fillColor(AZUL).fontSize(22).font('Helvetica-Bold')
      .text('UrbanFlow', { continued: false })
    doc.fillColor(GRIS).fontSize(10).font('Helvetica')
      .text(datos.fraccionamiento || '')
    doc.moveDown(1.5)

    doc.fillColor('#111827').fontSize(16).font('Helvetica-Bold')
      .text('Recibo de pago')
    doc.moveDown(0.5)

    doc.strokeColor('#e5e7eb').lineWidth(1)
      .moveTo(56, doc.y).lineTo(556, doc.y).stroke()
    doc.moveDown(1)

    // Detalle
    const fila = (etiqueta, valor) => {
      const y = doc.y
      doc.fillColor(GRIS).fontSize(10).font('Helvetica').text(etiqueta, 56, y, { width: 170 })
      doc.fillColor('#111827').fontSize(10).font('Helvetica-Bold')
        .text(String(valor ?? '—'), 230, y, { width: 326 })
      doc.moveDown(0.6)
    }

    fila('Folio', datos.pago_id)
    fila('Fecha de pago', fechaLarga(datos.fecha_pago))
    fila('Propietario', datos.propietario)
    fila('Concepto', datos.concepto)
    fila('Periodo', periodo(datos.mes_anio))
    fila('Método de pago', datos.metodo)
    if (datos.referencia_mp) fila('Referencia MercadoPago', datos.referencia_mp)
    if (datos.lotes) fila('Lote(s)', datos.lotes)

    doc.moveDown(1)
    doc.strokeColor('#e5e7eb').moveTo(56, doc.y).lineTo(556, doc.y).stroke()
    doc.moveDown(1)

    // Total
    const yTotal = doc.y
    doc.fillColor(GRIS).fontSize(12).font('Helvetica').text('Total pagado', 56, yTotal)
    doc.fillColor(AZUL).fontSize(20).font('Helvetica-Bold')
      .text(moneda(datos.monto_pagado), 330, yTotal - 4, { width: 226, align: 'right' })

    // Pie
    doc.moveDown(4)
    doc.fillColor('#9ca3af').fontSize(8).font('Helvetica')
      .text(
        'Documento informativo emitido por UrbanFlow. No es un comprobante fiscal digital (CFDI).',
        56, doc.y, { width: 500, align: 'center' }
      )

    doc.end()
  })
}

module.exports = { generarReciboBuffer }
