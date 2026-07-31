import axios from 'axios'
import { getAccessToken, setAccessToken, clearAccessToken } from './token'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:3000/api',
  withCredentials: true, // manda la cookie httpOnly refreshToken
})

api.interceptors.request.use((config) => {
  const token = getAccessToken()
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// Se avisa a AuthContext cuando la sesión muere de verdad, para que limpie el
// usuario y mande al login. Se inyecta desde fuera para no importar React aquí.
let onSessionExpired = () => {}
export function setOnSessionExpired(fn) {
  onSessionExpired = fn
}

// Cola de peticiones que fallaron con 401 mientras se renueva el token. Sin
// esto, 5 peticiones simultáneas dispararían 5 refresh en paralelo y, como el
// backend rota el refresh token en cada uso, las 4 últimas fallarían con
// "Refresh token revocado" y tirarían la sesión de un usuario válido.
let renovando = null

async function renovarToken() {
  // Instancia limpia: si usáramos `api`, este refresh volvería a pasar por el
  // interceptor de abajo y un 401 aquí se reintentaría en bucle infinito.
  const { data } = await axios.post(
    `${api.defaults.baseURL}/auth/refresh`,
    {},
    { withCredentials: true }
  )
  setAccessToken(data.accessToken)
  return data.accessToken
}

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config

    const es401 = error.response?.status === 401
    const esRutaDeAuth = original?.url?.includes('/auth/refresh') || original?.url?.includes('/auth/login')

    if (!es401 || esRutaDeAuth || original?._reintentado) {
      return Promise.reject(error)
    }

    original._reintentado = true

    try {
      // Todas las peticiones en cola esperan la MISMA promesa de refresh.
      renovando = renovando || renovarToken().finally(() => { renovando = null })
      const token = await renovando

      original.headers = original.headers || {}
      original.headers.Authorization = `Bearer ${token}`
      return api(original)
    } catch (err) {
      clearAccessToken()
      onSessionExpired()
      return Promise.reject(err)
    }
  }
)

export default api
