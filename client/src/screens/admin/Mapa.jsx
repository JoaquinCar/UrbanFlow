import React, { useState, useCallback } from 'react';
import { Header } from '../../Components/Header';
import { Modal } from '../../Components/Modal';
import { Spinner } from '../../Components/Spinner';
import { MapaLotes } from '../../Components/MapaLotes';
import { useFetch } from '../../hooks/useFetch';
import {
  obtenerMapa, obtenerLote,
  ETIQUETA_ESTADO, CLASE_ESTADO, formatearMoneda,
} from '../../api/lotes';
import '../main.css';
import '../../styles/layout.css';
import '../../styles/table.css';
import '../../styles/mapa.css';

const ESTADOS = ['disponible', 'proceso', 'vendido'];

function Fila({ etiqueta, children }) {
  return (
    <div className="mapa-detalle-fila">
      <span className="mapa-detalle-etiqueta">{etiqueta}</span>
      <span className="mapa-detalle-valor">{children ?? '—'}</span>
    </div>
  );
}

function Mapa() {
  const { datos, cargando, error } = useFetch(obtenerMapa, []);

  const [seleccionado, setSeleccionado] = useState(null);
  const [detalle, setDetalle] = useState(null);
  const [cargandoDetalle, setCargandoDetalle] = useState(false);

  // El mapa solo trae lo necesario para pintar; el detalle completo (precio,
  // superficie, contacto del propietario) se pide al abrir el modal.
  const handleSeleccionar = useCallback(async (lote) => {
    setSeleccionado(lote);
    setDetalle(null);
    setCargandoDetalle(true);
    try {
      setDetalle(await obtenerLote(lote.id));
    } finally {
      setCargandoDetalle(false);
    }
  }, []);

  const cerrar = () => {
    setSeleccionado(null);
    setDetalle(null);
  };

  return (
    <div className="dashboard-page">
      <Header />

      <div className="page-head">
        <h1 className="section-title">Mapa de lotes</h1>
        {datos && <span className="page-contador">{datos.total} lotes</span>}
      </div>

      {datos && (
        <div className="mapa-leyenda">
          {ESTADOS.map(estado => (
            <span className="mapa-leyenda-item" key={estado}>
              <span className={`mapa-leyenda-color mapa-leyenda-color--${estado}`} />
              {ETIQUETA_ESTADO[estado]}
              <span className="mapa-leyenda-conteo">({datos.resumen[estado] ?? 0})</span>
            </span>
          ))}
        </div>
      )}

      {cargando && <Spinner label="Cargando lotes…" />}
      {error && <p className="table-error">{error}</p>}

      {datos && (
        <MapaLotes
          lotes={datos.lotes}
          seleccionadoId={seleccionado?.id}
          onSeleccionar={handleSeleccionar}
        />
      )}

      <Modal
        isOpen={!!seleccionado}
        onClose={cerrar}
        title={seleccionado ? `Lote ${seleccionado.numero}` : ''}
      >
        {cargandoDetalle && <Spinner label="Cargando detalle…" />}

        {detalle && (
          <div>
            <Fila etiqueta="Estado">
              <span className={`badge ${CLASE_ESTADO[detalle.estado]}`}>
                {ETIQUETA_ESTADO[detalle.estado]}
              </span>
            </Fila>
            <Fila etiqueta="Etapa">{detalle.etapa}</Fila>
            <Fila etiqueta="Superficie">
              {detalle.superficie_m2 ? `${detalle.superficie_m2} m²` : null}
            </Fila>
            <Fila etiqueta="Precio">{formatearMoneda(detalle.precio)}</Fila>
            <Fila etiqueta="Propietario">{detalle.propietario?.nombre_completo}</Fila>
            <Fila etiqueta="Teléfono">{detalle.propietario?.telefono}</Fila>
            <Fila etiqueta="WhatsApp">{detalle.propietario?.whatsapp}</Fila>
          </div>
        )}
      </Modal>
    </div>
  );
}

export default Mapa;
