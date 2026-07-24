import { BrowserRouter } from 'react-router-dom'
import './App.css';
import React, { useState, useEffect } from 'react';
import SplashScreen from './screens/SplashScreen';
import AppRoutes from './Routes/Routes';

function App() {
  const [showSplash, setShowSplash] = useState(true);

    useEffect(() => {
      const timer = setTimeout(() => {
        setShowSplash(false);
      }, 3000); // 5 segundos

      return () => clearTimeout(timer); // Limpieza del timer
    }, []);

    return (
      <BrowserRouter>
        <div className="app-container">
          {showSplash ? <SplashScreen /> : <AppRoutes />}
        </div>
      </BrowserRouter>
    );
}

export default App
