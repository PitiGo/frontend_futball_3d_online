import React, { useState, useEffect } from 'react';
import { useTranslation } from '../i18n/LanguageContext';

const LoadingScreen = () => {
  const { t } = useTranslation();
  const [tipIndex, setTipIndex] = useState(0);
  const [loadingProgress, setLoadingProgress] = useState(0);

  // Usar los tips desde las traducciones
  const tips = t('loading.tips');

  useEffect(() => {
    const interval = setInterval(() => {
      setTipIndex((prev) => (prev + 1) % tips.length);
    }, 3000);

    // Simulación de progreso de carga
    const progressInterval = setInterval(() => {
      setLoadingProgress(prev => {
        if (prev >= 100) {
          clearInterval(progressInterval);
          return 100;
        }
        return prev + 1;
      });
    }, 50);

    return () => {
      clearInterval(interval);
      clearInterval(progressInterval);
    };
  }, [tips.length]);

  return (
    <div id="loadingScreen" style={{
      position: 'fixed',
      inset: 0,
      backgroundColor: '#0f172a',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 50
    }}>
      {/* Logo del juego */}
      <div style={{
        fontSize: '3rem',
        fontWeight: 'bold',
        color: '#60a5fa',
        marginBottom: '2rem',
        textAlign: 'center',
        textShadow: '0 0 10px rgba(96, 165, 250, 0.5)',
        display: 'flex',
        alignItems: 'center',
        gap: '1rem'
      }}>
        <div style={{ animation: 'spin 2s linear infinite' }}>⚽</div>
        {t('loading.title')}
      </div>

      {/* Contenedor de la animación de carga */}
      <div style={{
        position: 'relative',
        width: '300px',
        height: '8px',
        backgroundColor: '#1e293b',
        borderRadius: '4px',
        overflow: 'hidden',
        marginBottom: '1rem'
      }}>
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          height: '100%',
          width: `${loadingProgress}%`,
          background: 'linear-gradient(90deg, #3b82f6, #60a5fa)',
          borderRadius: '4px',
          transition: 'width 0.3s ease'
        }} />
      </div>

      {/* Porcentaje de carga */}
      <div style={{
        color: '#60a5fa',
        fontSize: '1.25rem',
        fontWeight: 'bold',
        marginBottom: '2rem'
      }}>
        {loadingProgress}%
      </div>

      {/* Campo de fútbol animado */}
      <div style={{
        width: '200px',
        height: '150px',
        border: '2px solid #60a5fa',
        borderRadius: '8px',
        position: 'relative',
        marginBottom: '2rem',
        overflow: 'hidden'
      }}>
        {/* Línea central */}
        <div style={{
          position: 'absolute',
          left: '50%',
          top: 0,
          bottom: 0,
          width: '2px',
          backgroundColor: '#60a5fa'
        }} />

        {/* Círculo central */}
        <div style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          width: '40px',
          height: '40px',
          border: '2px solid #60a5fa',
          borderRadius: '50%',
          transform: 'translate(-50%, -50%)'
        }} />

        {/* Pelota animada */}
        <div style={{
          position: 'absolute',
          width: '20px',
          height: '20px',
          backgroundColor: 'white',
          borderRadius: '50%',
          animation: 'moveBall 4s infinite linear',
          boxShadow: '0 0 10px rgba(255, 255, 255, 0.5)'
        }} />
      </div>

      {/* Textos de carga */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '0.5rem'
      }}>
        <h2 style={{
          color: 'white',
          fontSize: '1.5rem',
          fontWeight: 'bold',
          textAlign: 'center'
        }}>
          {t('loading.loading')}
        </h2>
        <p style={{
          color: '#94a3b8',
          textAlign: 'center',
          maxWidth: '400px',
          fontSize: '0.875rem'
        }}>
          {t('loading.preparingResources')}
        </p>
      </div>

      {/* Tip rotativo */}
      <div style={{
        position: 'absolute',
        bottom: '2rem',
        left: '50%',
        transform: 'translateX(-50%)',
        color: '#64748b',
        fontSize: '0.875rem',
        textAlign: 'center',
        maxWidth: '400px',
        padding: '1rem',
        borderRadius: '8px',
        backgroundColor: 'rgba(30, 41, 59, 0.5)',
        transition: 'opacity 0.3s ease',
      }}>
        {tips[tipIndex]}
      </div>

      <style>
        {`
          @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }

          @keyframes moveBall {
            0% { left: 10%; top: 20%; }
            25% { left: 80%; top: 80%; }
            50% { left: 80%; top: 20%; }
            75% { left: 10%; top: 80%; }
            100% { left: 10%; top: 20%; }
          }

          @keyframes bounce {
            0%, 100% { transform: translateY(0); }
            50% { transform: translateY(-10px); }
          }
        `}
      </style>
    </div>
  );
};

export default LoadingScreen;