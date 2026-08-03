import React, { useState, useCallback } from 'react';
import { HiPlus, HiArrowPath, HiBanknotes, HiArrowDownTray } from 'react-icons/hi2';
import { Header } from '../../Components/Header';
import { Modal } from '../../Components/Modal';
import { Tabs } from '../../Components/Tabs';
import { Spinner } from '../../Components/Spinner';
import MyButton from '../../Components/MyButton';
import { useFetch } from '../../hooks/useFetch';
import { useToast } from '../../context/ToastContext';
import { mensajeDeError } from '../../lib/apiError';
import { listarPropietarios } from '../../api/propietarios';
import {
  listarCuotas, listarMorosos, crearCuotaExtraordinaria, generarMensuales,
  registrarPagoManual, descargarRecibo, listarPagos,
  ESTADOS_CUOTA, ETIQUETA_ESTADO_CUOTA, CLASE_ESTADO_CUOTA, METODOS_PAGO,
  moneda, periodo, fechaCorta, conceptoCuota,
} from '../../api/pagos';
import '../main.css';
import '../../styles/layout.css';
import '../../styles/table.css';
import '../../styles/pagos.css';
import '../../styles/caseta.css';

// ── Pestaña: cuotas ─────────────────────────────────────────────────────────
function PanelCuotas({ propietarios, onCambio }) {
  const toast = useToast();
  const [filtros, setFiltros] = useState({ estado: '', propietario_id: '' });
  const [cobrando, setCobrando] = useState(null);
  const [form, setForm] = useState({ monto: '', metodo: 'efectivo', referencia: '' });
  const [guardando, setGuardando] = useState(false);
  const [errorForm, setErrorForm] = useState('');

  const cargar = useCallback(() => listarCuotas({ ...filtros, limit: 500 }), [filtros]);
  const { datos, cargando, error, recargar } = useFetch(cargar, [filtros]);

  const abrirCobro = (cuota) => {
    setForm({ monto: cuota.monto, metodo: 'efectivo', referencia: '' });
    setErrorForm('');
    setCobrando(cuota);
  };

  const handleCobrar = async (e) => {
    e.preventDefault();
    setGuardando(true);
    setErrorForm('');
    try {
      await registrarPagoManual({
        cuota_id: cobrando.id,
        monto_pagado: Number(form.monto),
        metodo: form.metodo,
        referencia: form.referencia || null,
      });
      toast.exito(`Pago registrado: ${moneda(form.monto)}`);
      setCobrando(null);
      recargar();
      onCambio?.();
    } catch (err) {
      setErrorForm(mensajeDeError(err));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <>
      <div className="page-actions">
        <select className="page-select" value={filtros.estado}
          onChange={e => setFiltros(f => ({ ...f, estado: e.target.value }))}>
          <option value="">Todos los estados</option>
          {ESTADOS_CUOTA.map(s => <option key={s} value={s}>{ETIQUETA_ESTADO_CUOTA[s]}</option>)}
        </select>
        <select className="page-select" value={filtros.propietario_id}
          onChange={e => setFiltros(f => ({ ...f, propietario_id: e.target.value }))}>
          <option value="">Todos los propietarios</option>
          {propietarios.map(p => <option key={p.id} value={p.id}>{p.nombre_completo}</option>)}
        </select>
      </div>

      {datos?.resumen && (
        <div className="resumen-cuotas">
          <span>Cobrado: <strong>{moneda(datos.resumen.monto_cobrado)}</strong></span>
          <span>Pendiente: <strong>{moneda(datos.resumen.monto_pendiente)}</strong></span>
        </div>
      )}

      {cargando && <Spinner />}
      {error && <p className="table-error">{error}</p>}
      {datos && datos.items.length === 0 && (
        <p className="access-empty">No hay cuotas que coincidan con el filtro</p>
      )}

      {datos && datos.items.length > 0 && (
        <ul className="caseta-lista cuotas-grid">
          {datos.items.map(c => (
            <li key={c.id} className="caseta-item">
              <div className="caseta-item-info">
                <span className="caseta-item-nombre">{c.propietario_nombre}</span>
                <span className="caseta-item-meta">
                  <span className={`badge ${CLASE_ESTADO_CUOTA[c.estado_actual]}`}>
                    {ETIQUETA_ESTADO_CUOTA[c.estado_actual]}
                  </span>
                  {conceptoCuota(c)}
                </span>
                <span className="caseta-item-tiempo">
                  {periodo(c.mes_anio)} · {moneda(c.monto)}
                </span>
              </div>
              {c.estado_actual === 'pagado'
                ? <span className="campo-ayuda">Pagada</span>
                : (
                  <button className="access-btn-dark cuota-cobrar" style={{ width: '80%' }} onClick={() => abrirCobro(c)}>
                    <HiBanknotes size={14} /> Cobrar
                  </button>
                )}
            </li>
          ))}
        </ul>
      )}

      <Modal isOpen={!!cobrando} onClose={() => setCobrando(null)} title="Registrar pago">
        <form className="new-access-form" onSubmit={handleCobrar}>
          {errorForm && <p className="form-error">{errorForm}</p>}
          {cobrando && (
            <p className="campo-ayuda">
              {cobrando.propietario_nombre} — {conceptoCuota(cobrando)} ({periodo(cobrando.mes_anio)})
            </p>
          )}

          <label className="new-access-field">
            Monto recibido
            <input className="new-access-input" type="number" step="0.01" min="0"
              value={form.monto} onChange={e => setForm(f => ({ ...f, monto: e.target.value }))} required />
          </label>

          <label className="new-access-field">
            Método
            <select className="new-access-input" value={form.metodo}
              onChange={e => setForm(f => ({ ...f, metodo: e.target.value }))}>
              {METODOS_PAGO.map(m => <option key={m.valor} value={m.valor}>{m.etiqueta}</option>)}
            </select>
            <span className="campo-ayuda">
              Los pagos en línea los registra MercadoPago automáticamente.
            </span>
          </label>

          <label className="new-access-field">
            Referencia
            <input className="new-access-input" value={form.referencia}
              onChange={e => setForm(f => ({ ...f, referencia: e.target.value }))}
              placeholder="Folio de caja o transferencia" />
          </label>

          <MyButton type="submit" disabled={guardando}>
            {guardando ? 'Registrando…' : 'Registrar pago'}
          </MyButton>
        </form>
      </Modal>
    </>
  );
}

// ── Pestaña: morosos ────────────────────────────────────────────────────────
function PanelMorosos() {
  const { datos, cargando, error } = useFetch(listarMorosos, []);

  return (
    <>
      {cargando && <Spinner />}
      {error && <p className="table-error">{error}</p>}
      {datos && datos.length === 0 && (
        <p className="access-empty">No hay propietarios con pendientes de pago</p>
      )}

      {datos && datos.length > 0 && (
        <ul className="caseta-lista cuotas-grid cuotas-grid--simple">
          {datos.map(m => (
            <li key={m.propietario_id} className="caseta-item">
              <div className="caseta-item-info">
                <span className="caseta-item-nombre">{m.nombre_completo}</span>
                <span className="caseta-item-meta">
                  {m.cuotas_vencidas} cuota{m.cuotas_vencidas === 1 ? '' : 's'} vencida{m.cuotas_vencidas === 1 ? '' : 's'} · Desde {periodo(m.desde)}
                </span>
                <span className="caseta-item-tiempo">{m.telefono || m.email}</span>
              </div>
              <strong className="texto-peligro">{moneda(m.monto_adeudado)}</strong>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

// ── Pestaña: pagos ──────────────────────────────────────────────────────────
function PanelPagos() {
  const toast = useToast();
  const { datos, cargando, error } = useFetch(() => listarPagos({ limit: 300 }), []);

  const handleRecibo = async (pago) => {
    try {
      await descargarRecibo(pago.id);
    } catch (err) {
      toast.error(mensajeDeError(err));
    }
  };

  return (
    <>
      {cargando && <Spinner />}
      {error && <p className="table-error">{error}</p>}
      {datos && datos.items.length === 0 && (
        <p className="access-empty">Aún no hay pagos registrados</p>
      )}

      {datos && datos.items.length > 0 && (
        <ul className="caseta-lista cuotas-grid cuotas-grid--simple">
          {datos.items.map(p => (
            <li key={p.id} className="caseta-item">
              <div className="caseta-item-info">
                <span className="caseta-item-nombre">{p.propietario_nombre}</span>
                <span className="caseta-item-meta">{conceptoCuota(p)}</span>
                <span className="caseta-item-tiempo">
                  {fechaCorta(p.fecha_pago)} · {p.metodo} · {moneda(p.monto_pagado)}
                </span>
              </div>
              <button className="icon-btn" onClick={() => handleRecibo(p)} aria-label="Descargar recibo">
                <HiArrowDownTray size={16} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

// ── Pantalla ────────────────────────────────────────────────────────────────
function Cuotas() {
  const toast = useToast();
  const { datos: props } = useFetch(() => listarPropietarios({ limit: 200 }), []);
  const [version, setVersion] = useState(0);

  const [modalNueva, setModalNueva] = useState(false);
  const [form, setForm] = useState({ propietario_id: 'todos', monto: '', concepto: '' });
  const [guardando, setGuardando] = useState(false);
  const [errorForm, setErrorForm] = useState('');
  const [generando, setGenerando] = useState(false);

  const handleCrear = async (e) => {
    e.preventDefault();
    setGuardando(true);
    setErrorForm('');
    try {
      const r = await crearCuotaExtraordinaria({ ...form, monto: Number(form.monto) });
      toast.exito(`${r.creadas} cuota(s) creada(s)`);
      setModalNueva(false);
      setForm({ propietario_id: 'todos', monto: '', concepto: '' });
      setVersion(v => v + 1);
    } catch (err) {
      setErrorForm(mensajeDeError(err));
    } finally {
      setGuardando(false);
    }
  };

  const handleGenerar = async () => {
    setGenerando(true);
    try {
      const r = await generarMensuales();
      toast.exito(
        r.insertadas > 0
          ? `${r.insertadas} cuota(s) mensual(es) generada(s)`
          : 'Las cuotas de este mes ya estaban generadas'
      );
      setVersion(v => v + 1);
    } catch (err) {
      toast.error(mensajeDeError(err));
    } finally {
      setGenerando(false);
    }
  };

  return (
    <div className="dashboard-page">
      <Header />

      <div className="page-head">
        <h1 className="section-title">Cuotas y pagos</h1>
      </div>

      <div className="page-actions">
        <button className="access-btn-dark" onClick={() => setModalNueva(true)}>
          <HiPlus size={16} /> Cuota extraordinaria
        </button>
        <button className="access-btn-outline" onClick={handleGenerar} disabled={generando}>
          <HiArrowPath size={16} /> {generando ? 'Generando…' : 'Generar mesuales'}
        </button>
      </div>

      <div className="page-body">
        <Tabs tabs={['Cuotas', 'Vencidos', 'Pagos']} key={version}>
          <PanelCuotas propietarios={props?.items ?? []} onCambio={() => setVersion(v => v + 1)} />
          <PanelMorosos />
          <PanelPagos />
        </Tabs>
      </div>

      <Modal isOpen={modalNueva} onClose={() => setModalNueva(false)} title="Cuota extraordinaria">
        <form className="new-access-form" onSubmit={handleCrear}>
          {errorForm && <p className="form-error">{errorForm}</p>}

          <label className="new-access-field">
            Asignar a
            <select className="new-access-input" value={form.propietario_id}
              onChange={e => setForm(f => ({ ...f, propietario_id: e.target.value }))}>
              <option value="todos">Todos los propietarios con lote</option>
              {(props?.items ?? []).map(p => (
                <option key={p.id} value={p.id}>{p.nombre_completo}</option>
              ))}
            </select>
          </label>

          <label className="new-access-field">
            Concepto
            <input className="new-access-input" value={form.concepto}
              onChange={e => setForm(f => ({ ...f, concepto: e.target.value }))}
              placeholder="Reparación del portón principal" required />
          </label>

          <label className="new-access-field">
            Monto por propietario
            <input className="new-access-input" type="number" step="0.01" min="0.01"
              value={form.monto} onChange={e => setForm(f => ({ ...f, monto: e.target.value }))} required />
          </label>

          <MyButton type="submit" disabled={guardando}>
            {guardando ? 'Creando…' : 'Crear cuota'}
          </MyButton>
        </form>
      </Modal>
    </div>
  );
}

export default Cuotas;
