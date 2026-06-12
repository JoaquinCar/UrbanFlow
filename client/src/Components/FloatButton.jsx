import React from 'react';
import { HiPlus } from 'react-icons/hi2';
import '../screens/main.css';

export function FloatButton({ onClick }) {
  return (
    <button className="fab" onClick={onClick} aria-label="Nuevo">
      <HiPlus size={28} color="#fff" />
    </button>
  );
}
