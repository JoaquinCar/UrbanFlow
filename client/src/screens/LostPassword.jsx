import React, { useState } from 'react';
import MyButton from '../Components/MyButton';
import InputField from '../Components/InputField';
import { COLORS } from '../colors';
import { HiEnvelope } from 'react-icons/hi2';
import './CreateAccount.css';

const LostPassword = () => {
  const [formData, setFormData] = useState({
    email: '',
  });

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSubmit = () => {
    console.log('Enviar recuperación:', formData);
  };

  const containerStyle = {
    '--color-text': COLORS.Black,
    '--color-muted': COLORS.Grey,
    '--color-primary': COLORS.Blue,
  };

  return (
    <div className="auth-page" style={containerStyle}>
      <div className="auth-logo">
        <img src="/assets/logo_azul.png" alt="UrbanFlow Logo" />
      </div>

      <h1 className="main-title">Recuperar tu contraseña</h1>
      <p className="subtitle">Ingresa tu correo y recibiras un correo con instrucciones.</p>

      <form className="auth-form">
        <InputField
          placeholder="Email"
          type="email"
          icon={HiEnvelope}
          name="email"
          value={formData.email}
          onChange={handleChange}
        />

        <div className="button-wrapper">
          <MyButton onClick={handleSubmit}>Enviar</MyButton>
        </div>
      </form>
    </div>
  );
};

export default LostPassword;
