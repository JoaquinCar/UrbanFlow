import React from 'react';
import { useNavigate } from 'react-router-dom';
import { COLORS } from '../colors';
import { Header } from '../Components/Header';

import './main.css';

function Owners() {
  return (
    <div className="dashboard-page">
      <Header />
    <p>owner</p>
    </div>
  );
}
export default Owners;