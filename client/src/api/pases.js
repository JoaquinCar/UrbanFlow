import api from './client'

const BASE = '/pases'

export async function crearPase(datos) {
  const { data } = await api.post(BASE, datos)
  return data
}

export async function misPases() {
  const { data } = await api.get(`${BASE}/mis-pases`)
  return data
}

export async function obtenerQrPase(id) {
  const { data } = await api.get(`${BASE}/${id}/qr`)
  return data
}

export async function cancelarPase(id) {
  await api.delete(`${BASE}/${id}`)
}

export const TIPOS_PASE = [
  { valor: 'visita', etiqueta: 'Visita' },
  { valor: 'delivery', etiqueta: 'Entrega' },
  { valor: 'servicio', etiqueta: 'Servicio' },
]

export const DURACIONES_PASE = [
  { valor: 4, etiqueta: '4 horas' },
  { valor: 24, etiqueta: '1 día' },
  { valor: 72, etiqueta: '3 días' },
  { valor: 168, etiqueta: '7 días' },
]

export function paseVigente(pase) {
  return !pase.usado_at && new Date(pase.expira_at) > new Date()
}

// "vence en 3 h", "vence en 40 min" — cuánto le queda de vida a un código activo.
export function tiempoRestante(expiraAt) {
  const minutos = Math.round((new Date(expiraAt).getTime() - Date.now()) / 60000)
  if (minutos <= 0) return 'vencido'
  if (minutos < 60) return `vence en ${minutos} min`
  const horas = Math.round(minutos / 60)
  if (horas < 24) return `vence en ${horas} h`
  return `vence en ${Math.round(horas / 24)} d`
}
