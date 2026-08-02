const crypto = require('crypto')
const jwt = require('jsonwebtoken')
const QRCode = require('qrcode')
const { httpError } = require('./errors')

// QR de residente: un JWT sin expiración que el propietario enseña en la caseta.
//
// Se firma con QR_SECRET y NO con JWT_SECRET a propósito. Este token es una
// credencial física: vive impresa o en una captura de pantalla y no caduca
// nunca. Si se firmara con la llave de los access tokens, una fuga del QR
// podría reutilizarse contra authGuard.
//
// Al no expirar, la revocación no puede ser por tiempo: la fuente de verdad es
// usuarios.qr_token. Quien valide el QR debe comparar el token recibido contra
// el que está guardado, de modo que rotarlo o ponerlo a NULL lo mata al instante.

function secretoQr() {
  const s = process.env.QR_SECRET
  if (!s) throw httpError(500, 'QR_SECRET no configurado')
  return s
}

// jti hace que rotar produzca siempre un token distinto, aunque el usuario y el
// fraccionamiento sean los mismos.
function generarQrToken(userId, fraccionamientoId) {
  return jwt.sign(
    { userId, fraccionamientoId, type: 'resident-qr', jti: crypto.randomUUID() },
    secretoQr()
  )
}

function verificarQrToken(token) {
  let payload
  try {
    payload = jwt.verify(token, secretoQr())
  } catch {
    throw httpError(401, 'QR inválido')
  }
  // Sin esta comprobación, cualquier token firmado con QR_SECRET valdría como QR.
  if (payload.type !== 'resident-qr') throw httpError(401, 'QR inválido')
  return payload
}

async function qrDataUrl(token) {
  return QRCode.toDataURL(token, { errorCorrectionLevel: 'M', margin: 1, width: 320 })
}

async function qrPngBuffer(token) {
  return QRCode.toBuffer(token, { type: 'png', errorCorrectionLevel: 'M', margin: 1, width: 512 })
}

// Pase de visitante: mismo secreto y esquema sin 'exp' propio que el QR de
// residente, pero con otro 'type'. La vigencia y el uso único los controla la
// fila en pases_visitante, no el JWT — así, cancelar un pase (adelantando su
// expira_at) lo invalida al instante sin depender de que el token expire.
function generarPaseToken(paseId, fraccionamientoId) {
  return jwt.sign({ paseId, fraccionamientoId, type: 'visitor-pass' }, secretoQr())
}

function verificarPaseToken(token) {
  let payload
  try {
    payload = jwt.verify(token, secretoQr())
  } catch {
    throw httpError(401, 'Código inválido o expirado')
  }
  if (payload.type !== 'visitor-pass') throw httpError(401, 'Código inválido')
  return payload
}

// La caseta escanea con un solo lector tanto el QR de residente como el pase
// de visitante: antes de validar cada uno hay que ver a cuál tipo pertenece.
function tipoDeToken(token) {
  try {
    return jwt.verify(token, secretoQr()).type
  } catch {
    throw httpError(401, 'Código QR inválido o expirado')
  }
}

module.exports = {
  generarQrToken, verificarQrToken, qrDataUrl, qrPngBuffer,
  generarPaseToken, verificarPaseToken, tipoDeToken,
}
