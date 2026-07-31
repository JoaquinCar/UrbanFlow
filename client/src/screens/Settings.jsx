import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { HiUser, HiEnvelope, HiIdentification, HiLockClosed } from 'react-icons/hi2';
import { Header } from '../Components/Header';
import { Modal } from '../Components/Modal';
import InputField from '../Components/InputField';
import MyButton from '../Components/MyButton';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { cambiarPassword } from '../api/auth';
import { mensajeDeError } from '../lib/apiError';
import './main.css';

const ETIQUETA_ROL = {
  admin: 'Administrador',
  vigilante: 'Vigilante',
  propietario: 'Propietario',
  tecnico: 'Técnico',
};

function Settings() {
  const navigate = useNavigate();
  const { user, rol, logout } = useAuth();
  const toast = useToast();

  const [modalPassword, setModalPassword] = useState(false);
  const [form, setForm] = useState({ passwordActual: '', passwordNueva: '', confirmar: '' });
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
    setError('');
  };

  const cerrarModal = () => {
    setModalPassword(false);
    setForm({ passwordActual: '', passwordNueva: '', confirmar: '' });
    setError('');
  };

  const handleGuardarPassword = async (e) => {
    e.preventDefault();
    if (form.passwordNueva !== form.confirmar) {
      setError('Las contraseñas nuevas no coinciden');
      return;
    }
    setGuardando(true);
    setError('');
    try {
      await cambiarPassword(form.passwordActual, form.passwordNueva);
      cerrarModal();
      toast.exito('Contraseña actualizada. Inicia sesión de nuevo.');
      // El backend invalidó el refresh token, así que la sesión ya no sirve.
      await logout();
      navigate('/login', { replace: true });
    } catch (err) {
      setError(mensajeDeError(err));
    } finally {
      setGuardando(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="dashboard-page">
      <Header />

      <h1 className="section-title">Configuración</h1>

      <div className="settings-section">
        <div className="settings-card">
          <div className="settings-avatar">
            <HiUser size={30} />
          </div>
          <div>
            <p className="settings-nombre">{user?.nombre ?? '—'}</p>
            <p className="settings-rol">{ETIQUETA_ROL[rol] ?? rol ?? '—'}</p>
          </div>
        </div>

        <ul className="settings-list">
          <li className="settings-item">
            <span className="settings-item-icon"><HiEnvelope size={18} /></span>
            <span className="settings-item-label">Correo</span>
            <span className="settings-item-value">{user?.email ?? '—'}</span>
          </li>
          <li className="settings-item">
            <span className="settings-item-icon"><HiIdentification size={18} /></span>
            <span className="settings-item-label">Rol</span>
            <span className="settings-item-value">{ETIQUETA_ROL[rol] ?? rol ?? '—'}</span>
          </li>
        </ul>

        <button className="settings-action" onClick={() => setModalPassword(true)}>
          <span className="settings-item-icon"><HiLockClosed size={18} /></span>
          Cambiar contraseña
        </button>

        <button className="settings-action settings-action--peligro" onClick={handleLogout}>
          Cerrar sesión
        </button>
      </div>

      <Modal isOpen={modalPassword} onClose={cerrarModal} title="Cambiar contraseña">
        <form className="new-access-form" onSubmit={handleGuardarPassword}>
          {error && <p className="form-error">{error}</p>}

          <InputField
            placeholder="Contraseña actual"
            type="password"
            icon={HiLockClosed}
            name="passwordActual"
            value={form.passwordActual}
            onChange={handleChange}
          />
          <InputField
            placeholder="Nueva contraseña (mínimo 8 caracteres)"
            type="password"
            icon={HiLockClosed}
            name="passwordNueva"
            value={form.passwordNueva}
            onChange={handleChange}
          />
          <InputField
            placeholder="Confirmar nueva contraseña"
            type="password"
            icon={HiLockClosed}
            name="confirmar"
            value={form.confirmar}
            onChange={handleChange}
          />

          <MyButton type="submit" disabled={guardando}>
            {guardando ? 'Guardando…' : 'Guardar'}
          </MyButton>
        </form>
      </Modal>
    </div>
  );
}

export default Settings;
