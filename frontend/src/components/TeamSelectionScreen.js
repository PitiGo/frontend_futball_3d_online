import React, { useState } from 'react';
import { useTranslation } from '../i18n/LanguageContext';
import CharacterStats from './CharacterStats';
import { useDeviceLayout } from '../hooks/useDeviceLayout';

const CharacterThumbnail = ({ characterId, teamColor, compact }) => {
  const [failed, setFailed] = useState(false);

  const baseStyle = compact
    ? {
      width: '48px',
      height: '48px',
      borderRadius: '8px',
      marginBottom: 0,
      flexShrink: 0,
    }
    : {
      width: '100%',
      height: '200px',
      borderRadius: '8px',
      marginBottom: '1rem',
    };

  if (failed) {
    return (
      <div style={{
        ...baseStyle,
        backgroundColor: '#e5e7eb',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#6b7280',
        fontSize: '0.9rem',
      }}>
        ?
      </div>
    );
  }

  return (
    <img
      src={`/thumbnails/${characterId}.png`}
      alt={characterId}
      onError={() => setFailed(true)}
      style={{
        ...baseStyle,
        objectFit: 'cover',
        backgroundColor: '#e5e7eb',
      }}
    />
  );
};

const TeamSelectionScreen = ({
  onTeamSelect,
  onCharacterSelect,
  teams,
  readyState,
  onToggleReady,
  onAddBot,
  onRemoveBot,
  onRenameBot,
  currentTeam,
  playerName,
  gameInProgress,
  selectedCharacter
}) => {

  const { t } = useTranslation();
  const { isMobile } = useDeviceLayout();
  // En móvil todo debe caber sin scroll (o casi): sin imagen de portada,
  // tarjetas de personaje horizontales y espaciados reducidos.
  const compact = isMobile;
  const maxPlayersPerTeam = 3;

  // Definición de los personajes disponibles para cada equipo
  const teamCharacters = {
    left: [
      { id: 'player', name: t('teamSelection.characters.rabbit.name'), description: t('teamSelection.characters.rabbit.description') },
      { id: 'pig', name: t('teamSelection.characters.pig.name'), description: t('teamSelection.characters.pig.description') }
    ],
    right: [
      { id: 'turtle', name: t('teamSelection.characters.turtle.name'), description: t('teamSelection.characters.turtle.description') },
      { id: 'lizard', name: t('teamSelection.characters.lizard.name'), description: t('teamSelection.characters.lizard.description') }
    ]
  };

  // Manejo de partida en curso
  if (gameInProgress) {
    return (
      <div style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '0.5rem',
      }}>
        <div style={{
          backgroundColor: 'white',
          borderRadius: '8px',
          padding: '0.5rem',
          textAlign: 'center',
          maxWidth: '90%',
        }}>
          <h2 style={{ color: '#dc2626', marginBottom: '0.5rem', fontSize: '1rem' }}>
            {t('teamSelection.gameInProgress')}
          </h2>
          <p style={{
            color: '#4b5563',
            marginBottom: '0.5rem',
            fontSize: '0.875rem',
          }}>
            {t('teamSelection.gameInProgressMessage')}
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: '0.5rem 1rem',
              backgroundColor: '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '0.875rem',
            }}
          >
            {t('teamSelection.tryAgain')}
          </button>
        </div>
      </div>
    );
  }

  // Funciones auxiliares para manejar estados de los jugadores
  const getReadyStatus = (team, playerId) => {
    if (!team || !playerId) return false;
    if (!readyState || !readyState[team]) return false;
    const playerStatus = readyState[team].find(p => p.id === playerId);
    return playerStatus?.ready || false;
  };

  const isPlayerInTeam = (teamName) => {
    return teams?.[teamName]?.some(player => player.name === playerName);
  };

  const getPlayerTeam = () => {
    if (isPlayerInTeam('left')) return 'left';
    if (isPlayerInTeam('right')) return 'right';
    return null;
  };

  const getCurrentPlayerId = () => {
    const team = getPlayerTeam();
    if (team) {
      return teams[team].find(p => p.name === playerName)?.id;
    }
    return null;
  };

  const playerId = getCurrentPlayerId();

  const getTeamName = (team) => team === 'left' ? t('teamSelection.mammals') : t('teamSelection.reptiles');
  const getTeamColor = (team) => team === 'left' ? '#3b82f6' : '#ef4444';

  const isBotPlayer = (player) => player?.isBot || (typeof player?.id === 'string' && player.id.startsWith('bot-'));

  const promptRenameBot = (player) => {
    if (!onRenameBot) return;
    const base = (player.name || '').replace(/\s*\(bot\)\s*$/i, '');
    const next = window.prompt(t('teamSelection.renameBotPrompt'), base);
    if (next !== null) onRenameBot(player.id, next);
  };

  const renderRenameBotButton = (player) => {
    if (!isBotPlayer(player) || !onRenameBot) return null;
    return (
      <button
        type="button"
        title={t('teamSelection.renameBot')}
        onClick={() => promptRenameBot(player)}
        style={{
          marginLeft: '0.25rem',
          padding: '0 0.3rem',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          color: '#6b7280',
          fontSize: '0.8rem',
          lineHeight: 1,
        }}
      >
        ✎
      </button>
    );
  };

  const renderBotControls = (team) => {
    if (!onAddBot) return null;
    const full = (teams?.[team]?.length || 0) >= maxPlayersPerTeam;
    const hasBots = (teams?.[team] || []).some((p) => typeof p.id === 'string' && p.id.startsWith('bot-'));
    return (
      <div style={{ marginBottom: compact ? '0.35rem' : '0.5rem' }}>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            type="button"
            onClick={() => onAddBot(team)}
            disabled={full}
            style={{
              flex: 1,
              padding: compact ? '0.3rem' : '0.4rem',
              backgroundColor: full ? '#cbd5e1' : '#0f766e',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: full ? 'not-allowed' : 'pointer',
              fontSize: compact ? '0.72rem' : '0.8rem',
              fontWeight: 600,
            }}
          >
            {`+ ${t('teamSelection.addBot')}`}
          </button>
          {hasBots && onRemoveBot && (
            <button
              type="button"
              onClick={() => onRemoveBot(team)}
              style={{
                padding: compact ? '0.3rem 0.55rem' : '0.4rem 0.7rem',
                backgroundColor: '#64748b',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: compact ? '0.72rem' : '0.8rem',
                fontWeight: 600,
              }}
            >
              {`− ${t('teamSelection.removeBot')}`}
            </button>
          )}
        </div>
        {hasBots && (
          <div style={{
            marginTop: '0.4rem',
            padding: compact ? '0.35rem 0.5rem' : '0.5rem 0.75rem',
            backgroundColor: 'rgba(15, 118, 110, 0.08)',
            border: '1px solid rgba(15, 118, 110, 0.2)',
            borderRadius: '6px',
            fontSize: compact ? '0.65rem' : '0.75rem',
            color: '#0f766e',
            textAlign: 'left',
          }}>
            <div style={{ fontWeight: 'bold', marginBottom: '0.15rem' }}>
              {t('teamSelection.botBehaviorTitle')}
            </div>
            <div style={{ whiteSpace: 'pre-line', lineHeight: 1.3, opacity: 0.9 }}>
              {t('teamSelection.botBehaviorDesc')}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      backgroundColor: 'rgba(15, 23, 42, 0.8)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '0.5rem',
    }}>
      <div style={{
        backgroundColor: 'white',
        borderRadius: '8px',
        width: '100%',
        maxWidth: '1000px',
        padding: compact ? '0.6rem' : '1rem',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
        maxHeight: compact ? '98vh' : '95vh',
        overflowY: 'auto',
      }}>
        {/* Nueva sección: Imagen y título */}
        <div style={{
          textAlign: 'center',
          marginBottom: compact ? '0.6rem' : '2rem',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: compact ? '0.4rem' : '1rem'
        }}>
          {/* La imagen de portada solo en escritorio: en móvil roba altura y obliga a hacer scroll */}
          {!currentTeam && !compact && (
            <img
              src="/mamvsreptiles.webp"
              alt="Mamíferos vs Reptiles"
              style={{
                maxWidth: '400px',
                width: '100%',
                height: 'auto',
                borderRadius: '12px',
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                animation: 'fadeIn 0.5s ease-out'
              }}
            />
          )}

          <h2 style={{
            textAlign: 'center',
            margin: 0,
            color: '#1f2937',
            fontSize: compact ? '1.05rem' : '1.5rem',
            fontWeight: 'bold',
          }}>
            {!currentTeam
              ? t('teamSelection.selectTeam')
              : !selectedCharacter
                ? `${t('teamSelection.selectCharacter')} - ${getTeamName(currentTeam)}`
                : t('teamSelection.prepareToPlay')}
          </h2>
        </div>

        {/* Contenido: en móvil apaisado con equipo elegido pasa a dos columnas
            (equipos a la izquierda, personaje y "listo" a la derecha) para que
            todo quepa sin scroll. */}
        <div style={{
          display: compact && currentTeam ? 'grid' : 'flex',
          gridTemplateColumns: compact && currentTeam ? '1fr 1.2fr' : undefined,
          alignItems: compact && currentTeam ? 'start' : undefined,
          flexDirection: 'column',
          gap: compact ? '0.6rem' : '1rem',
        }}>
          {/* Equipos */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: compact && currentTeam ? '1fr' : '1fr 1fr',
            gap: compact ? '0.6rem' : '1rem',
          }}>
            {/* Equipo Mammals */}
            <div style={{
              backgroundColor: '#f8fafc',
              padding: compact ? '0.6rem' : '1rem',
              borderRadius: '8px',
              border: '1px solid #e2e8f0',
              transition: 'all 0.3s ease',
              opacity: currentTeam === 'right' ? 0.7 : 1,
            }}>
              <div style={{
                textAlign: 'center',
                fontWeight: 'bold',
                color: '#3b82f6',
                marginBottom: '0.5rem',
                fontSize: '1rem',
              }}>
                {`${t('teamSelection.team')} ${t('teamSelection.mammals')} (${teams?.left?.length || 0}/${maxPlayersPerTeam})`}
              </div>
              <div style={{
                backgroundColor: 'white',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                padding: compact ? '0.25rem' : '0.5rem',
                marginBottom: '0.5rem',
                maxHeight: compact ? '92px' : '150px',
                overflowY: 'auto',
              }}>
                {teams?.left?.map(player => (
                  <div key={player.id} style={{
                    padding: '0.5rem',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    borderBottom: '1px solid #f3f4f6',
                    backgroundColor: player.name === playerName ? '#f0f9ff' : 'transparent',
                  }}>
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                    }}>
                      <span style={{
                        fontWeight: player.name === playerName ? 'bold' : 'normal',
                        color: '#1f2937',
                        fontSize: '0.875rem',
                      }}>
                        {player.name}
                        {player.name === playerName && ` (${t('teamSelection.you')})`}
                      </span>
                      {player.characterType && (
                        <small style={{
                          marginLeft: '0.25rem',
                          color: '#6b7280',
                          fontSize: '0.75rem',
                        }}>
                          ({teamCharacters['left'].find(c => c.id === player.characterType)?.name})
                        </small>
                      )}
                      {renderRenameBotButton(player)}
                    </div>
                    <span style={{
                      color: getReadyStatus('left', player.id) ? '#22c55e' : '#94a3b8',
                      fontSize: '0.875rem',
                      fontWeight: '500',
                    }}>
                      {getReadyStatus('left', player.id) ? '✓' : '○'}
                    </span>
                  </div>
                ))}
                {teams?.left?.length === 0 && (
                  <div style={{
                    textAlign: 'center',
                    color: '#94a3b8',
                    padding: '1rem',
                    fontSize: '0.875rem',
                  }}>
                    {t('teamSelection.noPlayers')}
                  </div>
                )}
              </div>
              {renderBotControls('left')}
              {currentTeam !== 'left' && !getReadyStatus(currentTeam, playerId) && (
                <button
                  onClick={() => onTeamSelect('left')}
                  disabled={teams?.left?.length >= maxPlayersPerTeam}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    backgroundColor: teams?.left?.length >= maxPlayersPerTeam ? '#94a3b8' : '#3b82f6',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: teams?.left?.length >= maxPlayersPerTeam ? 'not-allowed' : 'pointer',
                    fontSize: '1rem',
                    fontWeight: '500',
                    transition: 'all 0.2s ease',
                  }}
                >
                  {t('teamSelection.joinMammals')}

                </button>
              )}
            </div>

            {/* Equipo Reptiles */}
            <div style={{
              backgroundColor: '#f8fafc',
              padding: compact ? '0.6rem' : '1rem',
              borderRadius: '8px',
              border: '1px solid #e2e8f0',
              transition: 'all 0.3s ease',
              opacity: currentTeam === 'left' ? 0.7 : 1,
            }}>
              <div style={{
                textAlign: 'center',
                fontWeight: 'bold',
                color: '#ef4444',
                marginBottom: '0.5rem',
                fontSize: '1rem',
              }}>
                {`${t('teamSelection.team')} ${t('teamSelection.reptiles')} (${teams?.right?.length || 0}/${maxPlayersPerTeam})`}
              </div>
              <div style={{
                backgroundColor: 'white',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                padding: compact ? '0.25rem' : '0.5rem',
                marginBottom: '0.5rem',
                maxHeight: compact ? '92px' : '150px',
                overflowY: 'auto',
              }}>
                {teams?.right?.map(player => (
                  <div key={player.id} style={{
                    padding: '0.5rem',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    borderBottom: '1px solid #f3f4f6',
                    backgroundColor: player.name === playerName ? '#fff1f2' : 'transparent',
                  }}>
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                    }}>
                      <span style={{
                        fontWeight: player.name === playerName ? 'bold' : 'normal',
                        color: '#1f2937',
                        fontSize: '0.875rem',
                      }}>
                        {player.name}
                        {player.name === playerName && ` (${t('teamSelection.you')})`}
                      </span>
                      {player.characterType && (
                        <small style={{
                          marginLeft: '0.25rem',
                          color: '#6b7280',
                          fontSize: '0.75rem',
                        }}>
                          ({teamCharacters['right'].find(c => c.id === player.characterType)?.name})
                        </small>
                      )}
                      {renderRenameBotButton(player)}
                    </div>
                    <span style={{
                      color: getReadyStatus('right', player.id) ? '#22c55e' : '#94a3b8',
                      fontSize: '0.875rem',
                      fontWeight: '500',
                    }}>
                      {getReadyStatus('right', player.id) ? '✓' : '○'}
                    </span>
                  </div>
                ))}
                {teams?.right?.length === 0 && (
                  <div style={{
                    textAlign: 'center',
                    color: '#94a3b8',
                    padding: '1rem',
                    fontSize: '0.875rem',
                  }}>
                    {t('teamSelection.noPlayers')}
                  </div>
                )}
              </div>
              {renderBotControls('right')}
              {currentTeam !== 'right' && !getReadyStatus(currentTeam, playerId) && (
                <button
                  onClick={() => onTeamSelect('right')}
                  disabled={teams?.right?.length >= maxPlayersPerTeam}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    backgroundColor: teams?.right?.length >= maxPlayersPerTeam ? '#94a3b8' : '#ef4444',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: teams?.right?.length >= maxPlayersPerTeam ? 'not-allowed' : 'pointer',
                    fontSize: '1rem',
                    fontWeight: '500',
                    transition: 'all 0.2s ease',
                  }}
                >
                  {t('teamSelection.joinReptiles')}
                </button>
              )}
            </div>
          </div>

          {/* Selección de Personaje y Botón Ready */}
          {currentTeam && (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: compact ? '0.6rem' : '1rem',
            }}>
              <div style={{
                backgroundColor: '#f8fafc',
                padding: compact ? '0.6rem' : '1.5rem',
                borderRadius: '8px',
                border: '1px solid #e2e8f0',
              }}>
                <h3 style={{
                  textAlign: 'center',
                  marginBottom: compact ? '0.6rem' : '1.5rem',
                  color: getTeamColor(currentTeam),
                  fontSize: compact ? '0.95rem' : '1.25rem',
                  fontWeight: 'bold',
                }}>
                  {selectedCharacter
                    ? `${t('teamSelection.yourCharacter')}: ${teamCharacters[currentTeam].find(c => c.id === selectedCharacter)?.name}`
                    : `${t('teamSelection.selectCharacterPrompt')} ${getTeamName(currentTeam)}`}
                </h3>

                <div style={{
                  display: 'grid',
                  gridTemplateColumns: compact ? '1fr' : '1fr 1fr',
                  gap: compact ? '0.6rem' : '1.5rem',
                  maxWidth: '800px',
                  margin: '0 auto',
                  width: '100%',
                }}>
                  {teamCharacters[currentTeam].map(character => (
                    <div
                      key={character.id}
                      onClick={() => !getReadyStatus(currentTeam, playerId) && onCharacterSelect(character.id)}
                      style={{
                        backgroundColor: character.id === selectedCharacter ? '#f0f9ff' : 'white',
                        padding: compact ? '0.6rem' : '1rem',
                        borderRadius: '12px',
                        border: `2px solid ${character.id === selectedCharacter ? getTeamColor(currentTeam) : '#e2e8f0'}`,
                        cursor: getReadyStatus(currentTeam, playerId) ? 'not-allowed' : 'pointer',
                        transition: 'all 0.2s ease',
                        opacity: getReadyStatus(currentTeam, playerId) && character.id !== selectedCharacter ? 0.5 : 1,
                        textAlign: compact ? 'left' : 'center',
                        display: compact ? 'flex' : 'block',
                        gap: compact ? '0.6rem' : 0,
                        alignItems: compact ? 'center' : undefined,
                      }}
                    >
                      <CharacterThumbnail characterId={character.id} teamColor={getTeamColor(currentTeam)} compact={compact} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <h3 style={{
                          fontSize: compact ? '0.95rem' : '1.25rem',
                          fontWeight: 'bold',
                          marginTop: 0,
                          marginBottom: compact ? '0.15rem' : '0.5rem',
                          color: getTeamColor(currentTeam),
                        }}>
                          {character.name}
                        </h3>
                        {!compact && (
                          <p style={{
                            fontSize: '1rem',
                            color: '#6b7280',
                            margin: 0,
                          }}>
                            {character.description}
                          </p>
                        )}
                        <CharacterStats characterId={character.id} teamColor={getTeamColor(currentTeam)} compact={compact} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {selectedCharacter && (
                <div style={{
                  textAlign: 'center',
                  marginTop: compact ? 0 : '1rem',
                }}>
                  <button
                    onClick={onToggleReady}
                    style={{
                      padding: compact ? '0.55rem 1.5rem' : '0.75rem 2rem',
                      backgroundColor: getReadyStatus(currentTeam, playerId)
                        ? '#22c55e'
                        : '#eab308',
                      color: 'white',
                      border: 'none',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      fontSize: compact ? '1rem' : '1.125rem',
                      fontWeight: 'bold',
                      transition: 'all 0.2s',
                      boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                    }}
                  >
                    {getReadyStatus(currentTeam, playerId)
                      ? `🚫 ${t('teamSelection.cancel')}`
                      : `✓ ${t('teamSelection.ready')}`}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Mensaje de estado */}
          <div style={{
            textAlign: 'center',
            color: '#64748b',
            fontSize: compact ? '0.75rem' : '0.875rem',
            padding: compact ? '0.4rem' : '0.75rem',
            backgroundColor: 'rgba(241, 245, 249, 0.5)',
            borderRadius: '8px',
            marginTop: compact ? 0 : '0.5rem',
            gridColumn: compact && currentTeam ? '1 / -1' : undefined,
          }}>
            {!currentTeam
              ? t('teamSelection.selectTeamContinue')
              : !selectedCharacter
                ? `${t('teamSelection.selectCharacterPrompt')} ${getTeamName(currentTeam)}`
                : getReadyStatus(currentTeam, playerId)
                  ? t('teamSelection.waitingPlayers')
                  : t('teamSelection.pressReady')}
          </div>
        </div>

        {/* Estilos CSS */}
        <style>
          {`
            @keyframes fadeIn {
              from { 
                opacity: 0;
                transform: translateY(-20px);
              }
              to { 
                opacity: 1;
                transform: translateY(0);
              }
            }

            button:not(:disabled):hover {
              transform: scale(1.05) !important;
            }

            button:not(:disabled):active {
              transform: scale(0.95) !important;
            }

            .character-card {
              animation: fadeIn 0.3s ease-out;
            }

            /* Personalización del scrollbar */
            ::-webkit-scrollbar {
              width: 8px;
            }

            ::-webkit-scrollbar-track {
              background: #f1f1f1;
              border-radius: 4px;
            }

            ::-webkit-scrollbar-thumb {
              background: #888;
              border-radius: 4px;
            }

            ::-webkit-scrollbar-thumb:hover {
              background: #555;
            }
          `}
        </style>
      </div>
    </div>
  );
};

export default TeamSelectionScreen;