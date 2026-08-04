import React, { useState, useCallback } from 'react';
import {
  HiPlus, HiPencilSquare, HiTrash, HiCalendarDays,
  HiSun, HiBolt, HiMusicalNote, HiTrophy, HiFire, HiFaceSmile, HiSparkles, HiTruck, HiBuildingOffice2,
} from 'react-icons/hi2';
import { Header } from '../../Components/Header';
import { Modal } from '../../Components/Modal';
import { Tabs } from '../../Components/Tabs';
import { Spinner } from '../../Components/Spinner';
import { ConfirmModal } from '../../Components/ConfirmModal';
import { Calendario } from '../../Components/Calendario';
import MyButton from '../../Components/MyButton';
import { useFetch } from '../../hooks/useFetch';
import { useToast } from '../../context/ToastContext';
import { mensajeDeError } from '../../lib/apiError';
import { listarPropietarios } from '../../api/propietarios';
import {
  listarAreas, crearArea, actualizarArea, eliminarArea,
  listarReservaciones, crearReservacion, cambiarEstadoReservacion, cancelarReservacion,
  obtenerDisponibilidad,
  ESTADOS_RESERVA, ETIQUETA_ESTADO_RESERVA, CLASE_ESTADO_RESERVA, HORAS,
  hhmm, fechaLegible, hoyIso,
} from '../../api/reservaciones';
import '../main.css';
import '../../styles/layout.css';
import '../../styles/table.css';
import '../../styles/reservas.css';
import '../../styles/caseta.css';

const FORM_VACIO = { nombre: '', capacidad: '', activa: true };

// Icono por tipo de área, según palabras clave en el nombre. No hay un campo
// "tipo" en el modelo, así que se infiere del nombre para darle identidad
// visual a cada tarjeta.
function iconoArea(nombre = '') {
  const n = nombre.toLowerCase();
  if (/alberca|piscina|pool/.test(n)) return HiSun;
  if (/gimnasio|gym/.test(n)) return HiBolt;
  if (/sal[oó]n|evento|fiesta/.test(n)) return HiMusicalNote;
  if (/cancha|deportiv|tenis|f[uú]tbol|b[aá]squet/.test(n)) return HiTrophy;
  if (/asador|parrilla|bbq/.test(n)) return HiFire;
  if (/parque|juegos|infantil|ni[ñn]os/.test(n)) return HiFaceSmile;
  if (/jard[ií]n|verde/.test(n)) return HiSparkles;
  if (/estacionamiento|parking/.test(n)) return HiTruck;
  return HiBuildingOffice2;
}

