import { useState, useEffect, useCallback, useRef } from 'react'
import { mensajeDeError } from '../lib/apiError'

// Patrón de carga de datos compartido por todas las pantallas:
//
//   const { datos, cargando, error, recargar } = useFetch(() => listarLotes({ estado }), [estado])
//
// `fn` debe ser estable o depender de `deps`; se guarda en una ref para que no
// dispare el efecto en cada render.
export function useFetch(fn, deps = []) {
  const [datos, setDatos] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)
  const fnRef = useRef(fn)
  fnRef.current = fn

  const [tick, setTick] = useState(0)
  const recargar = useCallback(() => setTick(t => t + 1), [])

  useEffect(() => {
    let cancelado = false
    setCargando(true)
    setError(null)

    fnRef.current()
      .then(res => { if (!cancelado) setDatos(res) })
      .catch(err => { if (!cancelado) setError(mensajeDeError(err)) })
      .finally(() => { if (!cancelado) setCargando(false) })

    return () => { cancelado = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick])

  return { datos, cargando, error, recargar, setDatos }
}
