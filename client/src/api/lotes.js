import api from './client'

// El backend monta este módulo en /api/fraccionamiento (no en /api/lotes, que
// es lo que dice el plan original). Aislarlo en una constante deja el cambio en
// un solo sitio si algún día se renombra el montaje.
const BASE = '/fraccionamiento'

export async function obtenerFraccionamiento() {
  const { data } = await api.get(BASE)
  return data
}

export async function listarLotes(filtros = {}) {
  // Se quitan los filtros vacíos para no mandar ?estado=&etapa=
  const params = Object.fromEntries(
    Object.entries(filtros).filter(([, v]) => v !== '' && v !== null && v !== undefined)
  )
  const { data } = await api.get(`${BASE}/lotes`, { params })
  return data
}

export async function obtenerLote(id) {
  const { data } = await api.get(`${BASE}/lotes/${id}`)
  return data
}

export async function crearLote(datos) {
  const { data } = await api.post(`${BASE}/lotes`, datos)
  return data
}

export async function actualizarLote(id, datos) {
  const { data } = await api.put(`${BASE}/lotes/${id}`, datos)
  return data
}

export async function eliminarLote(id) {
  await api.delete(`${BASE}/lotes/${id}`)
}

export async function asignarPropietario(id, propietarioId) {
  const { data } = await api.put(`${BASE}/lotes/${id}/propietario`, { propietario_id: propietarioId })
  return data
}

export async function obtenerMapa() {
  const { data } = await api.get(`${BASE}/mapa`)
  return data
}

export async function listarEtapas() {
  const { data } = await api.get(`${BASE}/etapas`)
  return data
}

export const ESTADOS_LOTE = ['disponible', 'proceso', 'vendido']

export const ETIQUETA_ESTADO = {
  disponible: 'Disponible',
  proceso: 'En proceso',
  vendido: 'Vendido',
}

// Los tres estados se pintan igual en la tabla y en el mapa.
export const CLASE_ESTADO = {
  disponible: 'badge--verde',
  proceso: 'badge--ambar',
  vendido: 'badge--azul',
}

export function formatearMoneda(valor) {
  if (valor === null || valor === undefined) return '—'
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    maximumFractionDigits: 0,
  }).format(Number(valor))
}
