import api from './client'

const BASE = '/visitas'

function limpiar(filtros) {
  return Object.fromEntries(
    Object.entries(filtros).filter(([, v]) => v !== '' && v !== null && v !== undefined)
  )
}

export async function registrarEntrada(datos) {
  const { data } = await api.post(`${BASE}/entrada`, datos)
  return data
}

export async function entradaPorQr(token) {
  const { data } = await api.post(`${BASE}/qr`, { token })
  return data
}

export async function registrarSalida(id) {
  const { data } = await api.put(`${BASE}/${id}/salida`)
  return data
}

export async function listarActivas() {
  const { data } = await api.get(`${BASE}/activas`)
  return data
}

export async function obtenerBitacora(filtros = {}) {
  const { data } = await api.get(`${BASE}/bitacora`, { params: limpiar(filtros) })
  return data
}

export async function misVisitas() {
  const { data } = await api.get(`${BASE}/mis-visitas`)
  return data
}

// La exportación pasa por axios y no por un <a href> porque el endpoint exige
// el token de sesión, que viaja en una cabecera.
export async function descargarBitacoraCsv(filtros = {}) {
  const res = await api.get(`${BASE}/bitacora.csv`, {
    params: limpiar(filtros),
    responseType: 'blob',
  })
  const url = URL.createObjectURL(res.data)
  const a = document.createElement('a')
  a.href = url
  a.download = `bitacora-${new Date().toISOString().slice(0, 10)}.csv`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export const TIPOS_VISITA = [
  { valor: 'visita', etiqueta: 'Visita' },
  { valor: 'delivery', etiqueta: 'Entrega' },
  { valor: 'servicio', etiqueta: 'Servicio' },
  { valor: 'residente', etiqueta: 'Residente' },
]

export const CLASE_TIPO = {
  visita: 'badge--azul',
  delivery: 'badge--ambar',
  servicio: 'badge--gris',
  residente: 'badge--verde',
}

export function etiquetaTipo(tipo) {
  return TIPOS_VISITA.find(t => t.valor === tipo)?.etiqueta ?? tipo
}

export function formatearFecha(valor) {
  if (!valor) return null
  return new Date(valor).toLocaleString('es-MX', {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

// "hace 2 h", "hace 15 min" — para saber de un vistazo cuánto lleva alguien dentro.
export function tiempoDentro(entradaAt) {
  const minutos = Math.floor((Date.now() - new Date(entradaAt).getTime()) / 60000)
  if (minutos < 1) return 'recién'
  if (minutos < 60) return `hace ${minutos} min`
  const horas = Math.floor(minutos / 60)
  if (horas < 24) return `hace ${horas} h`
  return `hace ${Math.floor(horas / 24)} d`
}
