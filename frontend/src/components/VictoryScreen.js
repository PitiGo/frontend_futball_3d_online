import React from 'react';

const VictoryScreen = ({ gameOverInfo, isMobile, t, onBackToLobby }) => {
  if (!gameOverInfo) return null;

  const isDraw = !gameOverInfo?.winningTeam;
  const winningColor = isDraw
    ? '#e5e7eb'
    : (gameOverInfo?.winningTeam === 'left' ? '#3b82f6' : '#ef4444');
  let winnerLabel;
  if (isDraw) {
    winnerLabel = t('gameUI.draw') || 'DRAW!';
  } else if (gameOverInfo?.winningTeam === 'left') {
    winnerLabel = t('gameUI.mammalTeam') || 'MAMMALS WIN!';
  } else {
    winnerLabel = t('gameUI.reptileTeam') || 'REPTILES WIN!';
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.9)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        color: 'white',
        animation: 'fadeIn 0.5s ease',
        pointerEvents: 'auto',
      }}
    >
      <h1
        style={{
          fontSize: isMobile ? '2rem' : '4rem',
          fontWeight: 'bold',
          color: winningColor,
          textShadow: '0 0 20px rgba(255,255,255,0.2)',
          textAlign: 'center',
          marginBottom: '20px',
        }}
      >
        {winnerLabel}
      </h1>

      <div
        style={{
          fontSize: isMobile ? '3rem' : '6rem',
          fontWeight: 'bold',
          fontFamily: 'monospace',
          marginBottom: '30px',
        }}
      >
        <span style={{ color: '#3b82f6' }}>{gameOverInfo?.finalScore?.left || 0}</span>
        <span style={{ margin: '0 20px', color: '#666' }}>-</span>
        <span style={{ color: '#ef4444' }}>{gameOverInfo?.finalScore?.right || 0}</span>
      </div>

      <p style={{ fontSize: '1.2rem', color: '#aaa' }}>
        {isDraw ? (t('gameUI.gameOver') || 'GAME OVER') : (t('gameUI.victory') || 'VICTORY!')}
      </p>

      <button
        type="button"
        onClick={onBackToLobby}
        style={{
          marginTop: '2rem',
          padding: '0.85rem 2rem',
          fontSize: '1rem',
          fontWeight: 'bold',
          border: 'none',
          borderRadius: '8px',
          cursor: 'pointer',
          backgroundColor: '#3b82f6',
          color: 'white',
        }}
      >
        {t('gameUI.backToLobby') || 'Back to lobby'}
      </button>
    </div>
  );
};

export default VictoryScreen;
