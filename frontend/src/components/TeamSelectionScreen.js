import React from 'react';

const TeamSelectionScreen = ({ onTeamSelect, teams }) => {
  const maxPlayersPerTeam = 3;
  
  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.8)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '1rem'
    }}>
      <div style={{
        backgroundColor: 'white',
        borderRadius: '8px',
        width: '100%',
        maxWidth: '600px',
        padding: '2rem'
      }}>
        <h2 style={{
          textAlign: 'center',
          marginTop: 0,
          marginBottom: '2rem'
        }}>
          Selecciona tu Equipo
        </h2>

        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '2rem'
        }}>
          {/* Equipo Izquierdo */}
          <div>
            <div style={{
              textAlign: 'center',
              fontWeight: 'bold',
              color: '#2563eb',
              marginBottom: '1rem'
            }}>
              Equipo Azul ({teams?.left?.length || 0}/{maxPlayersPerTeam})
            </div>
            <div style={{
              minHeight: '120px',
              border: '1px solid #e5e7eb',
              borderRadius: '4px',
              padding: '0.5rem',
              marginBottom: '1rem'
            }}>
              {teams?.left?.map(player => (
                <div key={player.id} style={{ padding: '0.25rem' }}>
                  {player.name}
                </div>
              ))}
            </div>
            <button
              onClick={() => onTeamSelect('left')}
              disabled={teams?.left?.length >= maxPlayersPerTeam}
              style={{
                width: '100%',
                padding: '0.5rem',
                backgroundColor: teams?.left?.length >= maxPlayersPerTeam ? '#94a3b8' : '#2563eb',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: teams?.left?.length >= maxPlayersPerTeam ? 'not-allowed' : 'pointer'
              }}
            >
              Unirse al Equipo Azul
            </button>
          </div>

          {/* Equipo Derecho */}
          <div>
            <div style={{
              textAlign: 'center',
              fontWeight: 'bold',
              color: '#dc2626',
              marginBottom: '1rem'
            }}>
              Equipo Rojo ({teams?.right?.length || 0}/{maxPlayersPerTeam})
            </div>
            <div style={{
              minHeight: '120px',
              border: '1px solid #e5e7eb',
              borderRadius: '4px',
              padding: '0.5rem',
              marginBottom: '1rem'
            }}>
              {teams?.right?.map(player => (
                <div key={player.id} style={{ padding: '0.25rem' }}>
                  {player.name}
                </div>
              ))}
            </div>
            <button
              onClick={() => onTeamSelect('right')}
              disabled={teams?.right?.length >= maxPlayersPerTeam}
              style={{
                width: '100%',
                padding: '0.5rem',
                backgroundColor: teams?.right?.length >= maxPlayersPerTeam ? '#94a3b8' : '#dc2626',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: teams?.right?.length >= maxPlayersPerTeam ? 'not-allowed' : 'pointer'
              }}
            >
              Unirse al Equipo Rojo
            </button>
          </div>
        </div>

        <div style={{
          textAlign: 'center',
          marginTop: '2rem',
          color: '#64748b',
          fontSize: '0.875rem'
        }}>
          {(teams?.left?.length > 0 || teams?.right?.length > 0) ? 
            "Esperando jugadores..." : 
            "Sé el primero en elegir equipo"
          }
        </div>
      </div>
    </div>
  );
};

export default TeamSelectionScreen;