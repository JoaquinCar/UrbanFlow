import React from 'react'
import { Modal } from './Modal'
import '../styles/feedback.css'

// Confirmación para acciones destructivas (eliminar lote, cancelar reserva...).
// Reutiliza el Modal de tipo bottom-sheet que ya existía.
export function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title = '¿Confirmar acción?',
  mensaje,
  textoConfirmar = 'Confirmar',
  textoCancelar = 'Cancelar',
  peligro = false,
  cargando = false,
}) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title}>
      <div className="confirm-body">
        {mensaje && <p className="confirm-mensaje">{mensaje}</p>}
        <div className="confirm-actions">
          <button className="access-btn-outline" onClick={onClose} disabled={cargando}>
            {textoCancelar}
          </button>
          <button
            className={peligro ? 'confirm-btn-peligro' : 'access-btn-dark'}
            onClick={onConfirm}
            disabled={cargando}
          >
            {cargando ? 'Procesando…' : textoConfirmar}
          </button>
        </div>
      </div>
    </Modal>
  )
}
