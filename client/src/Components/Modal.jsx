import React from 'react';
import { HiXMark } from 'react-icons/hi2';
import '../screens/main.css';

export function Modal({ isOpen, onClose, title, children }) {
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
