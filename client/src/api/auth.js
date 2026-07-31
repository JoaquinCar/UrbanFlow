import api from './client'
import { setAccessToken, clearAccessToken } from './token'

export async function login(email, password) {
  const { data } = await api.post('/auth/login', { email, password })
  setAccessToken(data.accessToken)
  return data.user
}

export async function logout() {
  try {
    await api.post('/auth/logout')
  } finally {
    // Aunque el servidor falle, localmente la sesión se cierra.
    clearAccessToken()
  }
}

// Recupera el access token desde la cookie httpOnly. Se usa al arrancar la app.
export async function refresh() {
  const { data } = await api.post('/auth/refresh')
  setAccessToken(data.accessToken)
  return data.accessToken
}

export async function me() {
  const { data } = await api.get('/auth/me')
  return data
}

export async function cambiarPassword(passwordActual, passwordNueva) {
  const { data } = await api.post('/auth/change-password', { passwordActual, passwordNueva })
  return data
}
