import { BrowserRouter } from 'react-router-dom'
import './App.css';
import './styles/layout.css';
import React, { useState, useEffect } from 'react';
import SplashScreen from './screens/SplashScreen';
import AppRoutes from './Routes/Routes';
import { AuthProvider } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { SocketProvider } from './context/SocketContext';

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
          {/* SocketProvider va dentro de AuthProvider: necesita el token para
              conectarse y el rol para decidir si se une a la sala de caseta. */}
          <SocketProvider>
            <div className={`app-container ${showSplash ? 'app-container--fijo' : ''}`}>
              {showSplash ? <SplashScreen /> : <AppRoutes />}
            </div>
          </SocketProvider>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App
