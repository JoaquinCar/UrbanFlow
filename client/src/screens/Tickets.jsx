import React, { useState, useCallback } from 'react';
import { HiPlus, HiWrenchScrewdriver, HiTrash } from 'react-icons/hi2';
import { Header } from '../Components/Header';
import { Modal } from '../Components/Modal';
import { Spinner } from '../Components/Spinner';
import { ConfirmModal } from '../Components/ConfirmModal';
import MyButton from '../Components/MyButton';
import { useAuth } from '../context/AuthContext';
import { useFetch } from '../hooks/useFetch';
import { useToast } from '../context/ToastContext';
import { mensajeDeError } from '../lib/apiError';
import {
  listarTickets, misTickets, listarTecnicos, crearTicket,
  asignarTecnico, cambiarEstado, eliminarTicket,
  ESTADOS_TICKET, ETIQUETA_ESTADO_TICKET, CLASE_ESTADO_TICKET, fechaCorta,
} from '../api/mantenimiento';
import './main.css';
import '../styles/layout.css';
import '../styles/table.css';
import '../styles/tickets.css';

// Una sola pantalla para los tres roles, porque la pregunta de fondo es la
// misma —"¿qué tickets me importan?"— y solo cambia el alcance:
//   admin       → todos, y puede asignar
//   tecnico     → los que le asignaron, y puede mover el estado
//   propietario → los que reportó, y puede crear más
function Tickets() {
  const { rol } = useAuth();
  const toast = useToast();

  const esAdmin = rol === 'admin';
  const puedeReportar = rol === 'propietario' || rol === 'admin' || rol === 'vigilante';

  const [filtroEstado, setFiltroEstado] = useState('');
  const [modalNuevo, setModalNuevo] = useState(false);
  const [form, setForm] = useState({ descripcion: '', ubicacion: '' });
  const [guardando, setGuardando] = useState(false);
  const [errorForm, setErrorForm] = useState('');
  const [porEliminar, setPorEliminar] = useState(null);

  const cargar = useCallback(
    () => (esAdmin
      ? listarTickets({ estado: filtroEstado, limit: 300 })
      : misTickets({ estado: filtroEstado })),
    [esAdmin, filtroEstado]
  );
  const { datos, cargando, error, recargar } = useFetch(cargar, [esAdmin, filtroEstado]);

  // Solo el admin necesita la lista de técnicos, para asignar.
  const { datos: tecnicos } = useFetch(
    useCallback(() => (esAdmin ? listarTecnicos() : Promise.resolve([])), [esAdmin]),
    [esAdmin]
  );

  const tickets = esAdmin ? (datos?.items ?? []) : (datos ?? []);

  const handleCrear = async (e) => {
    e.preventDefault();
    setGuardando(true);
    setErrorForm('');
    try {
      await crearTicket(form);
      toast.exito('Incidencia reportada');
      setModalNuevo(false);
      setForm({ descripcion: '', ubicacion: '' });
      recargar();
    } catch (err) {
      setErrorForm(mensajeDeError(err));
    } finally {
      setGuardando(false);
    }
  };

  const handleAsignar = async (ticket, tecnicoId) => {
    if (!tecnicoId) return;
    try {
      await asignarTecnico(ticket.id, tecnicoId);
      toast.exito('Técnico asignado');
      recargar();
    } catch (err) {
      toast.error(mensajeDeError(err));
    }
  };

  const handleEstado = async (ticket, estado) => {
    try {
      await cambiarEstado(ticket.id, estado);
      toast.exito(`Ticket marcado como ${ETIQUETA_ESTADO_TICKET[estado].toLowerCase()}`);
      recargar();
    } catch (err) {
      toast.error(mensajeDeError(err));
    }
  };

  const handleEliminar = async () => {
    try {
      await eliminarTicket(porEliminar.id);
      toast.exito('Ticket eliminado');
      setPorEliminar(null);
      recargar();
    } catch (err) {
      toast.error(mensajeDeError(err));
      setPorEliminar(null);
    }
  };

  const puedeMoverEstado = (t) =>
    esAdmin || (rol === 'tecnico' && t.tecnico_id);

  return (
    <div className="dashboard-page">
      <Header />

      <div className="page-head">
        <h1 className="section-title">
          {esAdmin ? 'Mantenimiento' : rol === 'tecnico' ? 'Mis asignaciones' : 'Mis reportes'}
        </h1>
        <span className="page-contador">{tickets.length}</span>
      </div>

      <div className="page-actions">
        <select className="page-select" value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)}>
          <option value="">Todos los estados</option>
          {ESTADOS_TICKET.map(s => (
            <option key={s} value={s}>{ETIQUETA_ESTADO_TICKET[s]}</option>
          ))}
        </select>
        {puedeReportar && (
          <button className="access-btn-dark" onClick={() => setModalNuevo(true)}>
            <HiPlus size={16} /> Reportar incidencia
          </button>
        )}
      </div>

      <div className="page-body">
        {cargando && <Spinner />}
        {error && <p className="table-error">{error}</p>}
        {!cargando && tickets.length === 0 && (
          <p className="access-empty">
            {esAdmin ? 'No hay solicitudes de mantenimiento' : 'No tienes tickets'}
          </p>
        )}

        <ul className="ticket-lista">
          {tickets.map(t => (
            <li key={t.id} className="ticket-item">
              <div className="ticket-cabecera">
                <span className={`badge ${CLASE_ESTADO_TICKET[t.estado]}`}>
                  {ETIQUETA_ESTADO_TICKET[t.estado]}
                </span>
                <span className="ticket-fecha">{fechaCorta(t.created_at)}</span>
                {esAdmin && (
                  <button
                    className="icon-btn icon-btn--peligro ticket-borrar"
                    onClick={() => setPorEliminar(t)}
                    aria-label="Eliminar ticket"
                  >
                    <HiTrash size={15} />
                  </button>
                )}
              </div>

              <p className="ticket-descripcion">{t.descripcion}</p>

              <div className="ticket-meta">
                {t.ubicacion && <span>📍 {t.ubicacion}</span>}
                {esAdmin && <span>Reportó: {t.solicitante_nombre}</span>}
                <span className={t.tecnico_nombre ? '' : 'ticket-sin-asignar'}>
                  {t.tecnico_nombre ? `Técnico: ${t.tecnico_nombre}` : 'Sin asignar'}
                </span>
                {t.resuelto_at && <span>Resuelto el {fechaCorta(t.resuelto_at)}</span>}
              </div>

              <div className="ticket-acciones">
                {esAdmin && (
                  <select
                    className="page-select ticket-select"
                    value={t.tecnico_id ?? ''}
                    onChange={e => handleAsignar(t, e.target.value)}
                  >
                    <option value="">Asignar técnico…</option>
                    {(tecnicos ?? []).map(tec => (
                      <option key={tec.id} value={tec.id}>
                        {tec.nombre} ({tec.tickets_activos} activos)
                      </option>
                    ))}
                  </select>
                )}

                {puedeMoverEstado(t) && (
                  <select
                    className="page-select ticket-select"
                    value={t.estado}
                    onChange={e => handleEstado(t, e.target.value)}
                  >
                    {ESTADOS_TICKET.map(s => (
                      <option key={s} value={s}>{ETIQUETA_ESTADO_TICKET[s]}</option>
                    ))}
                  </select>
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>

      <Modal isOpen={modalNuevo} onClose={() => setModalNuevo(false)} title="Reportar incidencia">
        <form className="new-access-form" onSubmit={handleCrear}>
          {errorForm && <p className="form-error">{errorForm}</p>}

          <label className="new-access-field">
            ¿Qué ocurre?
            <textarea
              className="new-access-input ticket-textarea"
              rows={4}
              value={form.descripcion}
              onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))}
              placeholder="Describe el problema con el mayor detalle posible"
              required
            />
          </label>

          <label className="new-access-field">
            Ubicación
            <input
              className="new-access-input"
              value={form.ubicacion}
              onChange={e => setForm(f => ({ ...f, ubicacion: e.target.value }))}
              placeholder="Calle Palmas, frente al lote A-04"
            />
          </label>

          <MyButton type="submit" disabled={guardando}>
            {guardando ? 'Enviando…' : 'Enviar reporte'}
          </MyButton>
        </form>
      </Modal>

      <ConfirmModal
        isOpen={!!porEliminar}
        onClose={() => setPorEliminar(null)}
        onConfirm={handleEliminar}
        title="Eliminar ticket"
        mensaje="¿Eliminar esta solicitud de mantenimiento? No se puede deshacer."
        textoConfirmar="Eliminar"
        peligro
      />
    </div>
  );
}

export default Tickets;
