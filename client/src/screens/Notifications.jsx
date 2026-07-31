import React from 'react';
import { Header } from '../Components/Header';
import { Message } from '../Components/Message';
import { useFetch } from '../hooks/useFetch';
import { misComunicados } from '../api/comunicados';
import './main.css';
import '../styles/layout.css';

function Notifications() {
  const { datos, cargando, error } = useFetch(misComunicados, []);

  return (
    <div className="dashboard-page">
      <Header />

      <div className="page-head">
        <h1 className="section-title">Avisos</h1>
        {datos && <span className="page-contador">{datos.length}</span>}
      </div>

      <Message
        items={datos}
        cargando={cargando}
        error={error}
        vacio="Todavía no hay avisos de la administración"
      />
    </div>
  );
}

export default Notifications;
