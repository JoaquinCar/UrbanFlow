import api from './client'

const BASE = '/reservaciones'

function limpiar(filtros) {
  return Object.fromEntries(
    Object.entries(filtros).filter(([, v]) => v !== '' && v !== null && v !== undefined)
  )
}

// ── Áreas ───────────────────────────────────────────────────────────────────

export async function listarAreas(filtros = {}) {
  const { data } = await api.get(`${BASE}/areas`, { params: limpiar(filtros) })
  return data
}

export async function crearArea(datos) {
  const { data } = await api.post(`${BASE}/areas`, datos)
  return data
}

export async function actualizarArea(id, datos) {
  const { data } = await api.put(`${BASE}/areas/${id}`, datos)
  return data
}

export async function eliminarArea(id) {
  await api.delete(`${BASE}/areas/${id}`)
}

export async function obtenerDisponibilidad(areaId, fecha) {
  const { data } = await api.get(`${BASE}/areas/${areaId}/disponibilidad`, { params: { fecha } })
  return data
}

// ── Reservaciones ───────────────────────────────────────────────────────────

export async function listarReservaciones(filtros = {}) {
  const { data } = await api.get(BASE, { params: limpiar(filtros) })
  return data
}

export async function misReservaciones() {
  const { data } = await api.get(`${BASE}/mias`)
  return data
}

export async function crearReservacion(datos) {
  const { data } = await api.post(BASE, datos)
  return data
}

export async function cambiarEstadoReservacion(id, estado) {
  const { data } = await api.put(`${BASE}/${id}`, { estado })
  return data
}

export async function cancelarReservacion(id) {
  const { data } = await api.put(`${BASE}/${id}/cancelar`)
  return data
}

// ── Presentación ────────────────────────────────────────────────────────────

export const ESTADOS_RESERVA = ['pendiente', 'confirmada', 'cancelada']

export const ETIQUETA_ESTADO_RESERVA = {
  pendiente: 'Pendiente',
  confirmada: 'Confirmada',
  cancelada: 'Cancelada',
}

export const CLASE_ESTADO_RESERVA = {
  pendiente: 'badge--ambar',
  confirmada: 'badge--verde',
  cancelada: 'badge--gris',
}

// Franjas de una hora entre las 8:00 y las 23:00. Reservar por horas completas
// simplifica el calendario y cubre el caso real de un fraccionamiento.
export const HORAS = Array.from({ length: 15 }, (_, i) => `${String(i + 8).padStart(2, '0')}:00`)

// hora_inicio llega como '16:00:00'; para comparar y mostrar basta HH:MM.
export function hhmm(hora) {
  return String(hora ?? '').slice(0, 5)
}

// La fecha llega como '2026-08-05T00:00:00.000Z' o '2026-08-05'. Se formatea en
// UTC para que la zona local no la desplace al día anterior.
export function fechaLegible(valor) {
  if (!valor) return '—'
  const iso = String(valor).slice(0, 10)
  const texto = new Date(`${iso}T12:00:00Z`).toLocaleDateString('es-MX', {
    weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC',
  })
  // Solo la primera letra. Con text-transform: capitalize en CSS saldría
  // "Lunes, 14 De Septiembre", que en español es incorrecto.
  return texto.charAt(0).toUpperCase() + texto.slice(1)
}

export function soloFecha(valor) {
  return String(valor ?? '').slice(0, 10)
}

export function hoyIso() {
  return new Date().toISOString().slice(0, 10)
}
