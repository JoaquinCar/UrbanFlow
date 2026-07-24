import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

import {
  HiBars3,
  HiXMark,
  HiHome,
  HiBanknotes,
  HiBell,
  HiUsers,
  HiQrCode,
  HiCog6Tooth,
  HiArrowRightOnRectangle,
} from 'react-icons/hi2';
import '../screens/main.css';

const NAV_ITEMS = [
  { label: 'Dashboard',       icon: HiHome,                    path: '/dashboard' },
  { label: 'Pagos',           icon: HiBanknotes,               path: '/payments' },
  { label: 'Notificaciones',  icon: HiBell,                    path: '/notifications' },
  { label: 'Mi Acceso (QR)',  icon: HiQrCode,                  path: '/access' },
  { label: 'Propietarios',    icon: HiUsers,                   path: '/owners' },
  { label: 'Configuración',   icon: HiCog6Tooth,               path: '/settings' },
];

export function SideMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const handleNavigate = (path) => {
    navigate(path);
    setIsOpen(false);
  };

  const handleLogout = () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('user');
    navigate('/login');
  };

  return (
    <>
      <button
        className="dashboard-header-btn"
        onClick={() => setIsOpen(true)}
        aria-label="Abrir menú"
      >
        <HiBars3 size={26} />
      </button>

      {isOpen && (
        <div
          className="sidemenu-overlay"
          onClick={() => setIsOpen(false)}
        />
      )}

      <nav className={`sidemenu-drawer ${isOpen ? 'open' : ''}`}>
        <div className="sidemenu-header">
          <div className="sidemenu-logo">
            <img src="/assets/logo_azul.png" alt="UrbanFlow" />
          </div>
          <button
            className="sidemenu-close"
            onClick={() => setIsOpen(false)}
            aria-label="Cerrar menú"
          >
            <HiXMark size={22} />
          </button>
        </div>

        <div className="sidemenu-nav">
          {NAV_ITEMS.map(({ label, icon: Icon, path }) => (
            <button
              key={path}
              className={`sidemenu-item ${location.pathname === path ? 'active' : ''}`}
              onClick={() => handleNavigate(path)}
            >
              <span className="sidemenu-item-icon">
                <Icon size={20} />
              </span>
              {label}
            </button>
          ))}

          <hr className="sidemenu-divider" />

          <button
            className="sidemenu-item sidemenu-logout"
            onClick={handleLogout}
          >
            <span className="sidemenu-item-icon">
              <HiArrowRightOnRectangle size={20} />
            </span>
            Cerrar sesión
          </button>
        </div>
      </nav>
    </>
  );
}
