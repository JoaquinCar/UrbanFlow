import React from 'react';
import MyButton from '../Components/MyButton';
import { COLORS } from '../colors';
import { Link, useNavigate } from 'react-router-dom';
import './CreateAccount.css';

// El restablecimiento por correo depende del módulo de comunicados (Nodemailer)
// y de un token de un solo uso, que todavía no existen. En lugar de un
// formulario que no manda nada, esta pantalla dice la verdad: el admin
// restablece la contraseña. Quien ya tiene sesión puede cambiarla en
// Configuración.
const LostPassword = () => {
  const navigate = useNavigate();

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
      <p className="subtitle">
        Por seguridad, el restablecimiento lo hace la administración del
        fraccionamiento. Escribe a la administración para que te asigne una
        contraseña nueva.
      </p>
      <p className="subtitle">
        Si aún puedes entrar a tu cuenta, cámbiala desde Configuración.
      </p>

      <div className="button-wrapper">
        <MyButton onClick={() => navigate('/login')}>Volver a iniciar sesión</MyButton>
      </div>

      <div className="form-footer">
        <Link to="/login" className="regular-link">Inicio de sesión</Link>
      </div>
    </div>
  );
};

export default LostPassword;
