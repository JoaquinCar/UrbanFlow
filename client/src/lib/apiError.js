// El backend siempre responde los errores como { error: 'mensaje en español' }.
// Esto lo extrae y da un fallback razonable cuando no hay respuesta (servidor
// caído, CORS, red).

export function mensajeDeError(err, fallback = 'Ocurrió un error inesperado') {
  if (err?.response?.data?.error) return err.response.data.error
  if (err?.code === 'ERR_NETWORK') return 'No se pudo conectar con el servidor'
  return err?.message || fallback
}
