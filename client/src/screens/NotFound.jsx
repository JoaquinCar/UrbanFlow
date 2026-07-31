import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { homeForRole } from '../config/nav';
import MyButton from '../Components/MyButton';
import './main.css';

function NotFound() {
  const navigate = useNavigate();
  const { autenticado, rol } = useAuth();

  const destino = autenticado ? homeForRole(rol) : '/login';

  return (
    <div className="dashboard-page">
      <div className="notfound-wrap">
        <h1 className="notfound-code">404</h1>
        <p className="notfound-text">Esta página no existe.</p>
        <div className="notfound-action">
          <MyButton onClick={() => navigate(destino, { replace: true })}>
            {autenticado ? 'Volver al inicio' : 'Ir a iniciar sesión'}
          </MyButton>
        </div>
      </div>
    </div>
  );
}

export default NotFound;
