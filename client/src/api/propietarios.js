import api from './client'

const BASE = '/propietarios'

export async function listarPropietarios(filtros = {}) {
  const params = Object.fromEntries(
    Object.entries(filtros).filter(([, v]) => v !== '' && v !== null && v !== undefined)
  )
  const { data } = await api.get(BASE, { params })
  return data
}

export async function obtenerPropietario(id) {
  const { data } = await api.get(`${BASE}/${id}`)
  return data
}

// Ficha del propietario autenticado. La usa el portal para no tener que
// conocer su propio id.
export async function obtenerMiFicha() {
  const { data } = await api.get(`${BASE}/me`)
  return data
}

export async function crearPropietario(datos) {
  const { data } = await api.post(BASE, datos)
  return data
}

export async function actualizarPropietario(id, datos) {
  const { data } = await api.put(`${BASE}/${id}`, datos)
  return data
}

export async function eliminarPropietario(id) {
  await api.delete(`${BASE}/${id}`)
}

export async function obtenerQr(id) {
  const { data } = await api.get(`${BASE}/${id}/qr`)
  return data
}

export async function rotarQr(id) {
  const { data } = await api.post(`${BASE}/${id}/qr/rotar`)
  return data
}

export async function listarDocumentos(id) {
  const { data } = await api.get(`${BASE}/${id}/documentos`)
  return data
}

export async function subirDocumento(id, tipo, archivo) {
  const form = new FormData()
  form.append('tipo', tipo)
  form.append('archivo', archivo)
  // No se pone Content-Type a mano: el navegador tiene que añadir el boundary
  // del multipart, y fijarlo manualmente lo rompe.
  const { data } = await api.post(`${BASE}/${id}/documentos`, form)
  return data
}

export async function eliminarDocumento(docId) {
  await api.delete(`${BASE}/documentos/${docId}`)
}

// La descarga necesita el token de sesión, así que no puede ser un <a href>
// normal: se pide como blob y se dispara la descarga desde memoria.
export async function descargarDocumento(docId, nombreArchivo) {
  const res = await api.get(`${BASE}/documentos/${docId}`, { responseType: 'blob' })
  const url = URL.createObjectURL(res.data)
  const a = document.createElement('a')
  a.href = url
  a.download = nombreArchivo || 'documento'
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export const TIPOS_DOCUMENTO = [
  { valor: 'ine', etiqueta: 'INE' },
  { valor: 'escritura', etiqueta: 'Escritura' },
  { valor: 'comprobante', etiqueta: 'Comprobante de domicilio' },
  { valor: 'contrato', etiqueta: 'Contrato' },
  { valor: 'otro', etiqueta: 'Otro' },
]

export function formatearTamano(bytes) {
  if (!bytes) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
