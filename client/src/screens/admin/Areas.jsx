import React, { useState, useCallback } from 'react';
import { HiPlus, HiPencilSquare, HiTrash } from 'react-icons/hi2';
import { Header } from '../../Components/Header';
import { Modal } from '../../Components/Modal';
import { Tabs } from '../../Components/Tabs';
import { DataTable } from '../../Components/DataTable';
import { ConfirmModal } from '../../Components/ConfirmModal';
import MyButton from '../../Components/MyButton';
import { useFetch } from '../../hooks/useFetch';
import { useToast } from '../../context/ToastContext';
import { mensajeDeError } from '../../lib/apiError';
import {
  listarAreas, crearArea, actualizarArea, eliminarArea,
  listarReservaciones, cambiarEstadoReservacion, cancelarReservacion,
  ESTADOS_RESERVA, ETIQUETA_ESTADO_RESERVA, CLASE_ESTADO_RESERVA,
  hhmm, fechaLegible,
} from '../../api/reservaciones';
import '../main.css';
import '../../styles/layout.css';
import '../../styles/table.css';
import '../../styles/reservas.css';

const FORM_VACIO = { nombre: '', capacidad: '', activa: true };

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

  const columnas = [
    { key: 'nombre', label: 'Área' },
    { key: 'capacidad', label: 'Capacidad', render: a => (a.capacidad ? `${a.capacidad} personas` : '—') },
    {
      key: 'activa',
      label: 'Estado',
      render: a => (
        <span className={`badge ${a.activa ? 'badge--verde' : 'badge--gris'}`}>
          {a.activa ? 'Disponible' : 'Desactivada'}
        </span>
      ),
    },
    {
      key: 'acciones',
      label: 'Acciones',
      render: a => (
        <span className="tabla-acciones">
          <button className="icon-btn" onClick={() => abrir(a)} aria-label={`Editar ${a.nombre}`}>
            <HiPencilSquare size={17} />
          </button>
          <button className="icon-btn icon-btn--peligro" onClick={() => setPorEliminar(a)}
            aria-label={`Eliminar ${a.nombre}`}>
            <HiTrash size={17} />
          </button>
        </span>
      ),
    },
  ];

  return (
    <>
      <div className="page-actions">
        <button className="access-btn-dark" onClick={() => abrir()}>
          <HiPlus size={16} /> Nueva área
        </button>
      </div>

      <DataTable columnas={columnas} filas={datos} cargando={cargando} error={error}
        vacio="No hay áreas comunes registradas" />

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

function PanelReservaciones() {
  const toast = useToast();
  const [estado, setEstado] = useState('');
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

  const columnas = [
    { key: 'area_nombre', label: 'Área' },
    { key: 'propietario_nombre', label: 'Propietario' },
    { key: 'fecha', label: 'Fecha', render: r => fechaLegible(r.fecha) },
    { key: 'horario', label: 'Horario', render: r => `${hhmm(r.hora_inicio)} – ${hhmm(r.hora_fin)}` },
    {
      key: 'estado',
      label: 'Estado',
      render: r => (
        <select className="page-select ticket-select" value={r.estado}
          onChange={e => handleEstado(r, e.target.value)}>
          {ESTADOS_RESERVA.map(s => (
            <option key={s} value={s}>{ETIQUETA_ESTADO_RESERVA[s]}</option>
          ))}
        </select>
      ),
    },
  ];

  return (
    <>
      <div className="page-actions">
        <select className="page-select" value={estado} onChange={e => setEstado(e.target.value)}>
          <option value="">Todos los estados</option>
          {ESTADOS_RESERVA.map(s => <option key={s} value={s}>{ETIQUETA_ESTADO_RESERVA[s]}</option>)}
        </select>
      </div>

      <DataTable columnas={columnas} filas={datos?.items} cargando={cargando} error={error}
        vacio="No hay reservaciones" />
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
