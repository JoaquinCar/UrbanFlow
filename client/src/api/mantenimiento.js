import api from './client'

const BASE = '/mantenimiento'

function limpiar(filtros) {
  return Object.fromEntries(
    Object.entries(filtros).filter(([, v]) => v !== '' && v !== null && v !== undefined)
  )
}

export async function listarTickets(filtros = {}) {
  const { data } = await api.get(BASE, { params: limpiar(filtros) })
  return data
}

// Los que reportó (propietario) o los que le asignaron (técnico). El backend
// decide el criterio según el rol del token.
export async function misTickets(filtros = {}) {
  const { data } = await api.get(`${BASE}/mios`, { params: limpiar(filtros) })
  return data
}

export async function listarTecnicos() {
  const { data } = await api.get(`${BASE}/tecnicos`)
  return data
}

export async function crearTicket(datos) {
  const { data } = await api.post(BASE, datos)
  return data
}

export async function asignarTecnico(id, tecnicoId) {
  const { data } = await api.put(`${BASE}/${id}/asignar`, { tecnico_id: tecnicoId })
  return data
}

export async function cambiarEstado(id, estado) {
  const { data } = await api.put(`${BASE}/${id}/estado`, { estado })
  return data
}

export async function eliminarTicket(id) {
  await api.delete(`${BASE}/${id}`)
}

export const ESTADOS_TICKET = ['abierto', 'en_proceso', 'resuelto']

export const ETIQUETA_ESTADO_TICKET = {
  abierto: 'Abierto',
  en_proceso: 'En proceso',
  resuelto: 'Resuelto',
}

export const CLASE_ESTADO_TICKET = {
  abierto: 'badge--rojo',
  en_proceso: 'badge--ambar',
  resuelto: 'badge--verde',
}

export function fechaCorta(valor) {
  if (!valor) return '—'
  return new Date(valor).toLocaleDateString('es-MX', {
    day: '2-digit', month: '2-digit', year: '2-digit',
  })
}
