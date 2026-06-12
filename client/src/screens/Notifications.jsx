import React from 'react';
import { useNavigate } from 'react-router-dom';
import { COLORS } from '../colors';
import { Header } from '../Components/Header';
import { Message } from '../Components/Message';

import './main.css';

function Notifications() {
  return (
    <div className="dashboard-page">
      <Header />
      <h1 className="section-title">Notificaciones</h1>
      <Message />
    </div>
  );
}

export default Notifications;