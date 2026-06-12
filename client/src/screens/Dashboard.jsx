import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Header } from '../Components/Header';
import { COLORS } from '../colors';
import './main.css';
import { Message } from '../Components/Message';

import {
  HiUser,
  HiMapPin,
  HiBanknotes,
  HiPlus,
  HiQrCode,
  HiCalendarDays,
} from 'react-icons/hi2';


const Dashboard = () => {
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem('user') || '{}');

  const displayName = user.nombre || 'Usuario';
  const displayRole = user.rol
    ? user.rol.charAt(0).toUpperCase() + user.rol.slice(1)
    : 'Residente';

  return (
    <div className="dashboard-page">
      <Header/>

      {/* ── Contenido ── */}
      <main className="dashboard-content">

        {/* Tarjeta de usuario */}
        <div className="user-card">
          <div className="user-card-photo">
            <HiUser size={44} className="user-card-avatar" />
          </div>
          <div className="user-card-info">
            <h2>{displayName}</h2>
            <p className="user-role">{displayRole}</p>
            <p className="user-location">
              <HiMapPin size={13} />
              Casa
            </p>
          </div>
        </div>

        {/* Pagos pendientes */}
        <div className="payments-card">
          <div className="payments-icon">
            <HiBanknotes size={36} />
          </div>
          <div className="payments-info">
            <p className="payments-label">Pagos pendientes</p>
            <p className="payments-amount">$1,200.00 mxn</p>
          </div>
          <button
            className="pagar-btn"
            onClick={() => navigate('/payments')}
          >
            Pagar
          </button>
        </div>

        {/* Acciones rápidas */}
        <section>
          <h3 className="section-title">Acciones Rapidas</h3>
          <div className="quick-actions-grid">
            <div className="action-card" onClick={() => navigate('/access')}>
              <div className="action-icon">
                <HiPlus size={26} color="#ffffff" />
              </div>
              <p className="action-title">Generar QR</p>
              <p className="action-subtitle">Para visitas</p>
            </div>
            <div className="action-card" onClick={() => navigate('/access')}>
              <div className="action-icon">
                <HiQrCode size={26} color="#ffffff" />
              </div>
              <p className="action-title">Ver mi QR</p>
              <p className="action-subtitle">Mi acceso</p>
            </div>
          </div>
        </section>

        <h3 className="section-title">Notificaciones</h3>

       <Message/>

      </main>
    </div>
  );
};

export default Dashboard;
