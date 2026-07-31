import api from './client'

const BASE = '/pagos'

function limpiar(filtros) {
  return Object.fromEntries(
    Object.entries(filtros).filter(([, v]) => v !== '' && v !== null && v !== undefined)
  )
}

// ── Cuotas ──────────────────────────────────────────────────────────────────

export async function listarCuotas(filtros = {}) {
  const { data } = await api.get(`${BASE}/cuotas`, { params: limpiar(filtros) })
  return data
}

export async function misCuotas() {
  const { data } = await api.get(`${BASE}/cuotas/mias`)
  return data
}

export async function estadoDeCuenta(propietarioId) {
  const { data } = await api.get(`${BASE}/cuotas/${propietarioId}`)
  return data
}

export async function crearCuotaExtraordinaria(datos) {
  const { data } = await api.post(`${BASE}/cuotas`, datos)
  return data
}

export async function eliminarCuota(id) {
  await api.delete(`${BASE}/cuotas/${id}`)
}

export async function generarMensuales() {
  const { data } = await api.post(`${BASE}/cuotas/generar`, {})
  return data
}

export async function listarMorosos() {
  const { data } = await api.get(`${BASE}/morosos`)
  return data
}

// ── Pagos ───────────────────────────────────────────────────────────────────

export async function crearCheckout(cuotaId) {
  const { data } = await api.post(`${BASE}/checkout`, { cuota_id: cuotaId })
  return data
}

export async function registrarPagoManual(datos) {
  const { data } = await api.post(`${BASE}/manual`, datos)
  return data
}

export async function listarPagos(filtros = {}) {
  const { data } = await api.get(BASE, { params: limpiar(filtros) })
  return data
}

// El recibo exige el token de sesión, así que se pide como blob y se abre desde
// memoria en vez de usar un <a href> directo.
export async function descargarRecibo(pagoId) {
  const res = await api.get(`${BASE}/${pagoId}/pdf`, { responseType: 'blob' })
  const url = URL.createObjectURL(res.data)
  const a = document.createElement('a')
  a.href = url
  a.download = `recibo-${pagoId}.pdf`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

// ── Presentación ────────────────────────────────────────────────────────────

export const ESTADOS_CUOTA = ['pendiente', 'pagado', 'vencido']

export const ETIQUETA_ESTADO_CUOTA = {
  pendiente: 'Pendiente',
  pagado: 'Pagado',
  vencido: 'Vencido',
}

export const CLASE_ESTADO_CUOTA = {
  pendiente: 'badge--ambar',
  pagado: 'badge--verde',
  vencido: 'badge--rojo',
}

export const METODOS_PAGO = [
  { valor: 'efectivo', etiqueta: 'Efectivo' },
  { valor: 'transferencia', etiqueta: 'Transferencia' },
]

export function moneda(valor) {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' })
    .format(Number(valor || 0))
}

// mes_anio siempre es el día 1 del mes. Se formatea en UTC para que la zona
// horaria local no lo desplace al mes anterior.
export function periodo(mesAnio) {
  if (!mesAnio) return '—'
  const texto = new Date(mesAnio).toLocaleDateString('es-MX', {
    month: 'long', year: 'numeric', timeZone: 'UTC',
  })
  return texto.charAt(0).toUpperCase() + texto.slice(1)
}

export function fechaCorta(valor) {
  if (!valor) return '—'
  return new Date(valor).toLocaleDateString('es-MX', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  })
}

export function conceptoCuota(cuota) {
  if (cuota.concepto) return cuota.concepto
  return cuota.tipo === 'mensual' ? 'Cuota de mantenimiento' : 'Cuota extraordinaria'
}