function PanelAreas() {
  const toast = useToast();
  const { datos, cargando, error, recargar } = useFetch(() => listarAreas(), []);

  const [modal, setModal] = useState({ abierto: false, area: null });
  const [form, setForm] = useState(FORM_VACIO);
  const [guardando, setGuardando] = useState(false);
  const [errorForm, setErrorForm] = useState('');
  const [porEliminar, setPorEliminar] = useState(null);

  const abrir = (area = null) => {
    setForm(area
      ? { nombre: area.nombre, capacidad: area.capacidad ?? '', activa: area.activa }
      : FORM_VACIO);
    setErrorForm('');
    setModal({ abierto: true, area });
  };

  const handleGuardar = async (e) => {
    e.preventDefault();
    setGuardando(true);
    setErrorForm('');
    const payload = {
      nombre: form.nombre,
      capacidad: form.capacidad === '' ? null : Number(form.capacidad),
      activa: form.activa,
    };
    try {
      if (modal.area) {
        await actualizarArea(modal.area.id, payload);
        toast.exito('Área actualizada');
      } else {
        await crearArea(payload);
        toast.exito('Área creada');
      }
      setModal({ abierto: false, area: null });
      recargar();
    } catch (err) {
      setErrorForm(mensajeDeError(err));
    } finally {
      setGuardando(false);
    }
  };

  const handleEliminar = async () => {
    try {
      await eliminarArea(porEliminar.id);
      toast.exito('Área eliminada');
      setPorEliminar(null);
      recargar();
    } catch (err) {
      // El backend sugiere desactivar si tiene reservaciones.
      toast.error(mensajeDeError(err));
      setPorEliminar(null);
    }
  };

  return (
    <>
      <div className="page-actions">
        <button className="access-btn-dark" onClick={() => abrir()}>
          <HiPlus size={16} /> Nueva área
        </button>
      </div>

      {cargando && <Spinner />}
      {error && <p className="table-error">{error}</p>}
      {datos && datos.length === 0 && (
        <p className="access-empty">No hay áreas comunes registradas</p>
      )}

      {datos && datos.length > 0 && (
        <div className="areas-grid">
          {datos.map(a => {
            const Icono = iconoArea(a.nombre);
            return (
              <div key={a.id} className="area-card">
                <div className="area-card-top">
                  <span className="area-card-icon"><Icono size={22} /></span>
                  <span className={`badge ${a.activa ? 'badge--verde' : 'badge--gris'}`}>
                    {a.activa ? 'Disponible' : 'Desactivada'}
                  </span>
                </div>
                <p className="area-card-nombre">{a.nombre}</p>
                <p className="area-card-capacidad">
                  {a.capacidad ? `${a.capacidad} personas` : 'Sin límite de aforo'}
                </p>
                <span className="tabla-acciones area-card-acciones">
                  <button className="icon-btn" onClick={() => abrir(a)} aria-label={`Editar ${a.nombre}`}>
                    <HiPencilSquare size={17} />
                  </button>
                  <button className="icon-btn icon-btn--peligro" onClick={() => setPorEliminar(a)}
                    aria-label={`Eliminar ${a.nombre}`}>
                    <HiTrash size={17} />
                  </button>
                </span>
              </div>
            );
          })}
        </div>
      )}

      <Modal isOpen={modal.abierto} onClose={() => setModal({ abierto: false, area: null })}
        title={modal.area ? `Editar ${modal.area.nombre}` : 'Nueva área común'}>
        <form className="new-access-form" onSubmit={handleGuardar}>
          {errorForm && <p className="form-error">{errorForm}</p>}

          <label className="new-access-field">
            Nombre
            <input className="new-access-input" value={form.nombre}
              onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
              placeholder="Salón de eventos" required />
          </label>

          <label className="new-access-field">
            Capacidad
            <input className="new-access-input" type="number" min="1" value={form.capacidad}
              onChange={e => setForm(f => ({ ...f, capacidad: e.target.value }))}
              placeholder="Opcional" />
          </label>

          <label className="canal-opcion">
            <input type="checkbox" checked={form.activa}
              onChange={e => setForm(f => ({ ...f, activa: e.target.checked }))} />
            Disponible para reservar
          </label>

          <MyButton type="submit" disabled={guardando}>
            {guardando ? 'Guardando…' : modal.area ? 'Guardar cambios' : 'Crear área'}
          </MyButton>
        </form>
      </Modal>

      <ConfirmModal
        isOpen={!!porEliminar}
        onClose={() => setPorEliminar(null)}
        onConfirm={handleEliminar}
        title="Eliminar área"
        mensaje={porEliminar
          ? `¿Eliminar "${porEliminar.nombre}"? Si tiene reservaciones registradas no se podrá borrar; en ese caso desactívala.`
          : ''}
        textoConfirmar="Eliminar"
        peligro
      />
    </>
  );
}

// Reservar a nombre de un propietario.
//
// El backend lo admite desde el principio: POST /reservaciones acepta el rol
// admin y un propietario_id, y resolverPropietario() comprueba que ese
// propietario sea del mismo fraccionamiento. Lo que faltaba era la pantalla —
// desde aquí solo se podían listar y cambiar de estado las que ya existían.
//
// Es el caso real de la caseta o la administración apuntando la reserva de
// quien la pide por teléfono o en ventanilla.
function ModalNuevaReservacion({ abierto, onCerrar, onCreada }) {
  const { datos: areas } = useFetch(() => listarAreas({ activa: true }), []);
  const { datos: propietarios } = useFetch(() => listarPropietarios({ limit: 300 }), []);

  const [propietarioId, setPropietarioId] = useState('');
  const [areaId, setAreaId] = useState('');
  const [fecha, setFecha] = useState(hoyIso());
  const [seleccion, setSeleccion] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [errorForm, setErrorForm] = useState('');

  const cargarDisponibilidad = useCallback(
    () => (areaId && fecha ? obtenerDisponibilidad(areaId, fecha) : Promise.resolve(null)),
    [areaId, fecha]
  );
  const { datos: disponibilidad, cargando: cargandoDisp, recargar: recargarDisp } =
    useFetch(cargarDisponibilidad, [areaId, fecha]);

  // Mismo gesto que en el portal: un toque fija el inicio, el siguiente el fin.
  const handleFranja = (hora) => {
    setErrorForm('');
    if (!seleccion || seleccion.fin) {
      setSeleccion({ inicio: hora, fin: HORAS[HORAS.indexOf(hora) + 1] ?? '23:00' });
      return;
    }
    if (hora <= seleccion.inicio) {
      setSeleccion({ inicio: hora, fin: HORAS[HORAS.indexOf(hora) + 1] ?? '23:00' });
      return;
    }
    setSeleccion({ inicio: seleccion.inicio, fin: hora });
  };

  const handleGuardar = async (e) => {
    e.preventDefault();
    if (!propietarioId) return setErrorForm('Elige a nombre de qué propietario va la reservación');
    if (!areaId) return setErrorForm('Elige un área');
    if (!seleccion) return setErrorForm('Selecciona una franja horaria en el calendario');

    setGuardando(true);
    setErrorForm('');
    try {
      await crearReservacion({
        propietario_id: propietarioId,
        area_id: areaId,
        fecha,
        hora_inicio: seleccion.inicio,
        hora_fin: seleccion.fin,
      });
      onCreada();
      onCerrar();
    } catch (err) {
      setErrorForm(mensajeDeError(err));
      // Pudo chocar con una reserva creada mientras se elegía el horario.
      recargarDisp();
    } finally {
      setGuardando(false);
    }
  };

  const listaPropietarios = propietarios?.items ?? propietarios ?? [];

  return (
    <Modal isOpen={abierto} onClose={onCerrar} title="Nueva reservación">
      <form className="new-access-form" onSubmit={handleGuardar}>
        {errorForm && <p className="form-error">{errorForm}</p>}

        <label className="new-access-field">
          Propietario
          <select className="new-access-input" value={propietarioId}
            onChange={e => setPropietarioId(e.target.value)}>
            <option value="">Selecciona…</option>
            {listaPropietarios.map(p => (
              <option key={p.id} value={p.id}>{p.nombre_completo}</option>
            ))}
          </select>
        </label>

        <label className="new-access-field">
          Área
          <select className="new-access-input" value={areaId}
            onChange={e => { setAreaId(e.target.value); setSeleccion(null); }}>
            <option value="">Selecciona…</option>
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
            {areaId
              ? 'Toca una hora para el inicio y otra para el fin. Las franjas en gris ya están reservadas.'
              : 'Elige un área para ver qué horas están libres.'}
          </span>
        </div>

        {seleccion && (
          <p className="reserva-resumen">
            {fechaLegible(fecha)} de <strong>{seleccion.inicio}</strong> a{' '}
            <strong>{seleccion.fin}</strong>
          </p>
        )}

        <MyButton type="submit" disabled={guardando}>
          {guardando ? 'Guardando…' : 'Crear reservación'}
        </MyButton>
      </form>
    </Modal>
  );
}

