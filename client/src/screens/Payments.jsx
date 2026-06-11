import React from 'react';
import { useNavigate } from 'react-router-dom';
import { COLORS } from '../colors';
import { Header } from '../Components/Header';

import './main.css';

function Payments() {
  return (
    <div className="dashboard-page">
      <Header />
    <p>Payments</p>
    </div>
  );
}

export default Payments;