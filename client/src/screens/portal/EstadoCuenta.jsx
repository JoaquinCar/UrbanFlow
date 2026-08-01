import React, { useState } from 'react';
import { HiArrowDownTray, HiCreditCard } from 'react-icons/hi2';
import { Header } from '../../Components/Header';
import { Spinner } from '../../Components/Spinner';
import { useFetch } from '../../hooks/useFetch';
import { useToast } from '../../context/ToastContext';
import { mensajeDeError } from '../../lib/apiError';
import {
  misCuotas, crearCheckout, descargarRecibo,
  CLASE_ESTADO_CUOTA, ETIQUETA_ESTADO_CUOTA, moneda, periodo, fechaCorta, conceptoCuota,
} from '../../api/pagos';
import '../main.css';
import '../../styles/layout.css';
import '../../styles/table.css';
import '../../styles/pagos.css';

function EstadoCuenta() {
  const toast = useToast();
  const { datos, cargando, error } = useFetch(misCuotas, []);
  const [pagando, setPagando] = useState(null);

  const handlePagar = async (cuota) => {
    setPagando(cuota.id);
    try {
      const pref = await crearCheckout(cuota.id);
      // En sandbox MercadoPago devuelve una URL distinta a la de producción.
      const destino = pref.sandbox_init_point || pref.init_point;
      if (!destino) throw new Error('MercadoPago no devolvió una URL de pago');
      window.location.href = destino;
    } catch (err) {
      toast.error(mensajeDeError(err));
    } finally {
      setPagando(null);
    }
  };

  const handleRecibo = async (cuota) => {
    try {
      await descargarRecibo(cuota.pago_id);
    } catch (err) {
      toast.error(mensajeDeError(err));
    }
  };

  if (cargando) {
    return (
      <div className="dashboard-page">
        <Header />
        <Spinner label="Cargando tu estado de cuenta…" />
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

  const { totales, cuotas } = datos;
  const pendientes = cuotas.filter(c => c.estado_actual !== 'pagado');
  const historial = cuotas.filter(c => c.estado_actual === 'pagado');

  return (
    <div className="dashboard-page">
      <Header />

      <h1 className="section-title">Mi estado de cuenta</h1>

      <div className="page-body">
        <div className={`saldo-card ${totales.adeudo > 0 ? 'saldo-card--deuda' : 'saldo-card--al-dia'}`}>
          <span className="saldo-etiqueta">
            {totales.adeudo > 0 ? 'Saldo pendiente' : 'Estás al corriente'}
          </span>
          <span className="saldo-monto">{moneda(totales.adeudo)}</span>
          {totales.vencido > 0 && (
            <span className="saldo-vencido">{moneda(totales.vencido)} vencido</span>
          )}
        </div>

        <h2 className="caseta-subtitulo">
          Por pagar {pendientes.length > 0 && <span className="page-contador">{pendientes.length}</span>}
        </h2>

        {pendientes.length === 0 && (
          <p className="access-empty">No tienes cuotas pendientes</p>
        )}

        <ul className="cuota-lista">
          {pendientes.map(c => (
            <li key={c.id} className="cuota-item">
              <div className="cuota-info">
                <span className="cuota-concepto">{conceptoCuota(c)}</span>
                <span className="cuota-periodo">{periodo(c.mes_anio)}</span>
                <span className={`badge ${CLASE_ESTADO_CUOTA[c.estado_actual]}`}>
                  {ETIQUETA_ESTADO_CUOTA[c.estado_actual]}
                </span>
              </div>
              <div className="cuota-derecha">
                <span className="cuota-monto">{moneda(c.monto)}</span>
                <button
                  className="cuota-pagar"
                  onClick={() => handlePagar(c)}
                  disabled={pagando === c.id}
                >
                  <HiCreditCard size={15} />
                  {pagando === c.id ? 'Abriendo…' : 'Pagar'}
                </button>
              </div>
            </li>
          ))}
        </ul>

        <h2 className="caseta-subtitulo">Historial</h2>

        {historial.length === 0 && <p className="access-empty">Aún no hay pagos registrados</p>}

        <ul className="cuota-lista">
          {historial.map(c => (
            <li key={c.id} className="cuota-item cuota-item--pagada">
              <div className="cuota-info">
                <span className="cuota-concepto">{conceptoCuota(c)}</span>
                <span className="cuota-periodo">
                  {periodo(c.mes_anio)}
                  {c.fecha_pago && ` · pagado el ${fechaCorta(c.fecha_pago)}`}
                  {c.metodo && ` · ${c.metodo}`}
                </span>
              </div>
              <div className="cuota-derecha">
                <span className="cuota-monto">{moneda(c.monto)}</span>
                {c.pago_id && (
                  <button className="cuota-recibo" onClick={() => handleRecibo(c)}>
                    <HiArrowDownTray size={15} /> Recibo
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export default EstadoCuenta;
