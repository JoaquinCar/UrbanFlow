// Errores de dominio con status HTTP. El errorHandler global lee err.status y
// responde { error: err.message }, así que los servicios solo tienen que lanzar.
//
//   throw httpError(404, 'Lote no encontrado')

function httpError(status, message) {
  const err = new Error(message)
  err.status = status
  return err
}

module.exports = { httpError }
