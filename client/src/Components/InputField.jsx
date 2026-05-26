import React from 'react';
import { COLORS } from '../colors';

const InputField = ({ 
  label = '', 
  placeholder = '', 
  type = 'text', 
  icon: Icon = null, 
  value = '', 
  onChange = () => {}, 
  name = '' 
}) => {
  const containerStyle = {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
    marginBottom: '1rem',
  };

  const labelStyle = {
    fontSize: '0.875rem',
    fontWeight: '500',
    color: COLORS.Black,
  };

  const inputWrapperStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    borderRadius: '0.5rem',
    border: `1px solid ${COLORS.Grey}`,
    padding: '0.75rem 1rem',
    backgroundColor: COLORS.White,
    transition: 'border-color 0.3s ease, box-shadow 0.3s ease',
  };

  const inputStyle = {
    flex: 1,
    border: 'none',
    outline: 'none',
    backgroundColor: 'transparent',
    fontSize: '1rem',
    color: COLORS.Black,
    padding: 0,
    fontFamily: 'inherit',
  };

  const inputPlaceholderStyle = {
    color: COLORS.Grey,
  };

  const iconStyle = {
    color: COLORS.Blue,
    fontSize: '1.25rem',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '1.5rem',
    height: '1.5rem',
    flexShrink: 0,
  };

  return (
    <div style={containerStyle}>
      {label && <label style={labelStyle}>{label}</label>}
      <div style={inputWrapperStyle}>
        {Icon && (
          <div style={iconStyle}>
            <Icon size={20} />
          </div>
        )}
        <input
          type={type}
          name={name}
          placeholder={placeholder}
          value={value}
          onChange={onChange}
          style={{
            ...inputStyle,
            color: value ? COLORS.Black : COLORS.Grey,
          }}
        />
      </div>
    </div>
  );
};

export default InputField;
