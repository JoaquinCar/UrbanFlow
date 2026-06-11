import React from 'react';
import { useNavigate } from 'react-router-dom';
import { COLORS } from '../colors';
import { Header } from '../Components/Header';

import './main.css';

function Notifications() {
  return (
    <div className="dashboard-page">
      <Header />
    <p>Notifications</p>
    </div>
  );
}

export default Notifications;