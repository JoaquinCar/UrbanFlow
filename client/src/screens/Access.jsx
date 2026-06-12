import React, { useState } from 'react';
import { HiMapPin, HiUser, HiEnvelope, HiMiniArrowDownTray } from 'react-icons/hi2';
import { QRCodeSVG } from 'qrcode.react';
import { Header } from '../Components/Header';
import { Modal } from '../Components/Modal';
import { Tabs } from '../Components/Tabs';
import { FloatButton } from '../Components/FloatButton';
import './main.css';

const TABS = ['Familiar', 'Visitantes', 'Historial'];

//MockData
const FAMILIAR_DATA = [
  { id: 1, nombre: 'Roberto Garza', rol: 'Padre de familia', ubicacion: 'Casa', tipo: 'Familiar permanente' },
  { id: 2, nombre: 'Elena Garza',   rol: 'Madre de familia', ubicacion: 'Casa', tipo: 'Familiar permanente' },
];

const VISITANTES_DATA = [
  { id: 3, nombre: 'Carlos López',  rol: 'Visitante',        ubicacion: 'Casa', tipo: 'Visita temporal' },
];

const HISTORIAL_DATA = [
  { id: 4, nombre: 'Roberto Garza', rol: 'Padre de familia', ubicacion: 'Casa', tipo: 'Ingreso — 09 Jun 08:32', pasado: true },
  { id: 5, nombre: 'Carlos López',  rol: 'Visitante',        ubicacion: 'Casa', tipo: 'Ingreso — 08 Jun 15:10', pasado: true },
];

function AccessCard({ item, onVer, onEliminar }) {
  return (
    <div className="access-card">
      <div className="access-card-header">
        <span className="access-card-tipo">{item.tipo}</span>
        {!item.pasado && <span className="access-badge">Acceso Activo</span>}
      </div>
      <div className="access-card-body">
        <div className="access-card-photo">
          <HiUser size={36} color="#a5b4fc" />
        </div>
        <div className="access-card-info">
          <p className="access-card-name">{item.nombre}</p>
          <p className="access-card-role">{item.rol}</p>
          <p className="access-card-loc">
            <HiMapPin size={12} /> {item.ubicacion}
          </p>
        </div>
      </div>
      <div className="access-card-actions">
        <button className="access-btn-outline" onClick={() => onEliminar(item)}>
          Eliminar
        </button>
        <button className="access-btn-dark" onClick={() => onVer(item)}>
          Ver
        </button>
      </div>
    </div>
  );
}

function QRModalContent({ item }) {
  const qrValue = `urbanflow://access/${item.id}/${item.nombre}`;
  return (
    <div className="qr-modal-content">
      <div className="qr-container">
        <QRCodeSVG value={qrValue} size={200} />
      </div>
      <p className="qr-name">{item.nombre}</p>
      <p className="qr-desc">{item.rol} · {item.ubicacion}</p>
      <div className="qr-actions">
        <button className="qr-btn qr-btn-dark">
          <HiMiniArrowDownTray size={18} /> Guardar imagen
        </button>
        <button className="qr-btn qr-btn-cyan">
          <HiEnvelope size={18} /> Compartir en correo
        </button>
        <button className="qr-btn qr-btn-green">
          Compartir en Whatsapp
        </button>
      </div>
    </div>
  );
}

function NewAccessModalContent({ onClose }) {
  const [nombre, setNombre] = useState('');
  const [tipo, setTipo] = useState('familiar');
  const [generated, setGenerated] = useState(false);

  const handleGenerar = () => {
    if (nombre.trim()) setGenerated(true);
  };

  if (generated) {
    return (
      <div className="qr-modal-content">
        <div className="qr-container">
          <QRCodeSVG value={`urbanflow://access/new/${nombre}`} size={200} />
        </div>
        <p className="qr-name">{nombre}</p>
        <p className="qr-desc">{tipo === 'familiar' ? 'Familiar' : 'Visitante'} · Casa</p>
        <div className="qr-actions">
          <button className="qr-btn qr-btn-dark">
            <HiMiniArrowDownTray size={18} /> Guardar imagen
          </button>
          <button className="qr-btn qr-btn-cyan">
            <HiEnvelope size={18} /> Compartir en correo
          </button>
          <button className="qr-btn qr-btn-green">
            Compartir en Whatsapp
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="new-access-form">
      <div className="new-access-field">
        <label>Nombre</label>
        <input
          className="new-access-input"
          placeholder="Ej. Juan Pérez"
          value={nombre}
          onChange={e => setNombre(e.target.value)}
        />
      </div>
      <div className="new-access-field">
        <label>Tipo de acceso</label>
        <select
          className="new-access-input"
          value={tipo}
          onChange={e => setTipo(e.target.value)}
        >
          <option value="familiar">Familiar</option>
          <option value="visitante">Visitante</option>
        </select>
      </div>
      <button className="qr-btn qr-btn-dark" onClick={handleGenerar}>
        Generar código QR
      </button>
    </div>
  );
}

function TabPanel({ data, onVer }) {
  if (data.length === 0) return <p className="access-empty">Sin registros</p>;
  return data.map(item => (
    <AccessCard
      key={item.id}
      item={item}
      onVer={onVer}
      onEliminar={() => {}}
    />
  ));
}

function Access() {
  const [qrModal, setQrModal] = useState({ open: false, item: null });
  const [newModal, setNewModal] = useState(false);

  return (
    <div className="dashboard-page">
      <Header />

      <h1 className="section-title">Access </h1>

      <Tabs tabs={TABS}>
        <TabPanel data={FAMILIAR_DATA}  onVer={item => setQrModal({ open: true, item })} />
        <TabPanel data={VISITANTES_DATA} onVer={item => setQrModal({ open: true, item })} />
        <TabPanel data={HISTORIAL_DATA}  onVer={item => setQrModal({ open: true, item })} />
      </Tabs>

      <FloatButton onClick={() => setNewModal(true)} />

      <Modal
        isOpen={qrModal.open}
        onClose={() => setQrModal({ open: false, item: null })}
        title="Código QR"
      >
        {qrModal.item && <QRModalContent item={qrModal.item} />}
      </Modal>

      <Modal
        isOpen={newModal}
        onClose={() => setNewModal(false)}
        title="Nuevo acceso"
      >
        <NewAccessModalContent onClose={() => setNewModal(false)} />
      </Modal>
    </div>
  );
}

export default Access;
