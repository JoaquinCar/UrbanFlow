import React, { useState } from 'react';
import { HiMapPin, HiMiniPhone, HiUser, HiEnvelope } from 'react-icons/hi2';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Header } from '../Components/Header';
import { Modal } from '../Components/Modal';
import { Tabs } from '../Components/Tabs';
import './main.css';

// Fix leaflet default marker icons broken by bundlers
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const TABS = ['Lista', 'Mapa'];

const PROPIETARIOS = [
  { id: 1, nombre: 'Estefanía Ramos', direccion: '123 Oak Street, CA 98765', telefono: '9991023530', lat: 20.9674, lng: -89.5926 },
  { id: 2, nombre: 'Fernando Cruz',   direccion: '123 Oak Street, CA 98765', telefono: '9991023531', lat: 20.9680, lng: -89.5910 },
  { id: 3, nombre: 'Javier Castillo', direccion: '#321 Calle 3',             telefono: '9991023532', lat: 20.9670, lng: -89.5900 },
];

const MAP_CENTER = [20.9675, -89.5912];
const FRACCIONAMIENTO = 'THE HEIGHTS';

function OwnerCard({ item, onVer }) {
  return (
    <div className="access-card">
      <div className="access-card-body">
        <div className="access-card-photo">
          <HiUser size={36} color="#465ed4" />
        </div>
        <div className="access-card-info">
          <p className="access-card-name">{item.nombre}</p>
          <p className="access-card-role">Propietario</p>
          <p className="access-card-loc"><HiMapPin size={12} /> {item.direccion}</p>
          <p className="access-card-loc"><HiMiniPhone size={12} /> {item.telefono}</p>
        </div>
      </div>
      <div className="access-card-actions">
        <button className="access-btn-outline" onClick={() => onVer(item)}>Ver</button>
      </div>
    </div>
  );
}

function MapPanel({ data, onVer }) {
  return (
    <div className="owners-map-panel">
      <div className="owners-map-wrapper">
        <MapContainer
          center={MAP_CENTER}
          zoom={16}
          scrollWheelZoom={false}
          style={{ width: '100%', height: '100%' }}
          zoomControl={false}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {data.map(owner => (
            <Marker key={owner.id} position={[owner.lat, owner.lng]}>
              <Popup>
                <strong>{owner.nombre}</strong><br />
                {owner.direccion}
              </Popup>
            </Marker>
          ))}
        </MapContainer>
        <div className="owners-map-label">{FRACCIONAMIENTO}</div>
      </div>

      <div className="owners-grid">
        {data.map(owner => (
          <div key={owner.id} className="owners-grid-card" onClick={() => onVer(owner)}>
            <div className="owners-grid-photo">
              <HiUser size={44} color="#a5b4fc" />
            </div>
            <p className="owners-grid-name">{owner.nombre}</p>
            <p className="owners-grid-role">Propietario</p>
            <p className="owners-grid-addr">
              <HiMapPin size={11} /> {owner.direccion}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function ListPanel({ data, onVer }) {
  if (data.length === 0) return <p className="access-empty">Sin registros</p>;
  return data.map(item => (
    <OwnerCard key={item.id} item={item} onVer={onVer} />
  ));
}

function OwnerDetailModal({ item }) {
  return (
    <div className="qr-modal-content">
      <div className="owners-modal-avatar">
        <HiUser size={52} color="#a5b4fc" />
      </div>
      <p className="qr-name">{item.nombre}</p>
      <p className="qr-desc">Propietario</p>
      <p className="qr-desc"><HiMapPin size={13} /> {item.direccion}</p>
      <p className="qr-desc"><HiMiniPhone size={13} /> {item.telefono}</p>
      <div className="qr-actions">
        <button className="qr-btn qr-btn-cyan">
          <HiEnvelope size={18} /> Enviar correo
        </button>
      </div>
    </div>
  );
}

function Owners() {
  const [detailModal, setDetailModal] = useState({ open: false, item: null });

  const handleVer = item => setDetailModal({ open: true, item });

  return (
    <div className="dashboard-page">
      <Header />

      <h1 className="owners-page-title">Propietarios</h1>

      <Tabs tabs={TABS}>
        <div className="access-tab-content">
          <ListPanel data={PROPIETARIOS} onVer={handleVer} />
        </div>
        <MapPanel data={PROPIETARIOS} onVer={handleVer} />
      </Tabs>

      <Modal
        isOpen={detailModal.open}
        onClose={() => setDetailModal({ open: false, item: null })}
        title="Propietario"
      >
        {detailModal.item && <OwnerDetailModal item={detailModal.item} />}
      </Modal>
    </div>
  );
}

export default Owners;
