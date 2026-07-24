import React, { useState } from 'react';
import { HiMiniBanknotes, HiMiniCog, HiEnvelope } from 'react-icons/hi2';
import { QRCodeSVG } from 'qrcode.react';
import { Header } from '../Components/Header';
import { Modal } from '../Components/Modal';
import { Tabs } from '../Components/Tabs';
import { FloatButton } from '../Components/FloatButton';
import './main.css';

const TABS = ['Pendientes', 'Historial'];

//MockData
const PENDIENTES = [
  { id: 1, nombre: 'Cuota de mantenimiento', status: 'Pendiente', cantidad: '1200', limite: '12/06/2023' },
  { id: 1, nombre: 'Ticket de asistencia', status: 'Pendiente', cantidad: '500', limite: '12/05/2023' },
  { id: 1, nombre: 'Cuota de mantenimiento', status: 'Pendiente', cantidad: '1200', limite: '12/04/2023' }
];

const HISTORIAL = [
  { id: 1, nombre: 'Cuota de mantenimiento', status: 'Pagado', cantidad: '1200', limite: '12/06/2023' },
  { id: 1, nombre: 'Ticket de asistencia', status: 'Rechazado', cantidad: '500', limite: '12/05/2023' },
  { id: 1, nombre: 'Cuota de mantenimiento', status: 'Pagado', cantidad: '1200', limite: '12/04/2023' }
];


function AccessCard({ item, onVer, onPagar }) {
  return (
    <div className="access-card">
      <div className="access-card-body">
        <div className="access-card-photo">
          <HiMiniCog size={36} color="#465ed4" />
        </div>
        <div className="access-card-info">
          <p className="access-card-name">{item.nombre}</p>
          <div className="access-card-header">
            <span className="access-card-tipo">{item.status}</span>
            {!item.status && <span className="access-badge">Pendiente</span>}
          </div>
          <p className="access-card-role">Fecha limite: {item.limite}</p>
          <p className="access-card-loc">
            <HiMiniBanknotes size={12} /> $ {item.cantidad} mxn
          </p>
        </div>
      </div>
      <div className="access-card-actions">
        <button className="access-btn-dark" onClick={() => onPagar(item)}>
          Pagar
        </button>
        <button className="access-btn-outline" onClick={() => onVer(item)}>
          Ver
        </button>
      </div>
    </div>
  );
}

function PaymentDetailModalContent({ item }) {
  return (
    <div className="qr-modal-content">
      <p className="qr-name">{item.nombre}</p>
      <p className="qr-desc">Estado: {item.status}</p>
      <p className="qr-desc">Fecha limite: {item.limite}</p>
      <p className="qr-desc">$ {item.cantidad} mxn</p>
      <div className="qr-actions">
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
        <p className="qr-name">{nombre}</p>
        <p className="qr-desc">{tipo === 'familiar' ? 'Familiar' : 'Visitante'} · Casa</p>
        <div className="qr-actions">
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
        Detalles de pagos
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
      onPagar={() => {}}
    />
  ));
}

function Payments() {
  const [qrModal, setQrModal] = useState({ open: false, item: null });
  const [newModal, setNewModal] = useState(false);

  return (
    <div className="dashboard-page">
      <Header />

      <h1 className="section-title">Pagos</h1>

      <Tabs tabs={TABS}>
        <TabPanel data={PENDIENTES}  onVer={item => setQrModal({ open: true, item })} />
        <TabPanel data={HISTORIAL} onVer={item => setQrModal({ open: true, item })} />
      </Tabs>

      <Modal
        isOpen={qrModal.open}
        onClose={() => setQrModal({ open: false, item: null })}
        title="Código QR"
      >
        {qrModal.item && <PaymentDetailModalContent item={qrModal.item} />}
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

export default Payments;
