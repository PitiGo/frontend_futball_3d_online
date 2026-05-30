import React, { useEffect, useState } from 'react';
import { useTranslation } from '../i18n/LanguageContext';

const KickoffCountdown = ({ kickoffEndsAt, isMobile }) => {
  const { t } = useTranslation();
  const [display, setDisplay] = useState(null);

  useEffect(() => {
    if (!kickoffEndsAt) {
      setDisplay(null);
      return undefined;
    }

    let goTimeout;
    let goTriggered = false;

    const tick = () => {
      const remaining = kickoffEndsAt - Date.now();
      if (remaining <= 0) {
        if (goTriggered) return; // Avoid re-showing "GO!" on every tick.
        goTriggered = true;
        clearInterval(interval); // Stop ticking once kickoff starts.
        setDisplay(t('gameUI.kickoffGo'));
        goTimeout = setTimeout(() => setDisplay(null), 700);
        return;
      }
      setDisplay(String(Math.ceil(remaining / 1000)));
    };

    // Create the interval before the first tick so tick() can clear it.
    const interval = setInterval(tick, 100);
    tick();

    return () => {
      clearInterval(interval);
      if (goTimeout) clearTimeout(goTimeout);
    };
  }, [kickoffEndsAt, t]);

  if (!display) return null;

  return (
    <div style={{
      position: 'absolute',
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      color: 'white',
      fontSize: isMobile ? '72px' : '120px',
      fontWeight: 900,
      letterSpacing: '4px',
      textShadow: '0 4px 24px rgba(0,0,0,0.6)',
      zIndex: 110,
      pointerEvents: 'none',
      animation: 'goalPop 0.25s ease-out',
    }}
    >
      {display}
    </div>
  );
};

export default KickoffCountdown;
