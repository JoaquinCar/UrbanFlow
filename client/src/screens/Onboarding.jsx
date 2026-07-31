import React, { useState } from 'react';
import MyButton from '../Components/MyButton';
import { useNavigate } from 'react-router-dom';

const Onboarding = () => {
  const [currentSlide, setCurrentSlide] = useState(0);
  const navigate = useNavigate();

  // Datos de los 3 slides 
  const slides = [
    {
      id: 1,
      image: '/assets/Onboarding_1.jpg', 
      title: 'Fácil Acceso a tu fraccionamiento',
      description: 'Guarda tus entradas QR de forma segura y sencilla.',
    },
    {
      id: 2,
      image: '/assets/Onboarding_2.jpg', 
      title: 'Control de Pagos',
      description: 'Administra tus cuotas de mantenimiento y recibe comprobantes al instante.',
    },
    {
      id: 3,
      image: '/assets/Onboarding_3.jpg', 
      title: 'Reportes y mantenimientos',
      description: 'Genera tickets de asistencia o reporta incidencias en tu comunidad.',
    },
  ];

  const handleNext = () => {
    if (currentSlide < slides.length - 1) {
      setCurrentSlide(currentSlide + 1);
    } else {
      handleFinish();
    }
  };

  const handleSkip = () => {
    handleFinish();
  };

  // No hay registro público: las cuentas las crea el admin al dar de alta al
  // propietario. El onboarding termina en el login.
  const handleFinish = () => {
    navigate('/login');
  };

  return (
    <div className="onboarding-card">
      <div className="onboarding-image-container">
        <img 
          src={slides[currentSlide].image} 
          alt={slides[currentSlide].title} 
          className="onboarding-image"
        />
      </div>

      <div className="onboarding-content">
        <h2 className="onboarding-title">{slides[currentSlide].title}</h2>
        <p className="onboarding-description">{slides[currentSlide].description}</p>

        <MyButton onClick={handleNext}>
          {currentSlide === slides.length - 1 ? 'Empezar' : 'Siguiente'}
        </MyButton>

        {/* Puntos carousel */}
        <div className="dots-container">
          {slides.map((_, index) => (
            <span
              key={index}
              className={`dot ${index === currentSlide ? 'active' : ''}`}
              onClick={() => setCurrentSlide(index)}
            />
          ))}
        </div>

        <button type="button" className="btn-skip" onClick={handleSkip}>
          Saltar
        </button>
      </div>
    </div>
  );
};

export default Onboarding;