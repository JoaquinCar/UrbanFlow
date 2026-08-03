import React, { useState, useCallback } from 'react';
import { HiPlus, HiTrash, HiPencilSquare } from 'react-icons/hi2';
import { Header } from '../../Components/Header';
import { Modal } from '../../Components/Modal';
import { Spinner } from '../../Components/Spinner';
import { ConfirmModal } from '../../Components/ConfirmModal';
import MyButton from '../../Components/MyButton';
import { useFetch } from '../../hooks/useFetch';
import { useToast } from '../../context/ToastContext';
import { mensajeDeError } from '../../lib/apiError';
import {
  listarLotes, crearLote, actualizarLote, eliminarLote, listarEtapas,
  ESTADOS_LOTE, ETIQUETA_ESTADO, CLASE_ESTADO, formatearMoneda,
} from '../../api/lotes';
import '../main.css';
import '../../styles/layout.css';
import '../../styles/table.css';
import '../../styles/caseta.css';

const FORM_VACIO = {
  numero: '', etapa: '', estado: 'disponible',
  superficie_m2: '', precio: '', svg_path_id: '',
};

function Lotes() {
  const toast = useToast();

  const [filtros, setFiltros] = useState({ estado: '', etapa: '', q: '' });
  const [modal, setModal] = useState({ abierto: false, lote: null });
  const [form, setForm] = useState(FORM_VACIO);
  const [guardando, setGuardando] = useState(false);
  const [errorForm, setErrorForm] = useState('');
  const [porEliminar, setPorEliminar] = useState(null);
  const [eliminando, setEliminando] = useState(false);

  const cargar = useCallback(() => listarLotes({ ...filtros, limit: 200 }), [filtros]);
  const { datos, cargando, error, recargar } = useFetch(cargar, [filtros]);
  const { datos: etapas } = useFetch(listarEtapas, []);

  const abrirNuevo = () => {
    setForm(FORM_VACIO);
    setErrorForm('');
    setModal({ abierto: true, lote: null });
  };

  const abrirEditar = (lote) => {
    setForm({
      numero: lote.numero ?? '',
      etapa: lote.etapa ?? '',
      estado: lote.estado ?? 'disponible',
      superficie_m2: lote.superficie_m2 ?? '',
      precio: lote.precio ?? '',
      svg_path_id: lote.svg_path_id ?? '',
    });
    setErrorForm('');
    setModal({ abierto: true, lote });
  };

  const cerrarModal = () => setModal({ abierto: false, lote: null });

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
    setErrorForm('');
  };

  const handleGuardar = async (e) => {
    e.preventDefault();
    setGuardando(true);
    setErrorForm('');

    // Los campos numéricos vacíos van como null, no como cadena vacía.
    const payload = {
      ...form,
      etapa: form.etapa || null,
      svg_path_id: form.svg_path_id || `lote-${form.numero}`,
      superficie_m2: form.superficie_m2 === '' ? null : Number(form.superficie_m2),
      precio: form.precio === '' ? null : Number(form.precio),
    };

    try {
      if (modal.lote) {
        await actualizarLote(modal.lote.id, payload);
        toast.exito(`Lote ${payload.numero} actualizado`);
      } else {
        await crearLote(payload);
        toast.exito(`Lote ${payload.numero} creado`);
      }
      cerrarModal();
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
      await eliminarLote(porEliminar.id);
      toast.exito(`Lote ${porEliminar.numero} eliminado`);
      setPorEliminar(null);
      recargar();
    } catch (err) {
      toast.error(mensajeDeError(err));
      setPorEliminar(null);
    } finally {
      setEliminando(false);
    }
  };

  return (
    <div className="dashboard-page">
      <Header />

      <div className="page-head">
        <h1 className="section-title">Lotes</h1>
        {datos && <span className="page-contador">{datos.total} en total</span>}
      </div>

      <div className="page-actions">
        <input
          className="page-search"
          placeholder="Buscar por número o propietario"
          value={filtros.q}
          onChange={e => setFiltros(f => ({ ...f, q: e.target.value }))}
        />
        <select
          className="page-select"
          value={filtros.estado}
          onChange={e => setFiltros(f => ({ ...f, estado: e.target.value }))}
        >
          <option value="">Todos los estados</option>
          {ESTADOS_LOTE.map(s => <option key={s} value={s}>{ETIQUETA_ESTADO[s]}</option>)}
        </select>
        <select
          className="page-select"
          value={filtros.etapa}
          onChange={e => setFiltros(f => ({ ...f, etapa: e.target.value }))}
        >
          <option value="">Todas las etapas</option>
          {(etapas ?? []).map(e => <option key={e} value={e}>{e}</option>)}
        </select>
        <button className="access-btn-dark" onClick={abrirNuevo}>
          <HiPlus size={16} /> Nuevo lote
        </button>
      </div>

      <div className="page-body">
        {cargando && <Spinner />}
        {error && <p className="table-error">{error}</p>}
        {datos && datos.items.length === 0 && (
          <p className="access-empty">No hay lotes que coincidan con el filtro</p>
        )}

        {datos && datos.items.length > 0 && (
          <ul className="caseta-lista">
            {datos.items.map(l => (
              <li key={l.id} className="caseta-item">
                <div className="caseta-item-info">
                  <span className="caseta-item-nombre">Lote {l.numero}</span>
                  <span className="caseta-item-meta">
                    <span className={`badge ${CLASE_ESTADO[l.estado]}`}>{ETIQUETA_ESTADO[l.estado]}</span>
                    {[l.etapa && `Etapa ${l.etapa}`, l.superficie_m2 && `${l.superficie_m2} m²`]
                      .filter(Boolean).join(' · ')}
                  </span>
                  <span className="caseta-item-tiempo">
                    {formatearMoneda(l.precio)} · {l.propietario_nombre || 'Sin propietario'}
                  </span>
                </div>
                <span className="tabla-acciones">
                  <button className="icon-btn" onClick={() => abrirEditar(l)} aria-label={`Editar lote ${l.numero}`}>
                    <HiPencilSquare size={18} />
                  </button>
                  <button
                    className="icon-btn icon-btn--peligro"
                    onClick={() => setPorEliminar(l)}
                    aria-label={`Eliminar lote ${l.numero}`}
                  >
                    <HiTrash size={18} />
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Modal isOpen={modal.abierto} onClose={cerrarModal} title={modal.lote ? `Editar ${modal.lote.numero}` : 'Nuevo lote'}>
        <form className="new-access-form" onSubmit={handleGuardar}>
          {errorForm && <p className="form-error">{errorForm}</p>}

          <label className="new-access-field">
            Número
            <input
              className="new-access-input"
              name="numero"
              value={form.numero}
              onChange={handleChange}
              placeholder="A-01"
              required
            />
          </label>

          <label className="new-access-field">
            Etapa
            <input
              className="new-access-input"
              name="etapa"
              value={form.etapa}
              onChange={handleChange}
              placeholder="Etapa 1"
            />
          </label>

          <label className="new-access-field">
            Estado
            <select className="new-access-input" name="estado" value={form.estado} onChange={handleChange}>
              {ESTADOS_LOTE.map(s => <option key={s} value={s}>{ETIQUETA_ESTADO[s]}</option>)}
            </select>
          </label>

          <label className="new-access-field">
            Superficie (m²)
            <input
              className="new-access-input"
              name="superficie_m2"
              type="number"
              step="0.01"
              min="0"
              value={form.superficie_m2}
              onChange={handleChange}
            />
          </label>

          <label className="new-access-field">
            Precio (MXN)
            <input
              className="new-access-input"
              name="precio"
              type="number"
              step="0.01"
              min="0"
              value={form.precio}
              onChange={handleChange}
            />
          </label>

          <label className="new-access-field">
            Id en el plano
            <input
              className="new-access-input"
              name="svg_path_id"
              value={form.svg_path_id}
              onChange={handleChange}
              placeholder={`lote-${form.numero || 'A-01'}`}
            />
            <span className="campo-ayuda">
              Debe coincidir con el id del &lt;path&gt; en el plano. Si se deja vacío
              se usa <code>lote-{form.numero || 'A-01'}</code>.
            </span>
          </label>

          <MyButton type="submit" disabled={guardando}>
            {guardando ? 'Guardando…' : modal.lote ? 'Guardar cambios' : 'Crear lote'}
          </MyButton>
        </form>
      </Modal>

      <ConfirmModal
        isOpen={!!porEliminar}
        onClose={() => setPorEliminar(null)}
        onConfirm={handleEliminar}
        title="Eliminar lote"
        mensaje={porEliminar ? `¿Eliminar el lote ${porEliminar.numero}? Esta acción no se puede deshacer.` : ''}
        textoConfirmar="Eliminar"
        peligro
        cargando={eliminando}
      />
    </div>
  );
}

export default Lotes;
