import React, { useState } from 'react';
import MyButton from '../Components/MyButton';
import InputField from '../Components/InputField';
import { COLORS } from '../colors';
import { HiEnvelope, HiLockClosed } from 'react-icons/hi2';
import './CreateAccount.css';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { homeForRole } from '../config/nav';
import { mensajeDeError } from '../lib/apiError';

const Login = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();
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
      // El access token queda en memoria dentro del AuthContext; el refresh
      // viaja en la cookie httpOnly que pone el servidor.
      const usuario = await login(formData.email, formData.contraseña);

      // Cada rol aterriza en su propia pantalla, o vuelve a donde iba.
      const destino = location.state?.from || homeForRole(usuario.rol);
      navigate(destino, { replace: true });
    } catch (err) {
      setError(mensajeDeError(err, 'Error al iniciar sesión'));
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

      {error && <p className="form-error">{error}</p>}

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
        <Link to="/lost-password" className="regular-link">Recuperar contraseña</Link>
      </div>
    </div>
  );
};

export default Login;
