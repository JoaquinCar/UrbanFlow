import React, { useCallback, useState } from 'react';
import { HiArrowDownTray, HiArrowPath, HiMapPin, HiPlus, HiQrCode, HiXMark } from 'react-icons/hi2';
import { Header } from '../Components/Header';
import { Tabs } from '../Components/Tabs';
import { Spinner } from '../Components/Spinner';
import { Modal } from '../Components/Modal';
import MyButton from '../Components/MyButton';
import { useFetch } from '../hooks/useFetch';
import { useToast } from '../context/ToastContext';
import { mensajeDeError } from '../lib/apiError';
import { obtenerMiFicha, obtenerQr } from '../api/propietarios';
import { misVisitas, CLASE_TIPO, etiquetaTipo, formatearFecha } from '../api/visitas';
import {
  crearPase, misPases, obtenerQrPase, cancelarPase,
  TIPOS_PASE, DURACIONES_PASE, paseVigente, tiempoRestante,
} from '../api/pases';
import './main.css';
import '../styles/layout.css';
import '../styles/table.css';

// Antes esta pantalla mostraba tres arrays inventados de "familiares" y
// "visitantes" con un QR falso (`urbanflow://access/1/Roberto Garza`). El
// producto no tiene registro de familiares: el QR es del residente y lo emite
// el backend firmado, y las visitas las registra el vigilante en la caseta.

function MiCodigo() {
  const toast = useToast();

  const { datos: ficha, cargando: cargandoFicha } = useFetch(obtenerMiFicha, []);
  const cargarQr = useCallback(
    () => (ficha?.id ? obtenerQr(ficha.id) : Promise.resolve(null)),
    [ficha?.id]
  );
  const { datos: qr, cargando: cargandoQr, recargar } = useFetch(cargarQr, [ficha?.id]);

  if (cargandoFicha || cargandoQr) return <Spinner label="Generando tu código…" />;
  if (!qr) return <p className="access-empty">No se pudo obtener tu código</p>;

  return (
    <div className="qr-modal-content">
      <img src={qr.data_url} alt="Mi código QR de acceso" className="qr-imagen" />
      <p className="qr-name">{ficha?.nombre_completo}</p>
      <p className="qr-desc">
        Muestra este código en la caseta para registrar tu entrada. No caduca,
        pero no lo compartas: quien lo tenga puede entrar como tú. Si se te
        pierde, pide a la administración que lo regenere.
      </p>
      <div className="qr-actions">
        <a className="qr-btn qr-btn-dark" href={qr.data_url} download="mi-codigo-urbanflow.png">
          <HiArrowDownTray size={16} /> Descargar
        </a>
        <button
          className="qr-btn qr-btn-cyan"
          onClick={() => { recargar(); toast.info('Código actualizado'); }}
        >
          <HiArrowPath size={16} /> Actualizar
        </button>
      </div>
    </div>
  );
}

const FORM_VACIO_PASE = { nombre_visitante: '', tipo: 'visita', duracion_horas: 24 };

