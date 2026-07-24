import React, { useState } from 'react';
import { COLORS } from '../colors';


const MyButton = ({ onClick, children, disabled = false, type = "button" }) => {
  const [isHovered, setIsHovered] = useState(false);

  // Uso de colores globales
  const getBackgroundColor = () => {
    if (disabled) return COLORS.Grey;
    if (isHovered) return COLORS.BabyBlue;
    return COLORS.DarkBlue;
  };

  const buttonStyle = {
    width: '100%',
    backgroundColor: getBackgroundColor(),
    color: COLORS.White,
    border: 'none',
    padding: '1rem',
    borderRadius: '30px',
    fontSize: '1rem',
    fontWeight: '600',
    cursor: disabled ? 'not-allowed' : 'pointer',
    transition: 'background-color 0.3s ease',
  };

  return (
    <button
      type={type}
      style={buttonStyle}
      onClick={!disabled ? onClick : undefined}
      disabled={disabled}
      onMouseEnter={() => !disabled && setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {children}
    </button>
  );
};

export default MyButton;
