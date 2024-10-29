import React, { useState } from 'react';

const LoginScreen = ({ onJoin }) => {
    const [playerName, setPlayerName] = useState('');
    const [error, setError] = useState('');

    const handleSubmit = (e) => {
        e.preventDefault();
        if (playerName.trim().length < 2) {
            setError('El nombre debe tener al menos 2 caracteres');
            return;
        }
        if (playerName.trim().length > 15) {
            setError('El nombre no puede tener más de 15 caracteres');
            return;
        }
        onJoin(playerName.trim());
    };

    return (
        <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            zIndex: 10
        }}>
            <div style={{
                backgroundColor: 'white',
                padding: '20px',
                borderRadius: '8px',
                width: '300px'
            }}>
                <h2 style={{ textAlign: 'center', marginBottom: '20px' }}>
                    Unirse al juego
                </h2>
                <form onSubmit={handleSubmit}>
                    <input
                        type="text"
                        value={playerName}
                        onChange={(e) => setPlayerName(e.target.value)}
                        placeholder="Ingresa tu nombre"
                        style={{
                            width: '100%',
                            padding: '8px',
                            marginBottom: '10px',
                            borderRadius: '4px',
                            border: '1px solid #ccc'
                        }}
                    />
                    {error && (
                        <p style={{ color: 'red', fontSize: '14px', marginBottom: '10px' }}>
                            {error}
                        </p>
                    )}
                    <button
                        type="submit"
                        style={{
                            width: '100%',
                            padding: '10px',
                            backgroundColor: '#4CAF50',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer'
                        }}
                    >
                        Jugar
                    </button>
                </form>
            </div>
        </div>
    );
};

export default LoginScreen;