import React, { useEffect } from 'react';

const GameToast = ({ message, type = 'error', onDismiss, duration = 4000 }) => {
  useEffect(() => {
    if (!message) return undefined;
    const timer = setTimeout(() => onDismiss?.(), duration);
    return () => clearTimeout(timer);
  }, [message, duration, onDismiss]);

  if (!message) return null;

  const bg = type === 'error' ? 'rgba(220, 38, 38, 0.95)' : 'rgba(30, 64, 175, 0.95)';

  return (
    <div
      role="alert"
      style={{
        position: 'fixed',
        top: '1rem',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 10000,
        backgroundColor: bg,
        color: 'white',
        padding: '0.75rem 1.25rem',
        borderRadius: '8px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
        maxWidth: '90vw',
        fontSize: '0.95rem',
        animation: 'fadeIn 0.3s ease',
      }}
    >
      {message}
    </div>
  );
};

export default GameToast;
