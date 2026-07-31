import React from 'react'
import { Spinner } from './Spinner'
import { HORAS, hhmm } from '../api/reservaciones'
import '../styles/reservas.css'

// Rejilla de franjas horarias de un día para un área.
//
// Se pintan horas completas de 8:00 a 23:00 en lugar de un selector libre de
// hora: acota el problema, hace obvio qué está libre y evita reservas de
// "10:37 a 11:14" que nadie quiere gestionar.
//
// `ocupado` son las franjas que devuelve el backend. Una hora se marca ocupada
// si su intervalo [h, h+1) se solapa con alguna reserva existente.
export function Calendario({ ocupado = [], cargando = false, seleccion, onSeleccionar }) {
  if (cargando) return <Spinner label="Consultando disponibilidad…" />

  function ocupacionDe(hora) {
    return ocupado.find(r => hhmm(r.hora_inicio) <= hora && hora < hhmm(r.hora_fin))
  }

  return (
    <div className="calendario">
      {HORAS.map(hora => {
        const reserva = ocupacionDe(hora)
        const activa = seleccion?.inicio === hora
        const enRango = seleccion &&
          hora >= seleccion.inicio && hora < seleccion.fin

        return (
          <button
            key={hora}
            type="button"
            className={[
              'franja',
              reserva ? 'franja--ocupada' : 'franja--libre',
              enRango ? 'franja--seleccionada' : '',
              activa ? 'franja--inicio' : '',
            ].filter(Boolean).join(' ')}
            disabled={!!reserva}
            onClick={() => onSeleccionar?.(hora)}
            title={reserva
              ? `Reservado por ${reserva.propietario_nombre}`
              : `Reservar de ${hora} en adelante`}
          >
            <span className="franja-hora">{hora}</span>
            {reserva && <span className="franja-quien">{reserva.propietario_nombre}</span>}
          </button>
        )
      })}
    </div>
  )
}
