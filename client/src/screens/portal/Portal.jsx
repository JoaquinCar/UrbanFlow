import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  HiUser, HiMapPin, HiBanknotes, HiQrCode, HiWrenchScrewdriver,
  HiCalendarDays, HiArrowRight, HiMegaphone,
} from 'react-icons/hi2';
import { Header } from '../../Components/Header';
import { Spinner } from '../../Components/Spinner';
import { useAuth } from '../../context/AuthContext';
import { useFetch } from '../../hooks/useFetch';
import { obtenerMiFicha } from '../../api/propietarios';
import { misCuotas, moneda } from '../../api/pagos';
import { misVisitas, etiquetaTipo, formatearFecha } from '../../api/visitas';
import { misTickets, ETIQUETA_ESTADO_TICKET, CLASE_ESTADO_TICKET } from '../../api/mantenimiento';
import { misReservaciones, hhmm, fechaLegible, soloFecha, hoyIso } from '../../api/reservaciones';
import { misComunicados, fechaRelativa } from '../../api/comunicados';
import '../main.css';
import '../../styles/layout.css';
import '../../styles/table.css';
import '../../styles/pagos.css';
import '../../styles/portal.css';

// Portal del propietario: integra los módulos anteriores en una sola vista.
// No añade endpoints propios; consume los que ya existen.
//
// Cada bloque falla por separado: si el módulo de reservas diera error, el
// resto del portal sigue mostrándose. Por eso son seis useFetch y no una
// petición agregada.
function Portal() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const { datos: ficha, cargando: cargandoFicha } = useFetch(obtenerMiFicha, []);
  const { datos: cuentas } = useFetch(misCuotas, []);
  const { datos: visitas } = useFetch(misVisitas, []);
  const { datos: tickets } = useFetch(() => misTickets(), []);
  const { datos: reservas } = useFetch(misReservaciones, []);
  const { datos: avisos } = useFetch(misComunicados, []);

  const adeudo = cuentas?.totales?.adeudo ?? 0;
  const vencido = cuentas?.totales?.vencido ?? 0;
  const ticketsAbiertos = (tickets ?? []).filter(t => t.estado !== 'resuelto');
  const hoy = hoyIso();
  // El endpoint devuelve las reservaciones más recientes primero, que es lo
  // correcto para un historial. Aquí interesa lo contrario: la más próxima
  // arriba.
  const proximas = (reservas ?? [])
    .filter(r => r.estado !== 'cancelada' && soloFecha(r.fecha) >= hoy)
    .sort((a, b) => soloFecha(a.fecha).localeCompare(soloFecha(b.fecha)))
    .slice(0, 2);
  const ultimasVisitas = (visitas ?? []).slice(0, 4);
  const ultimoAviso = avisos?.[0];

  return (
    <div className="dashboard-page">
      <Header />

      <main className="dashboard-content">
        {/* Identidad y lote */}
        <div className="user-card">
          <div className="user-card-photo">
            <HiUser size={44} className="user-card-avatar" />
          </div>
          <div className="user-card-info">
            <h2>{ficha?.nombre_completo ?? user?.nombre ?? 'Propietario'}</h2>
            <p className="user-role">Propietario</p>
            <p className="user-location">
              <HiMapPin size={13} />
              {cargandoFicha
                ? 'Cargando…'
                : ficha?.lotes?.length
                  ? `Lote ${ficha.lotes.map(l => l.numero).join(', ')}`
                  : 'Sin lote asignado'}
            </p>
          </div>
        </div>

        {/* Saldo real */}
        <div className="payments-card">
          <div className="payments-icon">
            <HiBanknotes size={36} />
          </div>
          <div className="payments-info">
            <p className="payments-label">
              {adeudo > 0 ? 'Saldo pendiente' : 'Estás al corriente'}
            </p>
            <p className="payments-amount">{moneda(adeudo)}</p>
            {vencido > 0 && (
              <p className="payments-vencido">{moneda(vencido)} vencido</p>
            )}
          </div>
          <button className="pagar-btn" onClick={() => navigate('/payments')}>
            {adeudo > 0 ? 'Pagar' : 'Ver'}
          </button>
        </div>

        {/* Accesos rápidos */}
        <section className="portal-seccion-ancha">
          <h3 className="section-title">Accesos rápidos</h3>
          <div className="quick-actions-grid">
            <button className="action-card" onClick={() => navigate('/access')}>
              <div className="action-icon"><HiQrCode size={26} color="#ffffff" /></div>
              <p className="action-title">Mi código QR</p>
              <p className="action-subtitle">Entrada al fraccionamiento</p>
            </button>
            <button className="action-card" onClick={() => navigate('/reservas')}>
              <div className="action-icon"><HiCalendarDays size={26} color="#ffffff" /></div>
              <p className="action-title">Reservar</p>
              <p className="action-subtitle">Áreas comunes</p>
            </button>
            <button className="action-card" onClick={() => navigate('/mantenimiento')}>
              <div className="action-icon"><HiWrenchScrewdriver size={26} color="#ffffff" /></div>
              <p className="action-title">Reportar</p>
              <p className="action-subtitle">
                {ticketsAbiertos.length > 0
                  ? `${ticketsAbiertos.length} abierto(s)`
                  : 'Una incidencia'}
              </p>
            </button>
            <button className="action-card" onClick={() => navigate('/payments')}>
              <div className="action-icon"><HiBanknotes size={26} color="#ffffff" /></div>
              <p className="action-title">Mis cuotas</p>
              <p className="action-subtitle">Estado de cuenta</p>
            </button>
          </div>
        </section>

        {/* Próximas reservas */}
        {proximas.length > 0 && (
          <section>
            <h3 className="section-title">Próximas reservas</h3>
            <ul className="portal-lista">
              {proximas.map(r => (
                <li key={r.id} className="portal-fila">
                  <div>
                    <span className="portal-fila-titulo">{r.area_nombre}</span>
                    <span className="portal-fila-sub">
                      {fechaLegible(r.fecha)} · {hhmm(r.hora_inicio)}–{hhmm(r.hora_fin)}
                    </span>
                  </div>
                  <span className={`badge ${r.estado === 'confirmada' ? 'badge--verde' : 'badge--ambar'}`}>
                    {r.estado === 'confirmada' ? 'Confirmada' : 'Pendiente'}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Tickets abiertos */}
        {ticketsAbiertos.length > 0 && (
          <section>
            <h3 className="section-title">Mis reportes abiertos</h3>
            <ul className="portal-lista">
              {ticketsAbiertos.slice(0, 3).map(t => (
                <li key={t.id} className="portal-fila">
                  <div>
                    <span className="portal-fila-titulo">{t.descripcion}</span>
                    <span className="portal-fila-sub">
                      {t.tecnico_nombre ? `Técnico: ${t.tecnico_nombre}` : 'Sin asignar'}
                    </span>
                  </div>
                  <span className={`badge ${CLASE_ESTADO_TICKET[t.estado]}`}>
                    {ETIQUETA_ESTADO_TICKET[t.estado]}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Visitas recientes */}
        <section>
          <h3 className="section-title">Visitas recientes</h3>
          {!visitas && <Spinner />}
          {visitas && ultimasVisitas.length === 0 && (
            <p className="access-empty">Aún no hay visitas registradas a tu lote</p>
          )}
          <ul className="portal-lista">
            {ultimasVisitas.map(v => (
              <li key={v.id} className="portal-fila">
                <div>
                  <span className="portal-fila-titulo">{v.nombre_visitante}</span>
                  <span className="portal-fila-sub">
                    {etiquetaTipo(v.tipo)} · {formatearFecha(v.entrada_at)}
                  </span>
                </div>
                {!v.salida_at && <span className="badge badge--verde">Dentro</span>}
              </li>
            ))}
          </ul>
        </section>

        {/* Último aviso */}
        {ultimoAviso && (
          <section>
            <h3 className="section-title">Último aviso</h3>
            <button className="portal-aviso" onClick={() => navigate('/notifications')}>
              <HiMegaphone size={20} />
              <div>
                <span className="portal-fila-titulo">{ultimoAviso.titulo}</span>
                <span className="portal-fila-sub">{fechaRelativa(ultimoAviso.enviado_at)}</span>
              </div>
              <HiArrowRight size={18} />
            </button>
          </section>
        )}
      </main>
    </div>
  );
}

export default Portal;