function InvitarVisita() {
  const toast = useToast();
  const { datos: pases, cargando, recargar } = useFetch(misPases, []);
  const activos = (pases ?? []).filter(paseVigente);

  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(FORM_VACIO_PASE);
  const [creando, setCreando] = useState(false);
  const [errorForm, setErrorForm] = useState('');
  const [qrPase, setQrPase] = useState(null);

  const abrir = () => {
    setForm(FORM_VACIO_PASE);
    setErrorForm('');
    setModal(true);
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
    setErrorForm('');
  };

  const handleCrear = async (e) => {
    e.preventDefault();
    setCreando(true);
    setErrorForm('');
    try {
      const pase = await crearPase({
        nombre_visitante: form.nombre_visitante,
        tipo: form.tipo,
        duracion_horas: Number(form.duracion_horas),
      });
      setModal(false);
      setQrPase(pase);
      recargar();
    } catch (err) {
      setErrorForm(mensajeDeError(err));
    } finally {
      setCreando(false);
    }
  };

  const handleVerQr = async (pase) => {
    try {
      const { data_url } = await obtenerQrPase(pase.id);
      setQrPase({ ...pase, data_url });
    } catch (err) {
      toast.error(mensajeDeError(err));
      recargar();
    }
  };

  const handleCancelar = async (pase) => {
    try {
      await cancelarPase(pase.id);
      toast.info('Código cancelado');
      recargar();
    } catch (err) {
      toast.error(mensajeDeError(err));
    }
  };

  return (
    <>
      <div className="page-actions">
        <button className="access-btn-dark" onClick={abrir}>
          <HiPlus size={16} /> Nuevo código de acceso
        </button>
      </div>

      {cargando && <Spinner />}
      {!cargando && activos.length === 0 && (
        <p className="access-empty">No tienes códigos de acceso activos</p>
      )}

      {activos.length > 0 && (
        <div className="historial-lista">
          {activos.map(p => (
            <div key={p.id} className="access-card">
              <div className="access-card-header">
                <span className={`badge ${CLASE_TIPO[p.tipo]}`}>{etiquetaTipo(p.tipo)}</span>
                <span className="access-badge">{tiempoRestante(p.expira_at)}</span>
              </div>
              <div className="access-card-body">
                <div className="access-card-info">
                  <p className="access-card-name">{p.nombre_visitante}</p>
                  <p className="access-card-role">Lote {p.lote_numero}</p>
                </div>
              </div>
              <div className="access-card-actions">
                <button className="access-btn-outline" onClick={() => handleVerQr(p)}>
                  <HiQrCode size={16} /> Ver código
                </button>
                <button className="access-btn-outline" onClick={() => handleCancelar(p)}>
                  <HiXMark size={16} /> Cancelar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal isOpen={modal} onClose={() => setModal(false)} title="Nuevo código de acceso">
        <form className="new-access-form" onSubmit={handleCrear}>
          {errorForm && <p className="form-error">{errorForm}</p>}

          <label className="new-access-field">
            Nombre del visitante
            <input className="new-access-input" name="nombre_visitante"
              value={form.nombre_visitante} onChange={handleChange} required />
          </label>

          <label className="new-access-field">
            Tipo de visita
            <select className="new-access-input" name="tipo" value={form.tipo} onChange={handleChange}>
              {TIPOS_PASE.map(t => (
                <option key={t.valor} value={t.valor}>{t.etiqueta}</option>
              ))}
            </select>
          </label>

          <label className="new-access-field">
            Duración del código
            <select className="new-access-input" name="duracion_horas"
              value={form.duracion_horas} onChange={handleChange}>
              {DURACIONES_PASE.map(d => (
                <option key={d.valor} value={d.valor}>{d.etiqueta}</option>
              ))}
            </select>
          </label>

          <MyButton type="submit" disabled={creando}>
            {creando ? 'Generando…' : 'Generar código'}
          </MyButton>
        </form>
      </Modal>

      <Modal isOpen={!!qrPase} onClose={() => setQrPase(null)} title="Código de acceso">
        {qrPase && (
          <div className="qr-modal-content">
            <img src={qrPase.data_url} alt={`Código QR de ${qrPase.nombre_visitante}`} className="qr-imagen" />
            <p className="qr-name">{qrPase.nombre_visitante}</p>
            <p className="qr-desc">
              Comparte este código con tu visita o muéstralo en la caseta.
              {' '}Vence {tiempoRestante(qrPase.expira_at)} y solo sirve para una entrada.
            </p>
            <div className="qr-actions">
              <a
                className="qr-btn qr-btn-dark"
                href={qrPase.data_url}
                download={`acceso-${qrPase.nombre_visitante}.png`}
              >
                <HiArrowDownTray size={16} /> Descargar
              </a>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}

function HistorialVisitas() {
  const { datos, cargando, error } = useFetch(misVisitas, []);

  if (cargando) return <Spinner />;
  if (error) return <p className="table-error">{error}</p>;
  if (!datos || datos.length === 0) {
    return <p className="access-empty">Aún no hay visitas registradas a tu lote</p>;
  }

  return (
    <div className="historial-lista">
      {datos.map(v => (
        <div key={v.id} className="access-card">
          <div className="access-card-header">
            <span className={`badge ${CLASE_TIPO[v.tipo]}`}>{etiquetaTipo(v.tipo)}</span>
            {!v.salida_at && <span className="access-badge">Dentro</span>}
          </div>
          <div className="access-card-body">
            <div className="access-card-info">
              <p className="access-card-name">{v.nombre_visitante}</p>
              <p className="access-card-role">
                Entrada: {formatearFecha(v.entrada_at)}
                {v.salida_at && ` · Salida: ${formatearFecha(v.salida_at)}`}
              </p>
              <p className="access-card-loc">
                <HiMapPin size={12} /> Lote {v.lote_numero}
                {v.placa_vehiculo && ` · ${v.placa_vehiculo}`}
              </p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function Access() {
  return (
    <div className="dashboard-page">
      <Header />
      <h1 className="section-title">Mi acceso</h1>
      <Tabs tabs={['Mi código QR', 'Invitar visita', 'Historial de visitas']}>
        <MiCodigo />
        <InvitarVisita />
        <HistorialVisitas />
      </Tabs>
    </div>
  );
}

export default Access;