function PanelReservaciones() {
  const toast = useToast();
  const [estado, setEstado] = useState('');
  const [nueva, setNueva] = useState(false);
  const cargar = useCallback(() => listarReservaciones({ estado, limit: 300 }), [estado]);
  const { datos, cargando, error, recargar } = useFetch(cargar, [estado]);

  const handleEstado = async (r, nuevo) => {
    try {
      if (nuevo === 'cancelada') await cancelarReservacion(r.id);
      else await cambiarEstadoReservacion(r.id, nuevo);
      toast.exito(`Reservación ${ETIQUETA_ESTADO_RESERVA[nuevo].toLowerCase()}`);
      recargar();
    } catch (err) {
      toast.error(mensajeDeError(err));
    }
  };

  return (
    <>
      <div className="page-actions">
        <button className="access-btn-dark" onClick={() => setNueva(true)}>
          <HiCalendarDays size={16} /> Nueva reservación
        </button>
      </div>

      <div className="">
        <select className="page-select" value={estado} onChange={e => setEstado(e.target.value)}>
          <option value="">Todos los estados</option>
          {ESTADOS_RESERVA.map(s => <option key={s} value={s}>{ETIQUETA_ESTADO_RESERVA[s]}</option>)}
        </select>
      </div>

      <ModalNuevaReservacion
        abierto={nueva}
        onCerrar={() => setNueva(false)}
        onCreada={() => { toast.exito('Reservación creada'); recargar(); }}
      />

      {cargando && <Spinner />}
      {error && <p className="table-error">{error}</p>}
      {datos && datos.items.length === 0 && (
        <p className="access-empty">No hay reservaciones</p>
      )}

      {datos && datos.items.length > 0 && (
        <ul className="caseta-lista">
          {datos.items.map(r => (
            <li key={r.id} className="caseta-item">
              <div className="caseta-item-info">
                <span className="caseta-item-nombre">{r.area_nombre}</span>
                <span className="caseta-item-meta">{r.propietario_nombre}</span>
                <span className="caseta-item-tiempo">
                  {fechaLegible(r.fecha)} · {hhmm(r.hora_inicio)} – {hhmm(r.hora_fin)}
                </span>
              </div>
              <select className="page-select ticket-select" value={r.estado}
                onChange={e => handleEstado(r, e.target.value)}>
                {ESTADOS_RESERVA.map(s => (
                  <option key={s} value={s}>{ETIQUETA_ESTADO_RESERVA[s]}</option>
                ))}
              </select>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function Areas() {
  return (
    <div className="dashboard-page">
      <Header />
      <div className="page-head">
        <h1 className="section-title">Áreas comunes</h1>
      </div>
      <div className="page-body">
        <Tabs tabs={['Áreas', 'Reservaciones']}>
          <PanelAreas />
          <PanelReservaciones />
        </Tabs>
      </div>
    </div>
  );
}

export default Areas;
