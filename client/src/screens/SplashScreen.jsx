import React from 'react';

const imgStyle = {
  width: '200px',
  marginBottom: '20px',
  animation: 'pulse 2s infinite',
};
const SplashScreen = () => {
  return (
    <div className="splash-screen">
      {/* Logo*/}
      <img 
        style={imgStyle}
        src="/assets/logo_blanco.png" alt="App Logo" className="splash-logo" />
    </div>
  );
};

export default SplashScreen;