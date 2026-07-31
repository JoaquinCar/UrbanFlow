import api from './client'

const BASE = '/comunicados'

export async function listarComunicados(filtros = {}) {
  const { data } = await api.get(BASE, { params: filtros })
  return data
}

// Tablón de avisos para residentes: sin detalles de entrega.
export async function misComunicados() {
  const { data } = await api.get(`${BASE}/mios`)
  return data
}

export async function crearComunicado(datos) {
  const { data } = await api.post(BASE, datos)
  return data
}

export async function eliminarComunicado(id) {
  await api.delete(`${BASE}/${id}`)
}

export async function contarDestinatarios() {
  const { data } = await api.get(`${BASE}/destinatarios`)
  return data
}

// Permite avisar en la interfaz antes de que el administrador escriba un
// comunicado que no se va a poder enviar por falta de credenciales.
export async function estadoCanales() {
  const { data } = await api.get(`${BASE}/canales`)
  return data
}

export function fechaRelativa(valor) {
  if (!valor) return ''
  const minutos = Math.floor((Date.now() - new Date(valor).getTime()) / 60000)
  if (minutos < 60) return `hace ${Math.max(minutos, 1)} min`
  const horas = Math.floor(minutos / 60)
  if (horas < 24) return `hace ${horas} h`
  const dias = Math.floor(horas / 24)
  if (dias < 30) return `hace ${dias} d`
  return new Date(valor).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })
}

export function fechaLarga(valor) {
  if (!valor) return '—'
  return new Date(valor).toLocaleString('es-MX', {
    day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

// Resume el resultado de envío para mostrarlo de un vistazo en el historial.
export function resumenEnvio(resultado) {
  if (!resultado || Object.keys(resultado).length === 0) return null
  return Object.entries(resultado).map(([canal, r]) => ({
    canal,
    enviados: r.enviados ?? 0,
    fallidos: r.fallidos ?? 0,
    intentados: r.intentados ?? 0,
    errores: r.errores ?? [],
  }))
}
