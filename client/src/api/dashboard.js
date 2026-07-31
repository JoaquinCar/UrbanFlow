import api from './client'

export async function obtenerDashboard() {
  const { data } = await api.get('/fraccionamiento/dashboard')
  return data
}
