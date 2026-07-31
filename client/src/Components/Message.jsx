import React from 'react';
import { HiMegaphone } from 'react-icons/hi2';
import { Spinner } from './Spinner';
import { fechaRelativa } from '../api/comunicados';
import '../screens/main.css';

// Lista de comunicados del fraccionamiento.
//
// Antes este componente traía dentro un array fijo con avisos inventados en
// inglés ("Appointment Success", "Dr. Emily Walker") y no aceptaba props, así
// que era imposible alimentarlo con datos reales. Ahora recibe los avisos.
export function Message({ items, cargando = false, error = null, vacio = 'No hay comunicados' }) {
  if (cargando) return <Spinner />;
  if (error) return <p className="table-error">{error}</p>;
  if (!items || items.length === 0) return <p className="access-empty">{vacio}</p>;

  return (
    <section>
      <div className="notifications-list">
        {items.map((c) => (
          <div key={c.id} className="notification-item">
            <div className="notification-icon notification-icon--aviso">
              <HiMegaphone size={22} />
            </div>
            <div className="notification-body">
              <div className="notification-meta">
                <p className="notification-title">{c.titulo}</p>
                <span className="notification-time">{fechaRelativa(c.enviado_at)}</span>
              </div>
              <p className="notification-desc">{c.cuerpo}</p>
              {c.autor_nombre && (
                <span className="notification-autor">Publicado por {c.autor_nombre}</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
