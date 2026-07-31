import React, { useEffect, useRef, useState } from 'react'
import { Spinner } from './Spinner'
import '../styles/mapa.css'

// Overlay de React sobre el SVG del plano.
//
// El SVG se carga como texto y se inyecta, en vez de usar <img> o <object>,
// porque hace falta acceder a cada <path> para colorearlo y escuchar sus
// clicks. Con <img> el SVG es opaco: no hay DOM al que engancharse.
//
// La unión entre figura y datos es `lote.svg_path_id` ↔ el atributo id del
// <path>. Un lote cuyo svg_path_id no exista en el plano simplemente no se
// pinta, y se avisa por consola en desarrollo.
export function MapaLotes({ lotes = [], onSeleccionar, seleccionadoId }) {
  const contenedorRef = useRef(null)
  const [svg, setSvg] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelado = false
    fetch('/assets/mapa-fraccionamiento.svg')
      .then(r => {
        if (!r.ok) throw new Error(`No se pudo cargar el plano (${r.status})`)
        return r.text()
      })
      .then(texto => { if (!cancelado) setSvg(texto) })
      .catch(err => { if (!cancelado) setError(err.message) })
    return () => { cancelado = true }
  }, [])

  // Pinta los estados y engancha los clicks cada vez que cambian los lotes.
  useEffect(() => {
    const cont = contenedorRef.current
    if (!cont || !svg) return

    const porPathId = new Map(lotes.map(l => [l.svg_path_id, l]))
    const limpiezas = []
    let sinPintar = 0

    cont.querySelectorAll('.mapa-lote').forEach(path => {
      const lote = porPathId.get(path.id)

      if (!lote) {
        path.classList.add('mapa-lote--sin-datos')
        return
      }

      path.classList.remove('mapa-lote--sin-datos')
      path.classList.add(`mapa-lote--${lote.estado}`)
      path.classList.toggle('mapa-lote--activo', lote.id === seleccionadoId)

      // Accesible con teclado: el plano no puede ser solo para ratón.
      path.setAttribute('tabindex', '0')
      path.setAttribute('role', 'button')
      path.setAttribute('aria-label',
        `Lote ${lote.numero}, ${lote.estado}${lote.propietario_nombre ? `, ${lote.propietario_nombre}` : ''}`)

      const activar = () => onSeleccionar?.(lote)
      const porTecla = (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activar() }
      }

      path.addEventListener('click', activar)
      path.addEventListener('keydown', porTecla)
      limpiezas.push(() => {
        path.removeEventListener('click', activar)
        path.removeEventListener('keydown', porTecla)
      })
    })

    // Aviso útil cuando el seed y el plano se desincronizan.
    sinPintar = lotes.filter(l => !cont.querySelector(`#${CSS.escape(l.svg_path_id ?? '')}`)).length
    if (sinPintar > 0 && import.meta.env.DEV) {
      console.warn(`[MapaLotes] ${sinPintar} lote(s) sin figura en el plano. Revisa svg_path_id.`)
    }

    return () => limpiezas.forEach(fn => fn())
  }, [svg, lotes, seleccionadoId, onSeleccionar])

  if (error) return <p className="table-error">{error}</p>
  if (!svg) return <Spinner label="Cargando plano…" />

  return (
    <div
      className="mapa-contenedor"
      ref={contenedorRef}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  )
}
