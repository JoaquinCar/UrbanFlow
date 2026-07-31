import api, { renovarSesion } from './client'
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
//
// Delega en renovarSesion() en vez de llamar a /auth/refresh por su cuenta: el
// backend rota el refresh token en cada uso, así que dos llamadas en paralelo
// se invalidan entre sí. StrictMode monta los efectos dos veces en desarrollo,
// de modo que este camino SIEMPRE se ejecuta dos veces al arrancar.
export function refresh() {
  return renovarSesion()
}

export async function me() {
  const { data } = await api.get('/auth/me')
  return data
}

export async function cambiarPassword(passwordActual, passwordNueva) {
  const { data } = await api.post('/auth/change-password', { passwordActual, passwordNueva })
  return data
}
