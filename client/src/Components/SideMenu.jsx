import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { HiBars3, HiXMark, HiArrowRightOnRectangle } from 'react-icons/hi2';
import { useAuth } from '../context/AuthContext';
import { navItemsForRole } from '../config/nav';
import '../screens/main.css';
import '../styles/layout.css';

export function SideMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { rol, logout } = useAuth();

  // Las entradas dependen del rol: el vigilante no ve Propietarios ni Cuotas.
  const items = navItemsForRole(rol);

  const handleNavigate = (path) => {
    navigate(path);
    setIsOpen(false);
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <>
      <button
        className="dashboard-header-btn dashboard-header-btn--menu"
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
          {items.map(({ label, icon: Icon, path }) => {
            const activo = location.pathname === path;
            return (
              <button
                key={path}
                className={`sidemenu-item ${activo ? 'active' : ''}`}
                aria-current={activo ? 'page' : undefined}
                onClick={() => handleNavigate(path)}
              >
                <span className="sidemenu-item-icon">
                  <Icon size={20} />
                </span>
                {label}
              </button>
            );
          })}

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
