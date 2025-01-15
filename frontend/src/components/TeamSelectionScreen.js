import React from 'react';
import { useTranslation } from '../i18n/LanguageContext';

const TeamSelectionScreen = ({
  onTeamSelect,
  onCharacterSelect,
  teams,
  readyState,
  onToggleReady,
  currentTeam,
  playerName,
  gameInProgress,
  selectedCharacter
}) => {

  const { t } = useTranslation();
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

  const playerTeam = getPlayerTeam();
  const playerId = getCurrentPlayerId();

  const getTeamName = (team) => team === 'left' ? t('teamSelection.mammals') : t('teamSelection.reptiles');
  const getTeamColor = (team) => team === 'left' ? '#3b82f6' : '#ef4444';

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
        padding: '1rem',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
        maxHeight: '95vh',
        overflowY: 'auto',
      }}>
        {/* Nueva sección: Imagen y título */}
        <div style={{
          textAlign: 'center',
          marginBottom: '2rem',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '1rem'
        }}>
          {/* La imagen solo se muestra si no se ha seleccionado equipo */}
          {!currentTeam && (
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
            fontSize: '1.5rem',
            fontWeight: 'bold',
          }}>
            {!currentTeam
              ? t('teamSelection.selectTeam')
              : !selectedCharacter
                ? `${t('teamSelection.selectCharacter')} - ${getTeamName(currentTeam)}`
                : t('teamSelection.prepareToPlay')}
          </h2>
        </div>

        {/* Contenido existente */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem',
        }}>
          {/* Equipos */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '1rem',
          }}>
            {/* Equipo Mammals */}
            <div style={{
              backgroundColor: '#f8fafc',
              padding: '1rem',
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
                padding: '0.5rem',
                marginBottom: '0.5rem',
                maxHeight: '150px',
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
              {!currentTeam && (
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
              padding: '1rem',
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
                padding: '0.5rem',
                marginBottom: '0.5rem',
                maxHeight: '150px',
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
              {!currentTeam && (
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
            <>
              <div style={{
                backgroundColor: '#f8fafc',
                padding: '1.5rem',
                borderRadius: '8px',
                border: '1px solid #e2e8f0',
              }}>
                <h3 style={{
                  textAlign: 'center',
                  marginBottom: '1.5rem',
                  color: getTeamColor(currentTeam),
                  fontSize: '1.25rem',
                  fontWeight: 'bold',
                }}>
                  {selectedCharacter
                    ? `${t('teamSelection.yourCharacter')}: ${teamCharacters[currentTeam].find(c => c.id === selectedCharacter)?.name}`
                    : `${t('teamSelection.selectCharacterPrompt')} ${getTeamName(currentTeam)}`}
                </h3>

                <div style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '1.5rem',
                  maxWidth: '800px',
                  margin: '0 auto',
                }}>
                  {teamCharacters[currentTeam].map(character => (
                    <div
                      key={character.id}
                      onClick={() => !getReadyStatus(currentTeam, playerId) && onCharacterSelect(character.id)}
                      style={{
                        backgroundColor: character.id === selectedCharacter ? '#f0f9ff' : 'white',
                        padding: '1rem',
                        borderRadius: '12px',
                        border: `2px solid ${character.id === selectedCharacter ? getTeamColor(currentTeam) : '#e2e8f0'}`,
                        cursor: getReadyStatus(currentTeam, playerId) ? 'not-allowed' : 'pointer',
                        transition: 'all 0.2s ease',
                        opacity: getReadyStatus(currentTeam, playerId) && character.id !== selectedCharacter ? 0.5 : 1,
                        textAlign: 'center',
                      }}
                    >
                      <div style={{
                        width: '100%',
                        height: '200px',
                        backgroundColor: '#e5e7eb',
                        borderRadius: '8px',
                        marginBottom: '1rem',
                        backgroundImage: `url(/thumbnails/${character.id}.png)`,
                        backgroundSize: 'cover',
                        backgroundPosition: 'center',
                      }} />
                      <h3 style={{
                        fontSize: '1.25rem',
                        fontWeight: 'bold',
                        marginBottom: '0.5rem',
                        color: getTeamColor(currentTeam),
                      }}>
                        {character.name}
                      </h3>
                      <p style={{
                        fontSize: '1rem',
                        color: '#6b7280',
                        margin: 0,
                      }}>
                        {character.description}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              {selectedCharacter && (
                <div style={{
                  textAlign: 'center',
                  marginTop: '1rem',
                }}>
                  <button
                    onClick={onToggleReady}
                    style={{
                      padding: '0.75rem 2rem',
                      backgroundColor: getReadyStatus(currentTeam, playerId)
                        ? '#22c55e'
                        : '#eab308',
                      color: 'white',
                      border: 'none',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      fontSize: '1.125rem',
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
            </>
          )}

          {/* Mensaje de estado */}
          <div style={{
            textAlign: 'center',
            color: '#64748b',
            fontSize: '0.875rem',
            padding: '0.75rem',
            backgroundColor: 'rgba(241, 245, 249, 0.5)',
            borderRadius: '8px',
            marginTop: '0.5rem',
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