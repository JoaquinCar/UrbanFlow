import { BrowserRouter } from 'react-router-dom'
import './App.css';
import './styles/layout.css';
import React, { useState, useEffect } from 'react';
import SplashScreen from './screens/SplashScreen';
import AppRoutes from './Routes/Routes';
import { AuthProvider } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';

function App() {
  const [showSplash, setShowSplash] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setShowSplash(false);
    }, 3000);

    return () => clearTimeout(timer); // Limpieza del timer
  }, []);

  // El AuthProvider recupera la sesión (refresh + /me) mientras se ve la splash,
  // así que esos 3 segundos no se suman al arranque: corren en paralelo.
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <div className={`app-container ${showSplash ? 'app-container--fijo' : ''}`}>
            {showSplash ? <SplashScreen /> : <AppRoutes />}
          </div>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App
