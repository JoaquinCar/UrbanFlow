// Emisión de eventos en tiempo real hacia la caseta.
//
// Vive en un helper y no dentro de los servicios porque los servicios no deben
// conocer `req` — se mantienen agnósticos de HTTP y por tanto testeables sin
// levantar Express.
//
// La sala se deriva SIEMPRE de req.user.fraccionamiento_id, nunca de un valor
// que mande el cliente. Es la misma regla que en las consultas.

function emitirCaseta(req, evento, payload) {
  const io = req.app.get('io')
  if (!io) return
  io.to(`caseta-${req.user.fraccionamiento_id}`).emit(evento, payload)
}

module.exports = { emitirCaseta }
