import React, { useState } from 'react';
import { SideMenu } from '../Components/SideMenu';
import { HiUser } from 'react-icons/hi2';
import { useNavigate } from 'react-router-dom';


export function Header() {
  const navigate = useNavigate();
  return (
    <header className="dashboard-header">
    <SideMenu />

    <div className="dashboard-logo">
        <img src="/assets/logo_azul.png" alt="UrbanFlow" />
    </div>

    <button
        className="dashboard-header-btn"
        onClick={() => navigate('/settings')}
        aria-label="Perfil"
    >
        <HiUser size={24} />
    </button>
    </header>
  );
}
