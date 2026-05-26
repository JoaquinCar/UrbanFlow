import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'

import SplashScreen from './screens/SplashScreen';
import Onboarding from './screens/Onboarding';
import './App.css';
import React, { useState, useEffect } from 'react';


function App() {

    const [showSplash, setShowSplash] = useState(true);

    useEffect(() => {
      const timer = setTimeout(() => {
        setShowSplash(false);
      }, 3000); // 5 segundos

      return () => clearTimeout(timer); // Limpieza del timer
    }, []);

    return (
      <div className="app-container">
        {showSplash ? <SplashScreen /> : <Onboarding />}
      </div>
    );
}

export default App
