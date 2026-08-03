import axios from 'axios'
import { getAccessToken, setAccessToken, clearAccessToken } from './token'

// Sin VITE_API_URL se usa una ruta relativa, es decir, el mismo origen que
// sirvió la página. Es lo correcto en producción, donde nginx entrega el
// cliente y la API bajo el mismo dominio, y además sigue funcionando al
// cambiar de IP a dominio o de HTTP a HTTPS sin reconstruir nada.
//
// En desarrollo el cliente vive en :5173 y la API en :3000, así que ahí sí
// hace falta la variable: la define client/.env.
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
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

// Renovación de sesión compartida.
//
// El backend ROTA el refresh token en cada uso: al renovar, invalida el token
// anterior. Por eso dos renovaciones en paralelo se pisan — la primera rota el
// token que la segunda todavía está usando, y la segunda recibe "Refresh token
// revocado", tirando la sesión de un usuario perfectamente válido.
//
// Pasa en dos situaciones reales:
//  1. Varias peticiones caducan a la vez y todas reciben 401.
//  2. Al arrancar la app. En desarrollo, StrictMode monta los efectos dos veces,
//     así que el AuthProvider pide refresh dos veces seguidas.
//
// La solución para ambas es la misma: una única promesa en vuelo que todos
// comparten. Por eso esto se exporta, para que el arranque no se salte la cola.
let renovando = null

export function renovarSesion() {
  renovando = renovando || renovarToken().finally(() => { renovando = null })
  return renovando
}

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
      const token = await renovarSesion()

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
