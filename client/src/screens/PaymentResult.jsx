import React from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { HiCheckCircle, HiXCircle, HiClock } from 'react-icons/hi2';
import { Header } from '../Components/Header';
import MyButton from '../Components/MyButton';
import './main.css';
import '../styles/pagos.css';

// Pantalla de retorno de Stripe (vía Vexor). Corresponde a
// STRIPE_BACK_URL_SUCCESS, _FAILURE y _PENDING.
//
// Esta pantalla NO confirma nada. El pago se da por bueno cuando
// llega el webhook firmado, no cuando el navegador vuelve — la URL de retorno
// la puede abrir cualquiera escribiéndola a mano. Aquí solo se informa y se
// remite al estado de cuenta, que sí lee la base.
const RESULTADOS = {
  exito: {
    icono: HiCheckCircle,
    clase: 'resultado--exito',
    titulo: 'Pago recibido',
    mensaje: 'Gracias. En cuanto Stripe confirme la operación verás la cuota como pagada en tu estado de cuenta.',
  },
  error: {
    icono: HiXCircle,
    clase: 'resultado--error',
    titulo: 'El pago no se completó',
    mensaje: 'No se realizó ningún cargo. Puedes intentarlo de nuevo desde tu estado de cuenta.',
  },
  pendiente: {
    icono: HiClock,
    clase: 'resultado--pendiente',
    titulo: 'Pago pendiente',
    mensaje: 'Stripe está procesando la operación. La cuota se actualizará automáticamente al confirmarse.',
  },
};

function PaymentResult() {
  const navigate = useNavigate();
  const { estado } = useParams();
  const [params] = useSearchParams();

  const info = RESULTADOS[estado] ?? RESULTADOS.pendiente;
  const Icono = info.icono;

  return (
    <div className="dashboard-page">
      <Header />

      <div className={`resultado-pago ${info.clase}`}>
        <Icono size={64} />
        <h1 className="resultado-titulo">{info.titulo}</h1>
        <p className="resultado-mensaje">{info.mensaje}</p>

        {params.get('payment_intent') && (
          <p className="campo-ayuda">Referencia: {params.get('payment_intent')}</p>
        )}

        <div className="resultado-accion">
          <MyButton onClick={() => navigate('/payments')}>Ver mi estado de cuenta</MyButton>
        </div>
      </div>
    </div>
  );
}

export default PaymentResult;
