import React, { useState } from 'react';
import MyButton from '../Components/MyButton';
import InputField from '../Components/InputField';
import { COLORS } from '../colors';
import { HiUser, HiEnvelope, HiLockClosed } from 'react-icons/hi2';
import './CreateAccount.css';
import { Link, useNavigate} from 'react-router-dom';

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

  const navigate = useNavigate();

  const handleCreateAccount = () => {
    console.log('Crear cuenta:', formData);
    // Aquí irá la lógica para crear la cuenta

    navigate('/NewAccount'); // Redirige a otro formulario o pantalla después de crear la cuenta
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

      <h1 className="main-title">Crear nueva cuenta</h1>
      <p className="subtitle">¡Estamos aquí para ayudarte!</p>

      <form className="auth-form">
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

        <div className="button-wrapper">
          <MyButton onClick={handleCreateAccount}>Crear cuenta</MyButton>
        </div>
      </form>

      <div className="divider-text">or</div>

      <div className="form-footer">
        ¿Ya tienes una cuenta? <Link to="/login" className="regular-link">Iniciar sesión</Link>
      </div>
    </div>
  );
};

export default CreateAccount;
