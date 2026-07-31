import React, { createContext, useContext, useState, useCallback, useRef } from 'react'
import '../styles/feedback.css'

const ToastContext = createContext(null)

// Avisos efímeros. Reemplaza los `alert()` y los <p style={{color:'red'}}>
// sueltos que había repartidos por las pantallas.
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const idRef = useRef(0)

  const quitar = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  const mostrar = useCallback((mensaje, tipo = 'info', ms = 4000) => {
    const id = ++idRef.current
    setToasts(prev => [...prev, { id, mensaje, tipo }])
    setTimeout(() => quitar(id), ms)
    return id
  }, [quitar])

  const valor = {
    mostrar,
    exito: useCallback((m, ms) => mostrar(m, 'exito', ms), [mostrar]),
    error: useCallback((m, ms) => mostrar(m, 'error', ms), [mostrar]),
    info: useCallback((m, ms) => mostrar(m, 'info', ms), [mostrar]),
  }

  return (
    <ToastContext.Provider value={valor}>
      {children}
      <div className="toast-stack" aria-live="polite" aria-atomic="false">
        {toasts.map(t => (
          <div key={t.id} className={`toast toast--${t.tipo}`} onClick={() => quitar(t.id)}>
            {t.mensaje}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast debe usarse dentro de <ToastProvider>')
  return ctx
}
