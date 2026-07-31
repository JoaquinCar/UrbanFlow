import React, { useState, useCallback } from 'react';
import { HiCalendarDays, HiXMark } from 'react-icons/hi2';
import { Header } from '../../Components/Header';
import { Modal } from '../../Components/Modal';
import { Spinner } from '../../Components/Spinner';
import { Calendario } from '../../Components/Calendario';
import MyButton from '../../Components/MyButton';
import { useFetch } from '../../hooks/useFetch';
import { useToast } from '../../context/ToastContext';
import { mensajeDeError } from '../../lib/apiError';
import {
  listarAreas, obtenerDisponibilidad, crearReservacion,
  misReservaciones, cancelarReservacion,
  CLASE_ESTADO_RESERVA, ETIQUETA_ESTADO_RESERVA, HORAS,
  hhmm, fechaLegible, soloFecha, hoyIso,
} from '../../api/reservaciones';
import '../main.css';
import '../../styles/layout.css';
import '../../styles/table.css';
import '../../styles/reservas.css';

function Reservas() {
  const toast = useToast();

  const { datos: areas } = useFetch(() => listarAreas({ activa: true }), []);
  const { datos: mias, cargando: cargandoMias, recargar: recargarMias } = useFetch(misReservaciones, []);

  const [modal, setModal] = useState(false);
  const [areaId, setAreaId] = useState('');
  const [fecha, setFecha] = useState(hoyIso());
  const [seleccion, setSeleccion] = useState(null);
  const [reservando, setReservando] = useState(false);
  const [errorForm, setErrorForm] = useState('');

  const cargarDisponibilidad = useCallback(
    () => (areaId && fecha ? obtenerDisponibilidad(areaId, fecha) : Promise.resolve(null)),
    [areaId, fecha]
  );
  const { datos: disponibilidad, cargando: cargandoDisp, recargar: recargarDisp } =
    useFetch(cargarDisponibilidad, [areaId, fecha]);

  const abrir = () => {
    setAreaId(areas?.[0]?.id ?? '');
    setFecha(hoyIso());
    setSeleccion(null);
    setErrorForm('');
    setModal(true);
  };

  // Primer clic fija el inicio; el segundo, el fin. Un tercero reinicia.
  const handleFranja = (hora) => {
    setErrorForm('');
    if (!seleccion || seleccion.fin) {
      const siguiente = HORAS[HORAS.indexOf(hora) + 1] ?? '23:00';
      setSeleccion({ inicio: hora, fin: siguiente });
      return;
    }
    if (hora <= seleccion.inicio) {
      setSeleccion({ inicio: hora, fin: HORAS[HORAS.indexOf(hora) + 1] ?? '23:00' });
      return;
    }
    setSeleccion({ inicio: seleccion.inicio, fin: hora });
  };

  const handleReservar = async (e) => {
    e.preventDefault();
    if (!seleccion) {
      setErrorForm('Selecciona una franja horaria en el calendario');
      return;
    }
    setReservando(true);
    setErrorForm('');
    try {
      await crearReservacion({
        area_id: areaId,
        fecha,
        hora_inicio: seleccion.inicio,
        hora_fin: seleccion.fin,
      });
      toast.exito('Reservación creada. Queda pendiente de confirmación.');
      setModal(false);
      recargarMias();
    } catch (err) {
      setErrorForm(mensajeDeError(err));
      // Puede haber chocado con una reserva creada mientras elegías.
      recargarDisp();
    } finally {
      setReservando(false);
    }
  };

  const handleCancelar = async (r) => {
    try {
      await cancelarReservacion(r.id);
      toast.exito('Reservación cancelada');
      recargarMias();
    } catch (err) {
      toast.error(mensajeDeError(err));
    }
  };

  return (
    <div className="dashboard-page">
      <Header />

      <div className="page-head">
        <h1 className="section-title">Áreas comunes</h1>
      </div>

      <div className="page-actions">
        <button className="access-btn-dark" onClick={abrir} disabled={!areas?.length}>
          <HiCalendarDays size={16} /> Reservar un área
        </button>
      </div>

      <div className="page-body">
        <h2 className="caseta-subtitulo">
          Mis reservaciones {mias && <span className="page-contador">{mias.length}</span>}
        </h2>

        {cargandoMias && <Spinner />}
        {mias && mias.length === 0 && <p className="access-empty">No tienes reservaciones</p>}

        <ul className="reserva-lista">
          {(mias ?? []).map(r => (
            <li key={r.id} className="reserva-item">
              <div className="reserva-info">
                <span className="reserva-area">{r.area_nombre}</span>
                <span className="reserva-fecha">{fechaLegible(r.fecha)}</span>
                <span className="reserva-hora">{hhmm(r.hora_inicio)} – {hhmm(r.hora_fin)}</span>
              </div>
              <div className="reserva-derecha">
                <span className={`badge ${CLASE_ESTADO_RESERVA[r.estado]}`}>
                  {ETIQUETA_ESTADO_RESERVA[r.estado]}
                </span>
                {r.estado !== 'cancelada' && (
                  <button className="reserva-cancelar" onClick={() => handleCancelar(r)}>
                    <HiXMark size={14} /> Cancelar
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>

      <Modal isOpen={modal} onClose={() => setModal(false)} title="Reservar área común">
        <form className="new-access-form" onSubmit={handleReservar}>
          {errorForm && <p className="form-error">{errorForm}</p>}

          <label className="new-access-field">
            Área
            <select className="new-access-input" value={areaId}
              onChange={e => { setAreaId(e.target.value); setSeleccion(null); }}>
              {(areas ?? []).map(a => (
                <option key={a.id} value={a.id}>
                  {a.nombre}{a.capacidad ? ` (hasta ${a.capacidad} personas)` : ''}
                </option>
              ))}
            </select>
          </label>

          <label className="new-access-field">
            Fecha
            <input className="new-access-input" type="date" value={fecha} min={hoyIso()}
              onChange={e => { setFecha(e.target.value); setSeleccion(null); }} />
          </label>

          <div className="new-access-field">
            Horario
            <Calendario
              ocupado={disponibilidad?.ocupado ?? []}
              cargando={cargandoDisp}
              seleccion={seleccion}
              onSeleccionar={handleFranja}
            />
            <span className="campo-ayuda">
              Toca una hora para el inicio y otra para el fin. Las franjas en gris
              ya están reservadas.
            </span>
          </div>

          {seleccion && (
            <p className="reserva-resumen">
              {fechaLegible(fecha)} de <strong>{seleccion.inicio}</strong> a{' '}
              <strong>{seleccion.fin}</strong>
            </p>
          )}

          <MyButton type="submit" disabled={reservando}>
            {reservando ? 'Reservando…' : 'Confirmar reservación'}
          </MyButton>
        </form>
      </Modal>
    </div>
  );
}

export default Reservas;
