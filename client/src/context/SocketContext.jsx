import React, { createContext, useContext, useEffect, useRef, useState } from 'react'
import { io } from 'socket.io-client'
import { useAuth } from './AuthContext'
import { getAccessToken } from '../api/token'

const SocketContext = createContext(null)

// Conexión única de Socket.io para toda la aplicación.
//
// El servidor exige el mismo access token que la API, y deriva la sala de
// caseta del token: 'join-caseta' ya no acepta un id del cliente, porque antes
// cualquiera podía unirse a la sala de otro fraccionamiento y recibir su
// bitácora en vivo.
export function SocketProvider({ children }) {
  const { autenticado, rol } = useAuth()
  const socketRef = useRef(null)
  const [conectado, setConectado] = useState(false)

  useEffect(() => {
    if (!autenticado) return

    const token = getAccessToken()
    if (!token) return

    const socket = io(import.meta.env.VITE_SOCKET_URL || 'http://localhost:3000', {
      auth: { token },
      transports: ['websocket'],
    })
    socketRef.current = socket

    socket.on('connect', () => {
      setConectado(true)
      // Solo quien opera la caseta necesita el flujo en vivo de entradas.
      if (rol === 'vigilante' || rol === 'admin') socket.emit('join-caseta')
    })
    socket.on('disconnect', () => setConectado(false))
    socket.on('connect_error', (err) => {
      setConectado(false)
      console.warn('[socket] no se pudo conectar:', err.message)
    })

    return () => {
      socket.close()
      socketRef.current = null
      setConectado(false)
    }
  }, [autenticado, rol])

  return (
    <SocketContext.Provider value={{ socket: socketRef, conectado }}>
      {children}
    </SocketContext.Provider>
  )
}

export function useSocket() {
  const ctx = useContext(SocketContext)
  if (!ctx) throw new Error('useSocket debe usarse dentro de <SocketProvider>')
  return ctx
}

// Suscripción a un evento con limpieza automática.
//
//   useSocketEvent('nueva-visita', visita => { ... })
//
// El manejador se guarda en una ref para que la suscripción no se rehaga en
// cada render por una función nueva; si no, se perderían eventos entre el
// desmontaje y el montaje del listener.
export function useSocketEvent(evento, manejador) {
  const { socket, conectado } = useSocket()
  const ref = useRef(manejador)
  ref.current = manejador

  useEffect(() => {
    const s = socket.current
    if (!s || !conectado) return

    const fn = (...args) => ref.current?.(...args)
    s.on(evento, fn)
    return () => s.off(evento, fn)
  }, [socket, conectado, evento])
}
