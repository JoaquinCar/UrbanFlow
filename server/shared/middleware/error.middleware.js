// Traducción de errores de PostgreSQL a respuestas HTTP con sentido.
//
// Sin esto, un identificador mal escrito en la URL (/lotes/abc) llegaba a la
// base, reventaba con "invalid input syntax for type uuid" y se devolvía como
// 500 con el mensaje crudo de Postgres. Eso es un error del cliente, no del
// servidor, y además filtra detalles internos del motor.
//
// Se resuelve aquí y no en cada ruta porque afecta a los ocho módulos por igual.
const ERRORES_PG = {
  // Un texto que no encaja con el tipo de la columna: UUID mal formado, enum
  // inexistente, número donde no lo hay.
  '22P02': { status: 400, mensaje: 'Alguno de los datos enviados no tiene un formato válido' },
  // Fechas y horas mal escritas.
  '22007': { status: 400, mensaje: 'La fecha enviada no tiene un formato válido (se espera AAAA-MM-DD)' },
  '22008': { status: 400, mensaje: 'La fecha enviada está fuera de rango' },
  // Número demasiado grande para la columna.
  '22003': { status: 400, mensaje: 'El valor numérico está fuera del rango permitido' },
  // Texto más largo que el límite de la columna.
  '22001': { status: 400, mensaje: 'Alguno de los textos enviados es demasiado largo' },
  '23502': { status: 400, mensaje: 'Falta un dato obligatorio' },
  '23503': { status: 409, mensaje: 'El registro está referenciado por otros datos' },
  '23505': { status: 409, mensaje: 'Ya existe un registro con esos datos' },
  '23514': { status: 400, mensaje: 'Los datos enviados no cumplen una regla de validación' },
  '23P01': { status: 409, mensaje: 'El registro se solapa con otro existente' },
}

function errorHandler(err, req, res, next) {
  let status = err.status
  let mensaje = err.message

  // Cuerpo JSON mal formado. express.json() lanza un SyntaxError con .body,
  // y su mensaje viene en inglés desde el propio Node.
  if (err instanceof SyntaxError && 'body' in err) {
    status = 400
    mensaje = 'El cuerpo de la petición no es JSON válido'
  }

  // Error de PostgreSQL que no capturó el servicio. Los que sí se capturan
  // (para dar un mensaje específico) nunca llegan hasta aquí.
  if (!status && err.code && ERRORES_PG[err.code]) {
    const traduccion = ERRORES_PG[err.code]
    status = traduccion.status
    mensaje = traduccion.mensaje
  }

  status = status || 500

  // Los errores del cliente (4xx) son esperados y no ensucian el log; los 5xx
  // sí, porque son fallos nuestros que hay que investigar.
  if (status >= 500) {
    console.error(err.stack || err)
  }

  res.status(status).json({
    error: status >= 500 && process.env.NODE_ENV === 'production'
      // En producción nunca se expone el detalle interno de un 500: puede
      // contener nombres de tablas, rutas del servidor o fragmentos de SQL.
      ? 'Error interno del servidor'
      : mensaje || 'Error interno del servidor',
    // El stack solo en desarrollo y solo para errores del servidor.
    ...(status >= 500 && process.env.NODE_ENV === 'development' && { stack: err.stack }),
  })
}

module.exports = { errorHandler }
