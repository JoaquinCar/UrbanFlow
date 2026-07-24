import React, { useState } from 'react';
import MyButton from '../Components/MyButton';
import InputField from '../Components/InputField';
import { COLORS } from '../colors';
import { HiUser, HiCalendar, HiPhone } from 'react-icons/hi2';
import './CreateAccount.css';
import { Link, useNavigate} from 'react-router-dom';


const NewAccount = () => {
  const [formData, setFormData] = useState({
    nombre: '',
    genero: '',
    fechaNacimiento: '',
    telefono: '',
  });

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const navigate = useNavigate();
  
  const handleSubmit = () => {
    navigate('/dashboard');
    console.log('Enviar nueva cuenta:', formData);
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

      <h1 className="main-title">Tu cuenta</h1>

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
          placeholder="Genero"
          type="text"
          icon={HiUser}
          name="genero"
          value={formData.genero}
          onChange={handleChange}
        />
        <InputField
          placeholder="Fecha de nacimiento"
          type="date"
          icon={HiCalendar}
          name="fechaNacimiento"
          value={formData.fechaNacimiento}
          onChange={handleChange}
        />
        <InputField
          placeholder="Teléfono"
          type="tel"
          icon={HiPhone}
          name="telefono"
          value={formData.telefono}
          onChange={handleChange}
        />

        <div className="button-wrapper">
          <MyButton onClick={handleSubmit}>Enviar</MyButton>
        </div>
      </form>
    </div>
  );
};

export default NewAccount;
