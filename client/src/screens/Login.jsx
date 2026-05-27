import React, { useState } from 'react';
import MyButton from '../Components/MyButton';
import InputField from '../Components/InputField';
import { COLORS } from '../colors';
import { HiEnvelope, HiLockClosed } from 'react-icons/hi2';
import './CreateAccount.css';
import { Link } from 'react-router-dom';

const Login = () => {
  const [formData, setFormData] = useState({
    email: '',
    contraseña: '',
  });

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSubmit = () => {
    console.log('Enviar login:', formData);
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

      <h1 className="main-title">Inicio de Sesión</h1>
      <p className="subtitle">Ingresa tu correo y contraseña.</p>

      <form className="auth-form">
        <InputField
          placeholder="Email"
          type="email"
          icon={HiEnvelope}
          name="email"
          value={formData.email}
          onChange={handleChange}
        />
        <InputField
          placeholder="Contraseña"
          type="password"
          icon={HiLockClosed}
          name="contraseña"
          value={formData.contraseña}
          onChange={handleChange}
        />

        <div className="button-wrapper">
          <MyButton onClick={handleSubmit}>Enviar</MyButton>
        </div>
      </form>

      <div className="form-footer">
        <Link to="/LostPassword" className="regular-link">Recuperar contraseña</Link><br />
        ¿No tienes cuenta? <Link to="/CreateAccount" className="regular-link">Crear cuenta</Link>
      </div>
    </div>
  );
};

export default Login;
