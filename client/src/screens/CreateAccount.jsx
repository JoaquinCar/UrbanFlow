import React, { useState } from 'react';
import MyButton from '../Components/MyButton';
import InputField from '../Components/InputField';
import { COLORS } from '../colors';
import { HiUser, HiEnvelope, HiLockClosed } from 'react-icons/hi2';

const CreateAccount = () => {
  const [formData, setFormData] = useState({
    nombre: '',
    email: '',
    contraseña: '',
  });

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleCreateAccount = () => {
    console.log('Crear cuenta:', formData);
    // Aquí irá la lógica para crear la cuenta
  };

  const containerStyle = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh',
    backgroundColor: '#F8F9FA',
    padding: '2rem',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  };

  const cardStyle = {
    width: '100%',
    maxWidth: '400px',
    backgroundColor: COLORS.White,
    borderRadius: '1rem',
    padding: '2rem',
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
  };

  const logoStyle = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: '2rem',
    fontSize: '1.5rem',
    fontWeight: '700',
  };

  const logoIconStyle = {
    width: '2.5rem',
    height: '2.5rem',
    marginRight: '0.5rem',
    backgroundColor: COLORS.Blue,
    borderRadius: '0.5rem',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: COLORS.White,
    fontSize: '1.5rem',
  };

  const titleStyle = {
    fontSize: '1.5rem',
    fontWeight: '700',
    color: COLORS.Black,
    textAlign: 'center',
    marginBottom: '0.5rem',
  };

  const subtitleStyle = {
    fontSize: '0.875rem',
    color: COLORS.Grey,
    textAlign: 'center',
    marginBottom: '2rem',
  };

  const formStyle = {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
  };

  const dividerStyle = {
    textAlign: 'center',
    margin: '1.5rem 0',
    color: COLORS.Grey,
    fontSize: '0.875rem',
  };

  const loginLinkStyle = {
    textAlign: 'center',
    fontSize: '0.875rem',
    color: COLORS.Black,
    marginTop: '1rem',
  };

  const linkStyle = {
    color: COLORS.Blue,
    textDecoration: 'none',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'color 0.3s ease',
  };

  return (
    <div style={containerStyle}>
      <div style={cardStyle}>
        <div style={logoStyle}>
          <div style={logoIconStyle}>🏢</div>
          <span>UrbanFlow</span>
        </div>

        <h1 style={titleStyle}>Crear nueva cuenta</h1>
        <p style={subtitleStyle}>¡Estamos aquí para ayudarte!</p>

        <form style={formStyle}>
          <InputField
            placeholder="Nombre"
            type="text"
            icon={HiUser}
            name="nombre"
            value={formData.nombre}
            onChange={handleChange}
          />
          <InputField
            placeholder="E mail"
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

          <div style={{ marginTop: '1rem' }}>
            <MyButton onClick={handleCreateAccount}>
              Crear cuenta
            </MyButton>
          </div>
        </form>

        <div style={dividerStyle}>or</div>

        <div style={loginLinkStyle}>
          ¿Ya tienes una cuenta? <a href="#" style={linkStyle}>Iniciar sesión</a>
        </div>
      </div>
    </div>
  );
};

export default CreateAccount;
