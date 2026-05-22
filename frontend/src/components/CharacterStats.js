import React from 'react';
import { useTranslation } from '../i18n/LanguageContext';
import { getCharacterStats } from '../constants/characterStats';

const STAT_MAX = {
  speed: 1.15,
  control: 1.7,
  shot: 1.2,
};

const StatBar = ({ label, value, max, color }) => {
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div style={{ marginBottom: '0.35rem' }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        fontSize: '0.7rem',
        color: '#6b7280',
        marginBottom: '0.15rem',
      }}
      >
        <span>{label}</span>
        <span>{Math.round(pct)}%</span>
      </div>
      <div style={{ background: '#e5e7eb', borderRadius: 4, height: 8, overflow: 'hidden' }}>
        <div style={{
          width: `${pct}%`,
          background: color,
          height: '100%',
          borderRadius: 4,
          transition: 'width 0.2s ease',
        }}
        />
      </div>
    </div>
  );
};

const CharacterStats = ({ characterId, teamColor }) => {
  const { t } = useTranslation();
  const stats = getCharacterStats(characterId);
  return (
    <div style={{ marginTop: '0.75rem', textAlign: 'left' }}>
      <StatBar
        label={t('teamSelection.stats.speed')}
        value={stats.speedMultiplier}
        max={STAT_MAX.speed}
        color={teamColor}
      />
      <StatBar
        label={t('teamSelection.stats.control')}
        value={stats.controlRadius}
        max={STAT_MAX.control}
        color={teamColor}
      />
      <StatBar
        label={t('teamSelection.stats.shot')}
        value={stats.shotMultiplier}
        max={STAT_MAX.shot}
        color={teamColor}
      />
    </div>
  );
};

export default CharacterStats;
