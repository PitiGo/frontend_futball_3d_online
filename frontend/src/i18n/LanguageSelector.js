import React from 'react';
import { useTranslation } from './LanguageContext';

const LanguageSelector = () => {
  const { language, changeLanguage } = useTranslation();

  return (
    <div style={{
      position: 'absolute',
      top: '10px',
      right: '10px',
      zIndex: 1000,
    }}>
      <select
        value={language}
        onChange={(e) => changeLanguage(e.target.value)}
        style={{
          padding: '5px',
          borderRadius: '4px',
          border: '1px solid #ccc',
          backgroundColor: 'white',
          cursor: 'pointer'
        }}
      >
        <option value="en">English</option>
        <option value="es">Español</option>
      </select>
    </div>
  );
};

export default LanguageSelector;