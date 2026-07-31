import React from 'react'
import '../styles/feedback.css'

export function Spinner({ size = 32, label = 'Cargando…' }) {
  return (
    <div className="spinner-wrap" role="status" aria-live="polite">
      <span className="spinner" style={{ width: size, height: size }} />
      {label && <span className="spinner-label">{label}</span>}
    </div>
  )
}
