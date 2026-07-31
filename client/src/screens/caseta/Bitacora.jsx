import React, { useState, useCallback } from 'react';
import { HiArrowDownTray } from 'react-icons/hi2';
import { Header } from '../../Components/Header';
import { DataTable } from '../../Components/DataTable';
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

  const columnas = [
    { key: 'entrada_at', label: 'Entrada', render: v => formatearFecha(v.entrada_at) },
    {
      key: 'salida_at',
      label: 'Salida',
      render: v => (v.salida_at
        ? formatearFecha(v.salida_at)
        : <span className="badge badge--verde">Dentro</span>),
    },
    { key: 'nombre_visitante', label: 'Visitante' },
    {
      key: 'tipo',
      label: 'Tipo',
      render: v => <span className={`badge ${CLASE_TIPO[v.tipo]}`}>{etiquetaTipo(v.tipo)}</span>,
    },
    { key: 'placa_vehiculo', label: 'Placa', render: v => v.placa_vehiculo || '—' },
    { key: 'lote_numero', label: 'Lote' },
    { key: 'registrado_por_nombre', label: 'Registró' },
  ];

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
        <DataTable
          columnas={columnas}
          filas={datos?.items}
          cargando={cargando}
          error={error}
          vacio="No hay accesos que coincidan con el filtro"
        />
      </div>
    </div>
  );
}

export default Bitacora;
