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

      {gameOverInfo?.mvp && (
        <div style={{
          marginTop: '14px',
          padding: '8px 18px',
          borderRadius: '10px',
          backgroundColor: 'rgba(250, 204, 21, 0.15)',
          border: '1px solid rgba(250, 204, 21, 0.5)',
          color: '#facc15',
          fontWeight: 'bold',
          fontSize: isMobile ? '1rem' : '1.2rem',
        }}>
          {`${t('gameUI.mvp') || 'MVP'}: ${gameOverInfo.mvp.name} (${gameOverInfo.mvp.goals})`}
        </div>
      )}

      {Array.isArray(gameOverInfo?.scorers) && gameOverInfo.scorers.length > 0 && (
        <div style={{
          marginTop: '14px',
          maxHeight: isMobile ? '120px' : '180px',
          overflowY: 'auto',
          minWidth: isMobile ? '200px' : '260px',
        }}>
          <div style={{ fontSize: '0.85rem', color: '#9ca3af', textAlign: 'center', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '1px' }}>
            {t('gameUI.scorers') || 'Scorers'}
          </div>
          {gameOverInfo.scorers.map((s) => (
            <div
              key={s.id}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: '16px',
                padding: '3px 10px',
                fontSize: '0.95rem',
                color: s.team === 'left' ? '#93c5fd' : '#fca5a5',
              }}
            >
              <span>{s.name}</span>
              <span style={{ fontWeight: 'bold' }}>{`⚽ ${s.goals}`}</span>
            </div>
          ))}
        </div>
      )}

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
