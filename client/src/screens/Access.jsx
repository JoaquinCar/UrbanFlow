import React, { useCallback } from 'react';
import { HiArrowDownTray, HiArrowPath, HiMapPin } from 'react-icons/hi2';
import { Header } from '../Components/Header';
import { Tabs } from '../Components/Tabs';
import { Spinner } from '../Components/Spinner';
import { useFetch } from '../hooks/useFetch';
import { useToast } from '../context/ToastContext';
import { mensajeDeError } from '../lib/apiError';
import { obtenerMiFicha, obtenerQr } from '../api/propietarios';
import { misVisitas, CLASE_TIPO, etiquetaTipo, formatearFecha } from '../api/visitas';
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
      <Tabs tabs={['Mi código QR', 'Historial de visitas']}>
        <MiCodigo />
        <HistorialVisitas />
      </Tabs>
    </div>
  );
}

export default Access;
