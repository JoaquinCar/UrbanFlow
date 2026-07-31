import React, { useState, useCallback } from 'react';
import { HiPlus, HiQrCode, HiArrowRightOnRectangle, HiSignal, HiSignalSlash } from 'react-icons/hi2';
import { Header } from '../../Components/Header';
import { Modal } from '../../Components/Modal';
import { Spinner } from '../../Components/Spinner';
import { QrScanner } from '../../Components/QrScanner';
import MyButton from '../../Components/MyButton';
import { useFetch } from '../../hooks/useFetch';
import { useToast } from '../../context/ToastContext';
import { useSocket, useSocketEvent } from '../../context/SocketContext';
import { mensajeDeError } from '../../lib/apiError';
import { listarLotes } from '../../api/lotes';
import {
  listarActivas, registrarEntrada, registrarSalida, entradaPorQr,
  TIPOS_VISITA, CLASE_TIPO, etiquetaTipo, formatearFecha, tiempoDentro,
} from '../../api/visitas';
import '../main.css';
import '../../styles/layout.css';
import '../../styles/table.css';
import '../../styles/caseta.css';

const FORM_VACIO = { lote_destino_id: '', nombre_visitante: '', tipo: 'visita', placa_vehiculo: '', notas: '' };

function Caseta() {
  const toast = useToast();
  const { conectado } = useSocket();

  const { datos: activas, cargando, error, recargar } = useFetch(listarActivas, []);
  const { datos: lotes } = useFetch(() => listarLotes({ limit: 200 }), []);

  const [modalEntrada, setModalEntrada] = useState(false);
  const [modalQr, setModalQr] = useState(false);
  const [form, setForm] = useState(FORM_VACIO);
  const [guardando, setGuardando] = useState(false);
  const [errorForm, setErrorForm] = useState('');
  const [ultimoQr, setUltimoQr] = useState(null);

  // El servidor avisa a la sala caseta-<fraccionamiento> en cada movimiento.
  // Así, si hay dos vigilantes en turno, la lista se mantiene igual en ambos.
  useSocketEvent('nueva-visita', useCallback(() => recargar(), [recargar]));
  useSocketEvent('salida-visita', useCallback(() => recargar(), [recargar]));
  useSocketEvent('qr-entrada', useCallback(() => recargar(), [recargar]));

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
    setErrorForm('');
  };

  const abrirEntrada = () => {
    setForm(FORM_VACIO);
    setErrorForm('');
    setModalEntrada(true);
  };

  const handleRegistrar = async (e) => {
    e.preventDefault();
    setGuardando(true);
    setErrorForm('');
    try {
      const visita = await registrarEntrada({
        ...form,
        placa_vehiculo: form.placa_vehiculo || null,
        notas: form.notas || null,
      });
      toast.exito(`Entrada registrada: ${visita.nombre_visitante} → ${visita.lote_numero}`);
      setModalEntrada(false);
      recargar();
    } catch (err) {
      setErrorForm(mensajeDeError(err));
    } finally {
      setGuardando(false);
    }
  };

  const handleSalida = async (visita) => {
    try {
      await registrarSalida(visita.id);
      toast.exito(`Salida registrada: ${visita.nombre_visitante}`);
      recargar();
    } catch (err) {
      toast.error(mensajeDeError(err));
    }
  };

  const handleLeerQr = useCallback(async (token) => {
    try {
      const resultado = await entradaPorQr(token);
      setUltimoQr({ ok: true, ...resultado });
      toast.exito(`Acceso autorizado: ${resultado.residente.nombre}`);
      recargar();
    } catch (err) {
      const mensaje = mensajeDeError(err);
      setUltimoQr({ ok: false, mensaje });
      toast.error(mensaje);
    }
  }, [toast, recargar]);

  const cerrarQr = () => {
    setModalQr(false);
    setUltimoQr(null);
  };

  return (
    <div className="dashboard-page">
      <Header />

      <div className="page-head">
        <h1 className="section-title">Caseta</h1>
        <span className={`caseta-estado ${conectado ? 'caseta-estado--vivo' : ''}`}>
          {conectado ? <HiSignal size={14} /> : <HiSignalSlash size={14} />}
          {conectado ? 'En vivo' : 'Sin conexión en vivo'}
        </span>
      </div>

      <div className="page-actions">
        <button className="access-btn-dark caseta-accion" onClick={() => setModalQr(true)}>
          <HiQrCode size={18} /> Escanear QR
        </button>
        <button className="access-btn-outline caseta-accion" onClick={abrirEntrada}>
          <HiPlus size={18} /> Registrar entrada
        </button>
      </div>

      <div className="page-body">
        <h2 className="caseta-subtitulo">
          Dentro ahora {activas && <span className="page-contador">{activas.length}</span>}
        </h2>

        {cargando && <Spinner />}
        {error && <p className="table-error">{error}</p>}
        {activas && activas.length === 0 && (
          <p className="access-empty">No hay visitas dentro del fraccionamiento</p>
        )}

        {activas && activas.length > 0 && (
          <ul className="caseta-lista">
            {activas.map(v => (
              <li key={v.id} className="caseta-item">
                <div className="caseta-item-info">
                  <span className="caseta-item-nombre">{v.nombre_visitante}</span>
                  <span className="caseta-item-meta">
                    <span className={`badge ${CLASE_TIPO[v.tipo]}`}>{etiquetaTipo(v.tipo)}</span>
                    Lote {v.lote_numero}
                    {v.placa_vehiculo && ` · ${v.placa_vehiculo}`}
                  </span>
                  <span className="caseta-item-tiempo">
                    Entró {tiempoDentro(v.entrada_at)} · {formatearFecha(v.entrada_at)}
                  </span>
                </div>
                <button className="caseta-salida" onClick={() => handleSalida(v)}>
                  <HiArrowRightOnRectangle size={16} /> Salida
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Registro manual */}
      <Modal isOpen={modalEntrada} onClose={() => setModalEntrada(false)} title="Registrar entrada">
        <form className="new-access-form" onSubmit={handleRegistrar}>
          {errorForm && <p className="form-error">{errorForm}</p>}

          <label className="new-access-field">
            Lote destino
            <select className="new-access-input" name="lote_destino_id"
              value={form.lote_destino_id} onChange={handleChange} required>
              <option value="">Selecciona un lote</option>
              {(lotes?.items ?? []).map(l => (
                <option key={l.id} value={l.id}>
                  {l.numero}{l.propietario_nombre ? ` — ${l.propietario_nombre}` : ''}
                </option>
              ))}
            </select>
          </label>

          <label className="new-access-field">
            Nombre del visitante
            <input className="new-access-input" name="nombre_visitante"
              value={form.nombre_visitante} onChange={handleChange} required />
          </label>

          <label className="new-access-field">
            Tipo
            <select className="new-access-input" name="tipo" value={form.tipo} onChange={handleChange}>
              {TIPOS_VISITA.filter(t => t.valor !== 'residente').map(t => (
                <option key={t.valor} value={t.valor}>{t.etiqueta}</option>
              ))}
            </select>
            <span className="campo-ayuda">
              "Residente" se asigna solo al escanear un código QR.
            </span>
          </label>

          <label className="new-access-field">
            Placa del vehículo
            <input className="new-access-input" name="placa_vehiculo"
              value={form.placa_vehiculo} onChange={handleChange} placeholder="Opcional, si viene a pie" />
          </label>

          <label className="new-access-field">
            Notas
            <input className="new-access-input" name="notas" value={form.notas} onChange={handleChange} />
          </label>

          <MyButton type="submit" disabled={guardando}>
            {guardando ? 'Registrando…' : 'Registrar entrada'}
          </MyButton>
        </form>
      </Modal>

      {/* Escáner */}
      <Modal isOpen={modalQr} onClose={cerrarQr} title="Escanear código QR">
        {!ultimoQr && <QrScanner onLeer={handleLeerQr} activo={modalQr} />}

        {ultimoQr?.ok && (
          <div className="qr-resultado qr-resultado--ok">
            <p className="qr-resultado-titulo">Acceso autorizado</p>
            <p className="qr-resultado-nombre">{ultimoQr.residente.nombre}</p>
            <p className="qr-resultado-lote">Lote {ultimoQr.residente.lote.numero}</p>
            <MyButton onClick={() => setUltimoQr(null)}>Escanear otro</MyButton>
          </div>
        )}

        {ultimoQr && !ultimoQr.ok && (
          <div className="qr-resultado qr-resultado--error">
            <p className="qr-resultado-titulo">Acceso denegado</p>
            <p className="qr-resultado-nombre">{ultimoQr.mensaje}</p>
            <MyButton onClick={() => setUltimoQr(null)}>Intentar de nuevo</MyButton>
          </div>
        )}
      </Modal>
    </div>
  );
}

export default Caseta;
