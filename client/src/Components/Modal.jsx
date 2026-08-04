import React, { useEffect } from 'react';
import { HiXMark } from 'react-icons/hi2';
import '../screens/main.css';

export function Modal({ isOpen, onClose, title, children }) {
  // Escape cierra. Se declara antes del return temprano porque los hooks no
  // pueden ejecutarse condicionalmente; de ahí el `if (!isOpen) return` dentro
  // del efecto en lugar de fuera.
  useEffect(() => {
    if (!isOpen) return undefined;
    const alPulsar = (e) => { if (e.key === 'Escape') onClose?.(); };
    document.addEventListener('keydown', alPulsar);
    return () => document.removeEventListener('keydown', alPulsar);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <>
      <div className="modal-overlay" onClick={onClose} />
      <div className="modal-card" role="dialog" aria-modal="true">
        <div className="modal-header">
          {title && <h3 className="modal-title">{title}</h3>}
          <button className="modal-close-btn" onClick={onClose} aria-label="Cerrar">
            <HiXMark size={22} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </>
  );
}
