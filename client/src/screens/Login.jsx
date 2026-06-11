import React, { useState } from 'react';
import MyButton from '../Components/MyButton';
import InputField from '../Components/InputField';
import { COLORS } from '../colors';
import { HiEnvelope, HiLockClosed } from 'react-icons/hi2';
import './CreateAccount.css';
import { Link, useNavigate } from 'react-router-dom';
import api from '../api';

const Login = () => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    email: '',
    contraseña: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await api.post('/auth/login', {
        email: formData.email,
        password: formData.contraseña,
      });

      // Guardar token y datos del usuario
      localStorage.setItem('access_token', response.data.access_token);
      localStorage.setItem('user', JSON.stringify(response.data.user));

      // Redirigir a dashboard
      navigate('/dashboard');
    } catch (err) {
      setError(err.response?.data?.error || 'Error al iniciar sesión');
    } finally {
      setLoading(false);
    }
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

      {error && <p style={{ color: 'red', marginBottom: '15px' }}>{error}</p>}

      <form className="auth-form" onSubmit={handleSubmit}>
        <InputField
          placeholder="Email"
          type="email"
          icon={HiEnvelope}
          name="email"
          value={formData.email}
          onChange={handleChange}
          required
        />
        <InputField
          placeholder="Contraseña"
          type="password"
          icon={HiLockClosed}
          name="contraseña"
          value={formData.contraseña}
          onChange={handleChange}
          required
        />

        <div className="button-wrapper">
          <MyButton type="submit" disabled={loading}>
            {loading ? 'Cargando...' : 'Enviar'}
          </MyButton>
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
