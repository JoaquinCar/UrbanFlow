import React, { createContext, useContext, useEffect, useState, useCallback } from 'react'
import * as authApi from '../api/auth'
import { setOnSessionExpired } from '../api/client'

const AuthContext = createContext(null)

// status: 'cargando' | 'autenticado' | 'anonimo'
// Distinguir 'cargando' de 'anonimo' importa: sin eso, RequireAuth manda al
// login durante el arranque y el usuario pierde la sesión en cada F5.

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [status, setStatus] = useState('cargando')

  const cerrarSesionLocal = useCallback(() => {
    setUser(null)
    setStatus('anonimo')
  }, [])

  // Arranque: el access token vive en memoria y se perdió al recargar, así que
  // se pide uno nuevo con la cookie httpOnly y luego se lee el usuario.
  // /auth/refresh devuelve solo { accessToken }, por eso hacen falta los dos pasos.
  useEffect(() => {
    let cancelado = false

    async function iniciar() {
      try {
        await authApi.refresh()
        const datos = await authApi.me()
        if (cancelado) return
        setUser(datos)
        setStatus('autenticado')
      } catch {
        if (cancelado) return
        cerrarSesionLocal()
      }
    }

    iniciar()
    return () => { cancelado = true }
  }, [cerrarSesionLocal])

  // Si el refresh falla a media sesión, el interceptor avisa por aquí.
  useEffect(() => {
    setOnSessionExpired(cerrarSesionLocal)
    return () => setOnSessionExpired(() => {})
  }, [cerrarSesionLocal])

  const login = useCallback(async (email, password) => {
    const datos = await authApi.login(email, password)
    setUser(datos)
    setStatus('autenticado')
    return datos
  }, [])

  const logout = useCallback(async () => {
    await authApi.logout()
    cerrarSesionLocal()
  }, [cerrarSesionLocal])

  const valor = {
    user,
    status,
    cargando: status === 'cargando',
    autenticado: status === 'autenticado',
    rol: user?.rol ?? null,
    login,
    logout,
  }

  return <AuthContext.Provider value={valor}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>')
  return ctx
}
