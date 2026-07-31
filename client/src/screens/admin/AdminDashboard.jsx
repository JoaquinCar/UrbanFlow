import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  HiSquares2X2, HiUsers, HiBanknotes, HiExclamationTriangle,
  HiQrCode, HiWrenchScrewdriver, HiCalendarDays, HiArrowRight,
} from 'react-icons/hi2';
import { Header } from '../../Components/Header';
import { Spinner } from '../../Components/Spinner';
import { useAuth } from '../../context/AuthContext';
import { useFetch } from '../../hooks/useFetch';
import { obtenerDashboard } from '../../api/dashboard';
import { moneda } from '../../api/pagos';
import { etiquetaTipo, formatearFecha } from '../../api/visitas';
import { ETIQUETA_ESTADO_TICKET, CLASE_ESTADO_TICKET } from '../../api/mantenimiento';
import '../main.css';
import '../../styles/layout.css';
import '../../styles/table.css';
import '../../styles/portal.css';
import '../../styles/dashboard.css';

function Metrica({ icono: Icono, etiqueta, valor, detalle, tono = 'azul', onClick }) {
  const Elemento = onClick ? 'button' : 'div';
  return (
    <Elemento className={`metrica metrica--${tono}`} onClick={onClick}>
      <span className="metrica-icono"><Icono size={20} /></span>
      <span className="metrica-valor">{valor}</span>
      <span className="metrica-etiqueta">{etiqueta}</span>
      {detalle && <span className="metrica-detalle">{detalle}</span>}
    </Elemento>
  );
}

function AdminDashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { datos, cargando, error } = useFetch(obtenerDashboard, []);

  if (cargando) {
    return (
      <div className="dashboard-page">
        <Header />
        <Spinner label="Calculando métricas…" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="dashboard-page">
        <Header />
        <p className="table-error">{error}</p>
      </div>
    );
  }

  const { lotes, propietarios, cuotas, visitas, tickets, reservaciones, actividad } = datos;

  return (
    <div className="dashboard-page">
      <Header />

      <div className="page-head">
        <h1 className="section-title">Panel de administración</h1>
        <span className="page-contador">Hola, {user?.nombre}</span>
      </div>

      <div className="page-body">
        <div className="metricas-grid">
          <Metrica
            icono={HiSquares2X2} etiqueta="Lotes" valor={lotes.total}
            detalle={`${lotes.vendido} vendidos · ${lotes.disponible} disponibles`}
            onClick={() => navigate('/lotes')}
          />
          <Metrica
            icono={HiUsers} etiqueta="Propietarios" valor={propietarios.total}
            onClick={() => navigate('/owners')}
          />
          <Metrica
            icono={HiBanknotes} etiqueta="Cobrado este mes" valor={moneda(cuotas.cobrado_mes)}
            tono="verde"
            onClick={() => navigate('/cuotas')}
          />
          <Metrica
            icono={HiExclamationTriangle} etiqueta="Por cobrar"
            valor={moneda(cuotas.monto_adeudado)}
            detalle={`${cuotas.vencidas} vencidas · ${cuotas.morosos} morosos`}
            tono={cuotas.morosos > 0 ? 'rojo' : 'azul'}
            onClick={() => navigate('/cuotas')}
          />
          <Metrica
            icono={HiQrCode} etiqueta="Visitas hoy" valor={visitas.hoy}
            detalle={`${visitas.dentro} dentro ahora`}
            onClick={() => navigate('/bitacora')}
          />
          <Metrica
            icono={HiWrenchScrewdriver} etiqueta="Tickets abiertos" valor={tickets.abiertos}
            detalle={`${tickets.en_proceso} en proceso`}
            tono={tickets.abiertos > 0 ? 'ambar' : 'azul'}
            onClick={() => navigate('/mantenimiento')}
          />
          <Metrica
            icono={HiCalendarDays} etiqueta="Reservas próximas" valor={reservaciones.proximas}
            detalle={`${reservaciones.por_confirmar} por confirmar`}
            onClick={() => navigate('/areas')}
          />
        </div>

        {/* Distribución de lotes: proporción visible sin librería de gráficas */}
        <section className="panel-seccion">
          <h2 className="caseta-subtitulo">Ocupación del fraccionamiento</h2>
          <div className="barra-estados" role="img"
            aria-label={`${lotes.vendido} vendidos, ${lotes.proceso} en proceso, ${lotes.disponible} disponibles de ${lotes.total}`}>
            {lotes.total > 0 && (
              <>
                <span className="barra-segmento barra--vendido"
                  style={{ width: `${(lotes.vendido / lotes.total) * 100}%` }} />
                <span className="barra-segmento barra--proceso"
                  style={{ width: `${(lotes.proceso / lotes.total) * 100}%` }} />
                <span className="barra-segmento barra--disponible"
                  style={{ width: `${(lotes.disponible / lotes.total) * 100}%` }} />
              </>
            )}
          </div>
          <div className="mapa-leyenda">
            <span className="mapa-leyenda-item">
              <span className="mapa-leyenda-color mapa-leyenda-color--vendido" />
              Vendidos <span className="mapa-leyenda-conteo">({lotes.vendido})</span>
            </span>
            <span className="mapa-leyenda-item">
              <span className="mapa-leyenda-color mapa-leyenda-color--proceso" />
              En proceso <span className="mapa-leyenda-conteo">({lotes.proceso})</span>
            </span>
            <span className="mapa-leyenda-item">
              <span className="mapa-leyenda-color mapa-leyenda-color--disponible" />
              Disponibles <span className="mapa-leyenda-conteo">({lotes.disponible})</span>
            </span>
          </div>
        </section>

        <div className="panel-columnas">
          {/* Morosos */}
          <section className="panel-seccion">
            <h2 className="caseta-subtitulo">
              Mayores adeudos
              <button className="panel-enlace" onClick={() => navigate('/cuotas')}>
                Ver todos <HiArrowRight size={14} />
              </button>
            </h2>
            {actividad.morosos.length === 0 && (
              <p className="access-empty">Nadie tiene cuotas vencidas</p>
            )}
            <ul className="portal-lista panel-lista">
              {actividad.morosos.map(m => (
                <li key={m.id} className="portal-fila">
                  <div>
                    <span className="portal-fila-titulo">{m.nombre_completo}</span>
                    <span className="portal-fila-sub">{m.cuotas} cuota(s) vencida(s)</span>
                  </div>
                  <strong className="texto-peligro">{moneda(m.monto_adeudado)}</strong>
                </li>
              ))}
            </ul>
          </section>

          {/* Tickets */}
          <section className="panel-seccion">
            <h2 className="caseta-subtitulo">
              Mantenimiento pendiente
              <button className="panel-enlace" onClick={() => navigate('/mantenimiento')}>
                Ver todos <HiArrowRight size={14} />
              </button>
            </h2>
            {actividad.tickets.length === 0 && (
              <p className="access-empty">No hay tickets pendientes</p>
            )}
            <ul className="portal-lista panel-lista">
              {actividad.tickets.map(t => (
                <li key={t.id} className="portal-fila">
                  <div>
                    <span className="portal-fila-titulo">{t.descripcion}</span>
                    <span className="portal-fila-sub">Reportó {t.solicitante_nombre}</span>
                  </div>
                  <span className={`badge ${CLASE_ESTADO_TICKET[t.estado]}`}>
                    {ETIQUETA_ESTADO_TICKET[t.estado]}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          {/* Últimos accesos */}
          <section className="panel-seccion">
            <h2 className="caseta-subtitulo">
              Últimos accesos
              <button className="panel-enlace" onClick={() => navigate('/bitacora')}>
                Ver bitácora <HiArrowRight size={14} />
              </button>
            </h2>
            <ul className="portal-lista panel-lista">
              {actividad.visitas.map(v => (
                <li key={v.id} className="portal-fila">
                  <div>
                    <span className="portal-fila-titulo">{v.nombre_visitante}</span>
                    <span className="portal-fila-sub">
                      {etiquetaTipo(v.tipo)} · Lote {v.lote_numero} · {formatearFecha(v.entrada_at)}
                    </span>
                  </div>
                  {!v.salida_at && <span className="badge badge--verde">Dentro</span>}
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}

export default AdminDashboard;
