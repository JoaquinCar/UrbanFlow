import React, { useState, useCallback } from 'react';
import { HiArrowDownTray } from 'react-icons/hi2';
import { Header } from '../../Components/Header';
import { Spinner } from '../../Components/Spinner';
import { useFetch } from '../../hooks/useFetch';
import { useToast } from '../../context/ToastContext';
import { mensajeDeError } from '../../lib/apiError';
import {
  obtenerBitacora, descargarBitacoraCsv,
  TIPOS_VISITA, CLASE_TIPO, etiquetaTipo, formatearFecha,
} from '../../api/visitas';
import '../main.css';
import '../../styles/layout.css';
import '../../styles/table.css';
import '../../styles/caseta.css';

function Bitacora() {
  const toast = useToast();
  const [filtros, setFiltros] = useState({ desde: '', hasta: '', tipo: '', q: '' });
  const [exportando, setExportando] = useState(false);

  // Sin fecha "desde", el backend devuelve los últimos 30 días.
  const cargar = useCallback(() => obtenerBitacora({ ...filtros, limit: 300 }), [filtros]);
  const { datos, cargando, error } = useFetch(cargar, [filtros]);

  const set = (campo) => (e) => setFiltros(f => ({ ...f, [campo]: e.target.value }));

  const handleExportar = async () => {
    setExportando(true);
    try {
      await descargarBitacoraCsv(filtros);
      toast.exito('Bitácora exportada');
    } catch (err) {
      toast.error(mensajeDeError(err));
    } finally {
      setExportando(false);
    }
  };

  return (
    <div className="dashboard-page">
      <Header />

      <div className="page-head">
        <h1 className="section-title">Bitácora de accesos</h1>
        {datos && <span className="page-contador">{datos.total} registros</span>}
      </div>

      <div className="page-actions">
        <input className="page-search" placeholder="Visitante, placa o lote"
          value={filtros.q} onChange={set('q')} />
        <select className="page-select" value={filtros.tipo} onChange={set('tipo')}>
          <option value="">Todos los tipos</option>
          {TIPOS_VISITA.map(t => <option key={t.valor} value={t.valor}>{t.etiqueta}</option>)}
        </select>
        <label className="page-fecha">
          Desde
          <input className="page-select" type="date" value={filtros.desde} onChange={set('desde')} />
        </label>
        <label className="page-fecha">
          Hasta
          <input className="page-select" type="date" value={filtros.hasta} onChange={set('hasta')} />
        </label>
        <button className="access-btn-dark" onClick={handleExportar} disabled={exportando}>
          <HiArrowDownTray size={16} /> {exportando ? 'Exportando…' : 'Exportar CSV'}
        </button>
      </div>

      <p className="campo-ayuda bitacora-nota">
        Sin filtro de fecha se muestran los últimos 30 días.
      </p>

      <div className="page-body">
        {cargando && <Spinner />}
        {error && <p className="table-error">{error}</p>}
        {datos && datos.items.length === 0 && (
          <p className="access-empty">No hay accesos que coincidan con el filtro</p>
        )}

        {datos && datos.items.length > 0 && (
          <ul className="caseta-lista">
            {datos.items.map(v => (
              <li key={v.id} className="caseta-item">
                <div className="caseta-item-info">
                  <span className="caseta-item-nombre">{v.nombre_visitante}</span>
                  <span className="caseta-item-meta">
                    <span className={`badge ${CLASE_TIPO[v.tipo]}`}>{etiquetaTipo(v.tipo)}</span>
                    Lote {v.lote_numero}
                    {v.placa_vehiculo && ` · ${v.placa_vehiculo}`}
                  </span>
                  <span className="caseta-item-tiempo">
                    Entró {formatearFecha(v.entrada_at)}
                    {v.salida_at && ` · Salió ${formatearFecha(v.salida_at)}`}
                  </span>
                </div>
                {v.salida_at
                  ? <span className="caseta-item-tiempo">Registró {v.registrado_por_nombre}</span>
                  : <span className="badge badge--verde">Dentro</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export default Bitacora;
