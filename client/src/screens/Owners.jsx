import React, { useState, useCallback } from 'react';
import { HiPlus, HiEye, HiTrash } from 'react-icons/hi2';
import { Header } from '../Components/Header';
import { Modal } from '../Components/Modal';
import { DataTable } from '../Components/DataTable';
import { ConfirmModal } from '../Components/ConfirmModal';
import MyButton from '../Components/MyButton';
import { PropietarioDetalle } from './admin/PropietarioDetalle';
import { useFetch } from '../hooks/useFetch';
import { useToast } from '../context/ToastContext';
import { mensajeDeError } from '../lib/apiError';
import { listarPropietarios, crearPropietario, eliminarPropietario } from '../api/propietarios';
import './main.css';
import '../styles/layout.css';
import '../styles/table.css';

// El mapa de Leaflet que había aquí se eliminó: mostraba marcadores inventados
// sobre Mérida, y ni propietarios ni lotes tienen coordenadas en la base, así
// que nunca podría alimentarse con datos reales. El mapa del producto es el
// plano de lotes (/mapa), que sí se conecta con la base por svg_path_id.

const FORM_VACIO = {
  nombre_completo: '', email: '', password: '',
  telefono: '', whatsapp: '', curp: '', num_escritura: '',
};

function Owners() {
  const toast = useToast();

  const [q, setQ] = useState('');
  const [detalleId, setDetalleId] = useState(null);
  const [modalNuevo, setModalNuevo] = useState(false);
  const [form, setForm] = useState(FORM_VACIO);
  const [guardando, setGuardando] = useState(false);
  const [errorForm, setErrorForm] = useState('');
  const [porEliminar, setPorEliminar] = useState(null);
  const [eliminando, setEliminando] = useState(false);

  const cargar = useCallback(() => listarPropietarios({ q, limit: 200 }), [q]);
  const { datos, cargando, error, recargar } = useFetch(cargar, [q]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
    setErrorForm('');
  };

  const abrirNuevo = () => {
    setForm(FORM_VACIO);
    setErrorForm('');
    setModalNuevo(true);
  };

  const handleCrear = async (e) => {
    e.preventDefault();
    setGuardando(true);
    setErrorForm('');
    try {
      // El backend crea el usuario, el propietario y su QR en una transacción.
      const creado = await crearPropietario({ ...form, password: form.password || undefined });
      toast.exito(`${creado.nombre_completo} dado de alta`);
      setModalNuevo(false);
      recargar();
    } catch (err) {
      setErrorForm(mensajeDeError(err));
    } finally {
      setGuardando(false);
    }
  };

  const handleEliminar = async () => {
    setEliminando(true);
    try {
      await eliminarPropietario(porEliminar.id);
      toast.exito(`${porEliminar.nombre_completo} eliminado`);
      setPorEliminar(null);
      recargar();
    } catch (err) {
      toast.error(mensajeDeError(err));
      setPorEliminar(null);
    } finally {
      setEliminando(false);
    }
  };

  const columnas = [
    { key: 'nombre_completo', label: 'Nombre' },
    { key: 'email', label: 'Correo' },
    { key: 'telefono', label: 'Teléfono', render: p => p.telefono || '—' },
    {
      key: 'lotes',
      label: 'Lotes',
      render: p => (p.lotes?.length
        ? p.lotes.map(l => l.numero).join(', ')
        : <span className="badge badge--gris">Sin lote</span>),
    },
    {
      key: 'acciones',
      label: 'Acciones',
      render: p => (
        <span className="tabla-acciones">
          <button className="icon-btn" onClick={() => setDetalleId(p.id)} aria-label={`Ver ${p.nombre_completo}`}>
            <HiEye size={18} />
          </button>
          <button
            className="icon-btn icon-btn--peligro"
            onClick={() => setPorEliminar(p)}
            aria-label={`Eliminar ${p.nombre_completo}`}
          >
            <HiTrash size={18} />
          </button>
        </span>
      ),
    },
  ];

  return (
    <div className="dashboard-page">
      <Header />

      <div className="page-head">
        <h1 className="section-title">Propietarios</h1>
        {datos && <span className="page-contador">{datos.total} en total</span>}
      </div>

      <div className="page-actions">
        <input
          className="page-search"
          placeholder="Buscar por nombre, correo o teléfono"
          value={q}
          onChange={e => setQ(e.target.value)}
        />
        <button className="access-btn-dark" onClick={abrirNuevo}>
          <HiPlus size={16} /> Nuevo propietario
        </button>
      </div>

      <div className="page-body">
        <DataTable
          columnas={columnas}
          filas={datos?.items}
          cargando={cargando}
          error={error}
          vacio="No hay propietarios registrados"
        />
      </div>

      <Modal isOpen={modalNuevo} onClose={() => setModalNuevo(false)} title="Nuevo propietario">
        <form className="new-access-form" onSubmit={handleCrear}>
          {errorForm && <p className="form-error">{errorForm}</p>}

          <label className="new-access-field">
            Nombre completo
            <input className="new-access-input" name="nombre_completo"
              value={form.nombre_completo} onChange={handleChange} required />
          </label>

          <label className="new-access-field">
            Correo
            <input className="new-access-input" name="email" type="email"
              value={form.email} onChange={handleChange} required />
            <span className="campo-ayuda">
              Con este correo entrará al portal. Se le crea la cuenta y su código
              QR automáticamente.
            </span>
          </label>

          <label className="new-access-field">
            Contraseña inicial
            <input className="new-access-input" name="password" type="text"
              value={form.password} onChange={handleChange}
              placeholder="Se usa la predeterminada si se deja vacío" />
          </label>

          <label className="new-access-field">
            Teléfono
            <input className="new-access-input" name="telefono"
              value={form.telefono} onChange={handleChange} />
          </label>

          <label className="new-access-field">
            WhatsApp
            <input className="new-access-input" name="whatsapp"
              value={form.whatsapp} onChange={handleChange} placeholder="+521..." />
            <span className="campo-ayuda">Con lada internacional; se usa para los comunicados.</span>
          </label>

          <label className="new-access-field">
            CURP
            <input className="new-access-input" name="curp"
              value={form.curp} onChange={handleChange} maxLength={18} />
          </label>

          <label className="new-access-field">
            Número de escritura
            <input className="new-access-input" name="num_escritura"
              value={form.num_escritura} onChange={handleChange} />
          </label>

          <MyButton type="submit" disabled={guardando}>
            {guardando ? 'Guardando…' : 'Dar de alta'}
          </MyButton>
        </form>
      </Modal>

      <Modal isOpen={!!detalleId} onClose={() => setDetalleId(null)} title="Propietario">
        {detalleId && <PropietarioDetalle propietarioId={detalleId} onCambio={recargar} />}
      </Modal>

      <ConfirmModal
        isOpen={!!porEliminar}
        onClose={() => setPorEliminar(null)}
        onConfirm={handleEliminar}
        title="Eliminar propietario"
        mensaje={porEliminar
          ? `¿Eliminar a ${porEliminar.nombre_completo}? Se borrará también su cuenta de acceso y sus documentos, y sus lotes volverán a estar disponibles.`
          : ''}
        textoConfirmar="Eliminar"
        peligro
        cargando={eliminando}
      />
    </div>
  );
}

export default Owners;
