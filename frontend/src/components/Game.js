import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import LoadingScreen from './LoadingScreen';
import LoginScreen from './LoginScreen';
import TeamSelectionScreen from './TeamSelectionScreen'
import MobileJoystick from './MobileJoystick';
import LanguageSelector from '../i18n/LanguageSelector';
import GameToast from './GameToast';
import VictoryScreen from './VictoryScreen';
import KickoffCountdown from './KickoffCountdown';
import { useTranslation } from '../i18n/LanguageContext';
import { useSearchParams } from 'react-router-dom';
import { useControls } from '../hooks/useControls';
import { useScene } from '../hooks/useScene';
import { useGameSocket } from '../hooks/useGameSocket';
import { initAudio, playGoal, playCrowdCheer, playWhistle, playBounce, playItem, playTackle, playMissileLaunch, playExplosion, toggleMuted, isMuted } from '../services/sound';

const MAX_CHAT_MESSAGES = 50;

const syncPlayerMeta = (metaRef, players) => {
    players.forEach((player) => {
        if (player?.id) {
            metaRef.current[player.id] = { ...metaRef.current[player.id], ...player };
        }
    });
};

const syncPlayerMetaFromTeams = (metaRef, teams) => {
    ['left', 'right'].forEach((side) => {
        (teams[side] || []).forEach((player) => {
            if (player?.id) {
                metaRef.current[player.id] = { ...metaRef.current[player.id], ...player, team: side };
            }
        });
    });
};

const Game = () => {
    const [searchParams, setSearchParams] = useSearchParams();

    // Get roomId from query parameter and validate (parametrizable por env)
    const roomParam = searchParams.get('room');
    const roomPrefix = process.env.REACT_APP_ROOM_PREFIX || 'room';
    const availableRooms = (process.env.REACT_APP_ROOMS || '1,2').split(',').map(s => `${roomPrefix}${s.trim()}`);
    const roomId = roomParam ? `${roomPrefix}${roomParam}` : null;

    const { t } = useTranslation();
    const canvasRef = useRef(null);
    const engineRef = useRef(null);
    const sceneRef = useRef(null);
    const socketRef = useRef(null);
    const playersRef = useRef({});
    const playersLabelsRef = useRef({}); // Referencia para las etiquetas de los jugadores
    const advancedTextureRef = useRef(null); // Referencia para la GUI
    const ballRef = useRef(null);
    const itemsRef = useRef({});
    const scoreTextRef = useRef(null);
    const staminaFillRef = useRef(null);
    const staminaContainerRef = useRef(null);
    const [muted, setMuted] = useState(isMuted());
    const [playerName, setPlayerName] = useState(null);
    const [isConnected, setIsConnected] = useState(false);
    const [sceneReady, setSceneReady] = useState(false);
    const [, setConnectedPlayers] = useState([]);
    const [chatMessages, setChatMessages] = useState([]);
    const [chatInput, setChatInput] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [hasJoined, setHasJoined] = useState(false);
    const [gameInProgress, setGameInProgress] = useState(false);
    const [score, setScore] = useState({ left: 0, right: 0 });
    const [matchTimeLeft, setMatchTimeLeft] = useState(null);
    const lastMatchSecondRef = useRef(null);
    const [ping, setPing] = useState(null);
    const [connectionStatus, setConnectionStatus] = useState('connected');
    const chargeFillRef = useRef(null);
    const chargeContainerRef = useRef(null);
    const fxRef = useRef(null); // Efectos de escena: sacudida de cámara, ráfagas de partículas
    const missilesRef = useRef({}); // Mallas de misiles teledirigidos en vuelo
    const missileIndicatorRef = useRef(null); // Badge 🚀 cuando llevas un misil armado

    const [showingEndMessage, setShowingEndMessage] = useState(false);

    // Feedback visual para goles
    const [goalFeedback, setGoalFeedback] = useState({ visible: false, team: null });
    const goalTimeoutRef = useRef(null);
    const confettiCanvasRef = useRef(null);
    const confettiAnimRef = useRef(null);
    const rootRef = useRef(null);
    const [shakeScreen, setShakeScreen] = useState(false);
    const isRedirectingRef = useRef(false);


    const startConfetti = useCallback((team) => {
        const canvas = confettiCanvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const w = canvas.width = window.innerWidth;
        const h = canvas.height = window.innerHeight;

        const colors = team === 'left'
            ? ['#3b82f6', '#60a5fa', '#93c5fd', '#1e40af']
            : ['#ef4444', '#f87171', '#fecaca', '#7f1d1d'];

        const particles = Array.from({ length: Math.min(200, Math.floor((w * h) / 20000)) }).map(() => ({
            x: Math.random() * w,
            y: -20 - Math.random() * 200,
            size: 4 + Math.random() * 6,
            speedY: 2 + Math.random() * 3,
            speedX: -2 + Math.random() * 4,
            rotation: Math.random() * Math.PI * 2,
            rotationSpeed: (-0.2 + Math.random() * 0.4),
            color: colors[Math.floor(Math.random() * colors.length)],
            shape: Math.random() > 0.5 ? 'rect' : 'circle'
        }));

        let start = performance.now();
        const duration = 1800; // ms

        const step = (t) => {
            const elapsed = t - start;
            ctx.clearRect(0, 0, w, h);
            particles.forEach(p => {
                p.x += p.speedX;
                p.y += p.speedY;
                p.rotation += p.rotationSpeed;
                if (p.y > h + 20) p.y = -20;
                if (p.x < -20) p.x = w + 20;
                if (p.x > w + 20) p.x = -20;
                ctx.save();
                ctx.translate(p.x, p.y);
                ctx.rotate(p.rotation);
                ctx.fillStyle = p.color;
                if (p.shape === 'rect') {
                    ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
                } else {
                    ctx.beginPath();
                    ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
                    ctx.fill();
                }
                ctx.restore();
            });
            if (elapsed < duration) {
                confettiAnimRef.current = requestAnimationFrame(step);
            } else {
                ctx.clearRect(0, 0, w, h);
                confettiAnimRef.current = null;
            }
        };

        if (confettiAnimRef.current) cancelAnimationFrame(confettiAnimRef.current);
        confettiAnimRef.current = requestAnimationFrame(step);
    }, []);

    // Añadir nuevo estado para el personaje
    const [selectedCharacter, setSelectedCharacter] = useState(null);

    // En Game.js, añade estos nuevos estados:
    const [teamSelected, setTeamSelected] = useState(false);
    const [teams, setTeams] = useState({ left: [], right: [] });
    const [currentTeam, setCurrentTeam] = useState(null);

    // Añadir estos estados que faltaban:
    const [gameStarted, setGameStarted] = useState(false);
    const [gameOverInfo, setGameOverInfo] = useState(null); // Store game over data (winner, final score)

    const [readyState, setReadyState] = useState({ left: [], right: [] });

    // Añadir nueva referencia para el CharacterManager
    const characterManagerRef = useRef(null);

    const controlEffectsRef = useRef(null);
    const playerMetaRef = useRef({});


    // Añadir detección de dispositivo móvil
    const [isMobile, setIsMobile] = useState(false);


    const [chatExpanded, setChatExpanded] = useState(true);
    const [toast, setToast] = useState({ message: null, type: 'error' });
    const [kickoffEndsAt, setKickoffEndsAt] = useState(null);
    // Ayuda móvil: visible solo unos segundos al empezar, para despejar la pantalla.
    const [showMobileHelp, setShowMobileHelp] = useState(true);

    const sceneReadyRef = useRef(false);
    const isMobileRef = useRef(false);

    useEffect(() => { sceneReadyRef.current = sceneReady; }, [sceneReady]);
    useEffect(() => { isMobileRef.current = isMobile; }, [isMobile]);

    const chatInputFocusRef = useRef(false);
    const chatMessagesRef = useRef(null);
    const [isMobileChatExpanded, setIsMobileChatExpanded] = useState(false);

    const { handleDirectionChange, resetMovement } = useControls({
        socketRef,
        gameStarted,
        isConnected,
        chatInputFocusRef,
    });

    const handleToggleReady = useCallback(() => {
        if (socketRef.current) {
            socketRef.current.emit('toggleReady');
        }
    }, []);
    const showingEndMessageRef = useRef(false);
    useEffect(() => { showingEndMessageRef.current = showingEndMessage; }, [showingEndMessage]);

    const sceneRefs = useMemo(() => ({
        engineRef,
        sceneRef,
        socketRef,
        playersRef,
        playersLabelsRef,
        advancedTextureRef,
        ballRef,
        itemsRef,
        scoreTextRef,
        characterManagerRef,
        controlEffectsRef,
        playerMetaRef,
        sceneReadyRef,
        isMobileRef,
        setConnectedPlayers,
        staminaFillRef,
        staminaContainerRef,
        setMatchTimeLeft,
        lastMatchSecondRef,
        chargeFillRef,
        chargeContainerRef,
        fxRef,
        missilesRef,
        missileIndicatorRef,
    }), [setConnectedPlayers]);

    const onSceneReady = useCallback(() => setSceneReady(true), []);
    const onLoadComplete = useCallback(() => setIsLoading(false), []);

    const { createScene, updateGameState } = useScene(sceneRefs, isMobileRef, {
        onSceneReady,
        onLoadComplete,
    });

    const socketCallbacksRef = useRef({});
    socketCallbacksRef.current = {
        onConnected: () => setIsConnected(true),
        onConnectError: () => setIsConnected(false),
        onTeamSelected: ({ team }) => {
            setCurrentTeam(team);
            setTeamSelected(true);
            setSelectedCharacter(null);
            if (socketRef.current?.id) {
                playerMetaRef.current[socketRef.current.id] = {
                    ...playerMetaRef.current[socketRef.current.id],
                    team,
                    characterType: undefined,
                };
            }
        },
        onCharacterSelected: ({ characterType }) => {
            setSelectedCharacter(characterType);
            if (socketRef.current?.id) {
                playerMetaRef.current[socketRef.current.id] = {
                    ...playerMetaRef.current[socketRef.current.id],
                    characterType,
                };
            }
        },
        onTeamUpdate: (teams) => {
            syncPlayerMetaFromTeams(playerMetaRef, teams);
            setTeams(teams);
        },
        onReadyUpdate: setReadyState,
        onGameStart: () => {
            setShowingEndMessage(false);
            setGameOverInfo(null);
            setGameStarted(true);
            setGameInProgress(true);
        },
        onPing: (rtt) => setPing((prev) => (prev == null || Math.abs(prev - rtt) >= 8 ? rtt : prev)),
        onConnectionStatus: (status) => {
            setConnectionStatus(status);
            setIsConnected(status === 'connected');
        },
        onGoalScored: ({ team, score: newScore, scorerName, ownGoal }) => {
            setScore(newScore);
            playGoal();
            playCrowdCheer();
            fxRef.current?.goalBurst?.(team);
            scoreTextRef.current?.pulse?.(team);
            if (scorerName) {
                const label = ownGoal
                    ? `${t('gameUI.ownGoal')}: ${scorerName}`
                    : `${t('gameUI.goalBy')}: ${scorerName}`;
                setToast({ message: label, type: 'info' });
            }
            if (scoreTextRef.current) {
                scoreTextRef.current.left.text = (newScore.left || 0).toString();
                scoreTextRef.current.right.text = (newScore.right || 0).toString();
            }
            setGoalFeedback({ visible: true, team });
            setShakeScreen(true);
            setTimeout(() => setShakeScreen(false), 500);
            startConfetti(team);
            if (goalTimeoutRef.current) clearTimeout(goalTimeoutRef.current);
            goalTimeoutRef.current = setTimeout(() => {
                setGoalFeedback({ visible: false, team: null });
                goalTimeoutRef.current = null;
            }, 2200);
        },
        onGameOver: (gameOverData) => {
            setGameStarted(false);
            setGameInProgress(false);
            setKickoffEndsAt(null);
            setMatchTimeLeft(null);
            lastMatchSecondRef.current = null;
            if (gameOverData) {
                setGameOverInfo(gameOverData);
                setShowingEndMessage(true);
            }
        },
        onScoreUpdate: setScore,
        onGameStateInfo: ({ currentState, kickoffInMs }) => {
            setGameInProgress(currentState === 'playing');
            if (kickoffInMs) {
                setKickoffEndsAt(Date.now() + kickoffInMs);
                playWhistle();
            }
            if (currentState === 'waiting') {
                setTimeout(() => {
                    if (showingEndMessageRef.current) return;
                    setShowingEndMessage(false);
                    setGameStarted(false);
                    setScore({ left: 0, right: 0 });
                    setGameOverInfo(null);
                    setKickoffEndsAt(null);
                }, 100);
            }
        },
        onBallBounce: () => playBounce(),
        onItemCollected: ({ type, playerId } = {}) => {
            playItem();
            if (type === 'missile' && playerId === socketRef.current?.id) {
                setToast({ message: t('gameUI.missileReady'), type: 'info' });
            }
        },
        onBallSteal: () => playTackle(),
        onMissileLaunched: ({ targetId, targetName } = {}) => {
            playMissileLaunch();
            const isMe = targetId === socketRef.current?.id;
            setToast({
                message: isMe ? t('gameUI.missileIncoming') : `${t('gameUI.missileAt')} ${targetName}`,
                type: isMe ? 'error' : 'info',
            });
        },
        onMissileHit: ({ x, z } = {}) => {
            playExplosion();
            if (typeof x === 'number' && typeof z === 'number') {
                fxRef.current?.explosionBurst?.({ x, y: 1, z });
            }
        },
        onChatUpdate: (message) => setChatMessages((prev) => [...prev.slice(-(MAX_CHAT_MESSAGES - 1)), message]),
        onPlayersListUpdate: (list) => {
            syncPlayerMeta(playerMetaRef, list);
            setConnectedPlayers(list);
        },
        onError: (message) => setToast({ message, type: 'error' }),
    };

    const { handleTeamSelect } = useGameSocket({
        roomId,
        hasJoined,
        playerName,
        createScene,
        updateGameState,
        refs: {
            socketRef,
            canvasRef,
            engineRef,
            sceneRef,
            showingEndMessageRef,
            goalTimeoutRef,
            scoreTextRef,
        },
        callbacksRef: socketCallbacksRef,
    });

    const handleJoinGame = (name) => {
        initAudio(); // Unlock Web Audio within the user gesture (click on Play).
        socketRef.current.emit('joinGame', { name: name.trim(), roomId });
        setPlayerName(name);
        setHasJoined(true);
    };

    const handleToggleMute = useCallback(() => {
        initAudio();
        setMuted(toggleMuted());
    }, []);

    const handleAddBot = useCallback((team) => {
        socketRef.current?.emit('addBot', { team });
    }, []);

    const handleRemoveBot = useCallback((team) => {
        socketRef.current?.emit('removeBot', { team });
    }, []);

    const handleRenameBot = useCallback((botId, name) => {
        socketRef.current?.emit('renameBot', { botId, name });
    }, []);

    // Al terminar una partida, volver a la pantalla de selección conservando
    // equipo y personaje. El usuario solo pulsa "Listo" de nuevo (o cambia su
    // selección si quiere). No se fuerza a reelegir.
    const handleContinue = useCallback(() => {
        setShowingEndMessage(false);
        setGameOverInfo(null);
        setGameStarted(false);
        setGameInProgress(false);
        setScore({ left: 0, right: 0 });
        resetMovement();
    }, [resetMovement]);

    const scrollToBottom = () => {
        if (chatMessagesRef.current) {
            const scrollHeight = chatMessagesRef.current.scrollHeight;
            const height = chatMessagesRef.current.clientHeight;
            const maxScrollTop = scrollHeight - height;
            chatMessagesRef.current.scrollTop = maxScrollTop > 0 ? maxScrollTop : 0;
        }
    };

    // const handleChatToggle = () => {
    //     setChatVisible(!chatVisible);
    // };

    // Validate room and redirect if invalid (usa REACT_APP_ROOMS)
    useEffect(() => {
        const isValidRoom = !!roomId && availableRooms.includes(roomId);

        if (!isValidRoom) {
            const firstRoom = (process.env.REACT_APP_ROOMS || '1,2').split(',')[0].trim();
            isRedirectingRef.current = true;
            setSearchParams({ room: firstRoom || '1' });
            return;
        }

        isRedirectingRef.current = false;
    }, [roomId, setSearchParams, availableRooms, roomPrefix]);

    useEffect(() => {
        if (!gameStarted || !isMobile) return undefined;
        setShowMobileHelp(true);
        const timer = setTimeout(() => setShowMobileHelp(false), 8000);
        return () => clearTimeout(timer);
    }, [gameStarted, isMobile]);

    useEffect(() => {
        const checkMobile = () => {
            setIsMobile(window.innerWidth <= 768);
        };

        checkMobile();
        window.addEventListener('resize', checkMobile);
        return () => window.removeEventListener('resize', checkMobile);
    }, []);

    // Añadir también un useEffect para manejar la visibilidad de la página
    useEffect(() => {
        const handleVisibilityChange = () => {
            if (document.hidden && socketRef.current) {
                resetMovement();
                socketRef.current.volatile.emit('playerMove', { x: 0, z: 0 });
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [resetMovement]);

    // Añadir este useEffect después de los otros
    useEffect(() => {
        scrollToBottom();
    }, [chatMessages]); // Se ejecutará cada vez que chatMessages cambie

    const handleChatSubmit = (e) => {
        e.preventDefault();
        if (chatInput.trim() && socketRef.current) {
            socketRef.current.emit('chatMessage', chatInput);
            setChatInput('');
            setTimeout(scrollToBottom, 100);
        }
    };

    // Show loading or error state if no valid room
    if (!roomId) {
        return (
            <div style={{
                position: 'fixed',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                textAlign: 'center',
                color: 'white',
                backgroundColor: 'rgba(0, 0, 0, 0.8)',
                padding: '20px',
                borderRadius: '8px'
            }}>
                <h2>Error</h2>
                <p>Redirigiendo a una sala válida...</p>
            </div>
        );
    }

    return (
        <div ref={rootRef} style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            overflow: 'hidden',
            WebkitTapHighlightColor: 'transparent',
            animation: shakeScreen ? 'screenShake 0.5s ease' : 'none',
            WebkitTouchCallout: 'none',
            userSelect: 'none',
            touchAction: 'none',
        }}>
            <GameToast
                message={toast.message}
                type={toast.type}
                onDismiss={() => setToast({ message: null, type: 'error' })}
            />


            {/* Selector de idioma: oculto en móvil durante el partido (despeja la esquina) */}
            {!(isMobile && gameStarted) && <LanguageSelector />}

            {/* Botón de silencio (sonido del juego) */}
            <button
                onClick={handleToggleMute}
                aria-label={muted ? t('gameUI.unmute') : t('gameUI.mute')}
                title={muted ? t('gameUI.unmute') : t('gameUI.mute')}
                style={{
                    position: 'absolute',
                    top: '10px',
                    right: isMobile && gameStarted ? '64px' : '96px',
                    zIndex: 1000,
                    width: '34px',
                    height: '34px',
                    borderRadius: '6px',
                    border: '1px solid rgba(255,255,255,0.3)',
                    backgroundColor: 'rgba(0, 0, 0, 0.55)',
                    color: 'white',
                    fontSize: '16px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                }}
            >
                {muted ? '🔇' : '🔊'}
            </button>

            {isLoading && <LoadingScreen />}

            {!isLoading && !hasJoined && (
                <LoginScreen onJoin={handleJoinGame} />
            )}

            {!isLoading && hasJoined && !gameStarted && !showingEndMessage && (
                <div style={{ maxHeight: '100%', overflow: 'auto' }}>
                    <TeamSelectionScreen
                        debug={true}
                        onTeamSelect={handleTeamSelect}
                        onCharacterSelect={(characterType) => {
                            if (socketRef.current?.connected) {
                                setSelectedCharacter(characterType);
                                socketRef.current.emit('selectCharacter', { characterType });
                            }
                        }}
                        teams={teams}
                        readyState={readyState}
                        onToggleReady={handleToggleReady}
                        onAddBot={handleAddBot}
                        onRemoveBot={handleRemoveBot}
                        onRenameBot={handleRenameBot}
                        currentTeam={currentTeam}
                        playerName={playerName}
                        gameInProgress={gameInProgress}
                        selectedCharacter={selectedCharacter}
                        isMobile={isMobile}
                    />
                </div>
            )}

            <canvas
                ref={canvasRef}
                style={{
                    width: '100%',
                    height: '100%',
                    display: 'block',
                    touchAction: 'none'
                }}
            />

            {kickoffEndsAt && gameStarted && (
                <KickoffCountdown kickoffEndsAt={kickoffEndsAt} isMobile={isMobile} />
            )}

            {/* Indicador de ping / estado de conexión */}
            {hasJoined && (
                <div style={{
                    position: 'absolute',
                    bottom: isMobile ? '4px' : '6px',
                    right: '6px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px',
                    backgroundColor: 'rgba(0,0,0,0.55)',
                    padding: '3px 8px',
                    borderRadius: '6px',
                    fontSize: '11px',
                    fontVariantNumeric: 'tabular-nums',
                    color: 'white',
                    zIndex: 55,
                    pointerEvents: 'none',
                }}>
                    {connectionStatus === 'reconnecting' ? (
                        <span style={{ color: '#fbbf24' }}>{t('gameUI.reconnecting')}</span>
                    ) : connectionStatus === 'disconnected' ? (
                        <span style={{ color: '#ef4444' }}>{t('gameUI.disconnected')}</span>
                    ) : (
                        <>
                            <span style={{
                                width: '8px',
                                height: '8px',
                                borderRadius: '50%',
                                backgroundColor: ping == null ? '#9ca3af' : ping < 80 ? '#22c55e' : ping < 160 ? '#fbbf24' : '#ef4444',
                            }} />
                            <span>{ping == null ? '—' : `${ping} ms`}</span>
                        </>
                    )}
                </div>
            )}

            {/* Temporizador de partido */}
            {gameStarted && teamSelected && matchTimeLeft != null && (
                <div style={{
                    position: 'absolute',
                    // Placed below the scoreboard (desktop Babylon board / mobile HUD)
                    // so the match clock never overlaps the score.
                    top: '58px',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    backgroundColor: matchTimeLeft <= 10 ? 'rgba(239, 68, 68, 0.85)' : 'rgba(0, 0, 0, 0.6)',
                    color: 'white',
                    padding: isMobile ? '2px 10px' : '4px 14px',
                    borderRadius: '8px',
                    fontSize: isMobile ? '16px' : '20px',
                    fontWeight: 800,
                    fontVariantNumeric: 'tabular-nums',
                    letterSpacing: '1px',
                    zIndex: 60,
                    pointerEvents: 'none',
                    boxShadow: '0 2px 10px rgba(0,0,0,0.3)',
                }}>
                    {`${Math.floor(matchTimeLeft / 60)}:${String(matchTimeLeft % 60).padStart(2, '0')}`}
                </div>
            )}

            {/* Barra de carga de disparo — visible solo al controlar el balón */}
            {gameStarted && teamSelected && (
                <div
                    ref={chargeContainerRef}
                    style={{
                        position: 'absolute',
                        // Móvil: columna a la izquierda, sobre el joystick (no tapa el centro).
                        bottom: isMobile ? '224px' : '54px',
                        left: isMobile ? '30px' : '50%',
                        transform: isMobile ? 'none' : 'translateX(-50%)',
                        width: isMobile ? '140px' : '220px',
                        zIndex: 50,
                        pointerEvents: 'none',
                        display: 'none'
                    }}
                >
                    <div style={{
                        fontSize: '10px',
                        color: 'white',
                        textAlign: 'center',
                        marginBottom: '3px',
                        letterSpacing: '1px',
                        textShadow: '0 1px 2px rgba(0,0,0,0.6)'
                    }}>
                        {t('gameUI.shotPower')}
                    </div>
                    <div style={{
                        height: '10px',
                        background: 'rgba(0,0,0,0.5)',
                        borderRadius: '6px',
                        overflow: 'hidden',
                        border: '1px solid rgba(255,255,255,0.25)'
                    }}>
                        <div
                            ref={chargeFillRef}
                            style={{
                                height: '100%',
                                width: '0%',
                                background: 'linear-gradient(90deg, #f59e0b, #ef4444)',
                                transition: 'width 0.1s linear'
                            }}
                        />
                    </div>
                </div>
            )}

            {/* Barra de Stamina (sprint) — actualizada vía ref desde updateGameState */}
            {gameStarted && teamSelected && (
                <div
                    ref={staminaContainerRef}
                    style={{
                        position: 'absolute',
                        bottom: isMobile ? '190px' : '22px',
                        left: isMobile ? '30px' : '50%',
                        transform: isMobile ? 'none' : 'translateX(-50%)',
                        width: isMobile ? '140px' : '220px',
                        zIndex: 50,
                        pointerEvents: 'none',
                        display: 'none'
                    }}
                >
                    <div style={{
                        fontSize: '10px',
                        color: 'white',
                        textAlign: 'center',
                        marginBottom: '3px',
                        letterSpacing: '1px',
                        textShadow: '0 1px 2px rgba(0,0,0,0.6)'
                    }}>
                        {t('gameUI.stamina')}
                    </div>
                    <div style={{
                        height: '10px',
                        background: 'rgba(0,0,0,0.5)',
                        borderRadius: '6px',
                        overflow: 'hidden',
                        border: '1px solid rgba(255,255,255,0.25)'
                    }}>
                        <div
                            ref={staminaFillRef}
                            style={{
                                height: '100%',
                                width: '100%',
                                background: 'linear-gradient(90deg, #22c55e, #86efac)',
                                transition: 'width 0.1s linear, background 0.2s'
                            }}
                        />
                    </div>
                </div>
            )}

            {/* Badge de misil armado — visible mientras llevas el power-up (vía ref) */}
            {gameStarted && teamSelected && (
                <div
                    ref={missileIndicatorRef}
                    style={{
                        position: 'absolute',
                        // Móvil: sobre el botón KICK; desktop: a la derecha de la barra de stamina.
                        bottom: isMobile ? '135px' : '18px',
                        right: isMobile ? '30px' : 'auto',
                        left: isMobile ? 'auto' : 'calc(50% + 125px)',
                        width: '38px',
                        height: '38px',
                        borderRadius: '50%',
                        backgroundColor: 'rgba(0, 0, 0, 0.65)',
                        border: '2px solid rgba(255, 140, 50, 0.9)',
                        boxShadow: '0 0 12px rgba(255, 120, 30, 0.7)',
                        fontSize: '20px',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 55,
                        pointerEvents: 'none',
                        display: 'none'
                    }}
                >
                    🚀
                </div>
            )}

            {/* Overlay de Gol */}
            {goalFeedback.visible && (
                <div style={{
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%) scale(1)',
                    color: 'white',
                    backgroundColor: goalFeedback.team === 'left' ? 'rgba(59, 130, 246, 0.85)' : 'rgba(239, 68, 68, 0.85)',
                    padding: isMobile ? '12px 20px' : '18px 28px',
                    borderRadius: '12px',
                    fontSize: isMobile ? '28px' : '40px',
                    fontWeight: 800,
                    letterSpacing: '2px',
                    boxShadow: '0 8px 30px rgba(0,0,0,0.35)',
                    zIndex: 100,
                    backdropFilter: 'blur(2px)',
                    pointerEvents: 'none',
                    animation: 'goalPop 0.4s ease-out, goalFade 2.2s ease-in forwards'
                }}>
                    {t('gameUI.goal') || 'GOAL!'}
                    <div style={{
                        marginTop: isMobile ? '6px' : '8px',
                        fontSize: isMobile ? '12px' : '14px',
                        opacity: 0.9
                    }}>
                        {goalFeedback.team === 'left' ? (t('teamSelection.mammals') || 'Mammals') : (t('teamSelection.reptiles') || 'Reptiles')}
                    </div>
                </div>
            )}

            {/* Canvas de confeti */}
            <canvas
                ref={confettiCanvasRef}
                style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%',
                    pointerEvents: 'none',
                    zIndex: 90
                }}
            />

            {!isLoading && hasJoined && teamSelected && (
                isMobile ? (
                    // Layout móvil
                    <>
                        {/* Scoreboard y status */}
                        <div style={{
                            position: 'absolute',
                            top: '8px',
                            left: '0',
                            right: '0',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            gap: '8px',
                            zIndex: 10
                        }}>

                            {/* Lista de jugadores móvil */}
                            <div style={{
                                position: 'absolute',
                                top: '8px',
                                left: '8px',
                                backgroundColor: 'rgba(0, 0, 0, 0.6)',
                                padding: '8px',
                                borderRadius: '8px',
                                fontSize: '10px',
                                zIndex: 10
                            }}>
                                <div style={{
                                    color: '#3b82f6',
                                    marginBottom: '4px'
                                }}>
                                    {teams.left.map(player => (
                                        <div key={player.id}>{player.name}</div>
                                    ))}
                                </div>
                                <div style={{
                                    color: '#ef4444'
                                }}>
                                    {teams.right.map(player => (
                                        <div key={player.id}>{player.name}</div>
                                    ))}
                                </div>
                            </div>


                            {/* Marcador */}
                            <div style={{
                                backgroundColor: 'rgba(0, 0, 0, 0.6)',
                                padding: '8px 16px',
                                borderRadius: '8px',
                                display: 'flex',
                                gap: '16px',
                                alignItems: 'center'
                            }}>
                                <span key={`score-l-${score.left}`} style={{ color: '#3b82f6', fontSize: '24px', display: 'inline-block', animation: 'scorePop 0.5s ease' }}>
                                    {score.left}
                                </span>
                                <span style={{ color: 'white', fontSize: '24px' }}>-</span>
                                <span key={`score-r-${score.right}`} style={{ color: '#ef4444', fontSize: '24px', display: 'inline-block', animation: 'scorePop 0.5s ease' }}>
                                    {score.right}
                                </span>
                            </div>
                        </div>



                        {/* Instrucciones móviles: se ocultan solas a los pocos segundos */}
                        {showMobileHelp && (
                            <div style={{
                                position: 'absolute',
                                top: '120px',
                                left: '50%',
                                transform: 'translateX(-50%)',
                                backgroundColor: 'rgba(0, 0, 0, 0.6)',
                                padding: '8px 16px',
                                borderRadius: '8px',
                                color: 'white',
                                fontSize: '12px',
                                textAlign: 'center',
                                zIndex: 10,
                                opacity: 0.8,
                                pointerEvents: 'none',
                                maxWidth: '85vw'
                            }}>
                                <h3 style={{ margin: '0 0 8px 0' }}>{t('gameUI.controls')}</h3>
                                <p style={{ margin: '0 0 4px 0' }}>{t('gameUI.mobileMovementInstructions')}</p>
                                <p style={{ margin: '0 0 4px 0' }}>{t('gameUI.mobileChatInstructions')}</p>
                                <p style={{ margin: '0' }}>{t('gameUI.mobileSprintInstructions')}</p>
                            </div>
                        )}

                        {/* Joystick */}
                        {/* Mobile Controls - Joystick & Kick Button */}
                        {gameStarted && (
                                <MobileJoystick
                                    onDirectionChange={(vector) => {
                                        handleDirectionChange(vector);
                                    }}
                                    onBallControlChange={(control) => {
                                        if (socketRef.current) {
                                            // Non-volatile: possession events must reach the server reliably.
                                            socketRef.current.emit('ballControl', { control });
                                        }
                                    }}
                                />
                        )}

                        {/* Chat minimizable móvil - movido a esquina superior derecha */}
                        <div style={{
                            position: 'fixed',
                            top: isMobileChatExpanded ? '60px' : '10px',
                            right: '10px',
                            width: isMobileChatExpanded ? '85%' : '44px',
                            height: isMobileChatExpanded ? '200px' : '44px',
                            maxWidth: '320px',
                            backgroundColor: 'rgba(0, 0, 0, 0.7)',
                            borderRadius: '12px',
                            zIndex: 1002,
                            transition: 'all 0.3s ease',
                            display: 'flex',
                            flexDirection: 'column',
                            boxShadow: '0 4px 15px rgba(0,0,0,0.3)'
                        }}>
                            <button
                                onClick={() => setIsMobileChatExpanded(!isMobileChatExpanded)}
                                style={{
                                    width: '100%',
                                    height: isMobileChatExpanded ? '40px' : '100%',
                                    padding: '8px',
                                    color: 'white',
                                    fontSize: '16px',
                                    textAlign: 'center',
                                    backgroundColor: 'transparent',
                                    border: 'none',
                                    borderBottom: isMobileChatExpanded ? '1px solid rgba(255, 255, 255, 0.1)' : 'none',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center'
                                }}
                            >
                                {isMobileChatExpanded ? t('gameUI.chat') : '💬'}
                            </button>

                            {isMobileChatExpanded && (
                                <>
                                    <div style={{
                                        height: '160px',
                                        overflowY: 'auto',
                                        padding: '8px'
                                    }}>
                                        {chatMessages.map((msg, index) => {
                                            const messageColor = teams.left.find(p => p.id === msg.playerId)
                                                ? '#3b82f6'
                                                : teams.right.find(p => p.id === msg.playerId)
                                                    ? '#ef4444'
                                                    : '#4CAF50';

                                            return (
                                                <div
                                                    key={index}
                                                    style={{
                                                        marginBottom: '4px',
                                                        wordBreak: 'break-word',
                                                        fontSize: '14px',
                                                        color: 'white'
                                                    }}
                                                >
                                                    <strong style={{ color: messageColor }}>{msg.playerName}: </strong>
                                                    {msg.message}
                                                </div>
                                            );
                                        })}
                                    </div>
                                    <form
                                        onSubmit={handleChatSubmit}
                                        style={{
                                            display: 'flex',
                                            padding: '8px',
                                            gap: '4px'
                                        }}
                                    >
                                        <input
                                            type="text"
                                            value={chatInput}
                                            onChange={(e) => setChatInput(e.target.value)}
                                            onFocus={() => { chatInputFocusRef.current = true; }}
                                            onBlur={() => { chatInputFocusRef.current = false; }}
                                            style={{
                                                flex: 1,
                                                padding: '6px',
                                                borderRadius: '4px',
                                                border: 'none',
                                                backgroundColor: 'rgba(255, 255, 255, 0.05)',
                                                color: 'white',
                                                fontSize: '12px'
                                            }}
                                            placeholder={t('gameUI.chatPlaceholder')}
                                        />
                                        <button
                                            type="submit"
                                            style={{
                                                padding: '6px 12px',
                                                borderRadius: '4px',
                                                border: 'none',
                                                backgroundColor: '#4CAF50',
                                                color: 'white',
                                                cursor: 'pointer'
                                            }}
                                        >
                                            →
                                        </button>
                                    </form>
                                </>
                            )}
                        </div>
                    </>
                ) : (
                    // Layout desktop original
                    <>
                        {/* Panel Superior */}
                        <div style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            right: 0,
                            padding: '10px',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'flex-start',
                            pointerEvents: 'none'
                        }}>
                            {/* Lista de Jugadores por Equipo */}
                            <div style={{
                                color: 'white',
                                fontSize: '14px',
                                backgroundColor: 'rgba(0, 0, 0, 0.6)',
                                padding: '10px',
                                borderRadius: '8px',
                                maxWidth: '200px',
                                pointerEvents: 'auto'
                            }}>
                                <h3 style={{ margin: '0 0 8px 0' }}>{t('gameUI.players')}</h3>
                                {/* Equipo Mamíferos */}
                                <div style={{ marginBottom: '10px' }}>
                                    <h4 style={{
                                        margin: '0 0 4px 0',
                                        color: '#3b82f6'
                                    }}>
                                        {`${t('teamSelection.team')} ${t('teamSelection.mammals')}`}
                                    </h4>
                                    <ul style={{
                                        listStyleType: 'none',
                                        padding: 0,
                                        margin: 0
                                    }}>
                                        {teams.left.map(player => (
                                            <li key={player.id} style={{ marginBottom: '2px' }}>
                                                {player.name}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                                {/* Equipo Reptiles */}
                                <div>
                                    <h4 style={{
                                        margin: '0 0 4px 0',
                                        color: '#ef4444'
                                    }}>
                                        {`${t('teamSelection.team')} ${t('teamSelection.reptiles')}`}
                                    </h4>
                                    <ul style={{
                                        listStyleType: 'none',
                                        padding: 0,
                                        margin: 0
                                    }}>
                                        {teams.right.map(player => (
                                            <li key={player.id} style={{ marginBottom: '2px' }}>
                                                {player.name}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            </div>

                            {/* Instrucciones */}
                            <div style={{
                                color: 'white',
                                fontSize: '14px',
                                backgroundColor: 'rgba(0, 0, 0, 0.6)',
                                padding: '10px',
                                borderRadius: '8px',
                                pointerEvents: 'auto'
                            }}>
                                <h3 style={{ margin: '0 0 8px 0' }}>{t('gameUI.controls')}</h3>
                                <p style={{ margin: '0 0 4px 0' }}>
                                    {isMobile
                                        ? t('gameUI.mobileMovementInstructions')
                                        : t('gameUI.moveInstructions')}
                                </p>
                                <p style={{ margin: '0 0 4px 0' }}>
                                    {isMobile
                                        ? t('gameUI.mobileChatInstructions')
                                        : t('gameUI.ballControlInstructions')}
                                </p>
                                <p style={{ margin: '0 0 4px 0' }}>
                                    {isMobile
                                        ? t('gameUI.mobileSprintInstructions')
                                        : t('gameUI.sprintInstructions')}
                                </p>
                                <p style={{ margin: '0' }}>
                                    {isMobile ? '' : t('gameUI.enterToSend')}
                                </p>
                            </div>
                        </div>

                        {/* Panel Inferior */}
                        <div style={{
                            position: 'absolute',
                            bottom: 0,
                            left: 0,
                            right: 0,
                            padding: '10px',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'flex-end',
                            pointerEvents: 'none'
                        }}>
                            {/* Info del Jugador y Conexión */}
                            <div style={{
                                display: 'flex',
                                gap: '10px',
                                pointerEvents: 'auto'
                            }}>
                                <div style={{
                                    color: 'white',
                                    fontSize: '14px',
                                    backgroundColor: 'rgba(0, 0, 0, 0.6)',
                                    padding: '8px 12px',
                                    borderRadius: '8px',
                                    display: 'flex',
                                    alignItems: 'center'
                                }}>
                                    {playerName || t('gameUI.unknown')}
                                    <span style={{
                                        marginLeft: '8px',
                                        color: currentTeam === 'left' ? '#3b82f6' : '#ef4444'
                                    }}>
                                        {currentTeam === 'left' ? t('teamSelection.mammals') : t('teamSelection.reptiles')}
                                    </span>
                                </div>
                                <div style={{
                                    color: 'white',
                                    fontSize: '14px',
                                    backgroundColor: isConnected ? 'rgba(39, 174, 96, 0.6)' : 'rgba(231, 76, 60, 0.6)',
                                    padding: '8px 12px',
                                    borderRadius: '8px',
                                    display: 'flex',
                                    alignItems: 'center'
                                }}>
                                    {isConnected ? t('gameUI.connected') : t('gameUI.disconnected')}
                                </div>
                            </div>

                            {/* Chat Desktop */}
                            <div style={{
                                position: 'absolute',
                                bottom: 10,
                                right: 10,
                                width: chatExpanded ? '300px' : '50px',
                                height: chatExpanded ? '250px' : '50px',
                                backgroundColor: 'rgba(0, 0, 0, 0.6)',
                                borderRadius: '8px',
                                display: 'flex',
                                flexDirection: 'column',
                                transition: 'all 0.3s ease',
                                pointerEvents: 'auto'
                            }}>
                                <button
                                    onClick={() => setChatExpanded(!chatExpanded)}
                                    style={{
                                        width: '100%',
                                        height: chatExpanded ? '30px' : '100%',
                                        padding: '8px',
                                        backgroundColor: 'transparent',
                                        border: 'none',
                                        borderBottom: chatExpanded ? '1px solid rgba(255, 255, 255, 0.1)' : 'none',
                                        color: 'white',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center'
                                    }}
                                >
                                    {chatExpanded ? t('gameUI.chatExpanded') : '💬'}
                                </button>

                                {chatExpanded && (
                                    <>
                                        <div
                                            ref={chatMessagesRef}
                                            style={{
                                                flex: 1,
                                                padding: '10px',
                                                overflowY: 'auto'
                                            }}
                                        >
                                            {chatMessages.map((msg, index) => (
                                                <div
                                                    key={index}
                                                    style={{
                                                        marginBottom: '4px',
                                                        wordBreak: 'break-word',
                                                        fontSize: '14px',
                                                        color: 'white'
                                                    }}
                                                >
                                                    <strong
                                                        style={{
                                                            color: teams.left.find(p => p.id === msg.playerId)
                                                                ? '#3b82f6'
                                                                : teams.right.find(p => p.id === msg.playerId)
                                                                    ? '#ef4444'
                                                                    : '#4CAF50'
                                                        }}
                                                    >
                                                        {msg.playerName}:
                                                    </strong>{' '}
                                                    <span>{msg.message}</span>
                                                </div>
                                            ))}
                                        </div>
                                        <form
                                            onSubmit={handleChatSubmit}
                                            style={{
                                                display: 'flex',
                                                padding: '10px',
                                                gap: '5px',
                                                borderTop: '1px solid rgba(255, 255, 255, 0.1)'
                                            }}
                                        >
                                            <input
                                                type="text"
                                                value={chatInput}
                                                onChange={(e) => setChatInput(e.target.value)}
                                                onFocus={() => { chatInputFocusRef.current = true; }}
                                                onBlur={() => { chatInputFocusRef.current = false; }}
                                                style={{
                                                    flex: 1,
                                                    padding: '8px',
                                                    borderRadius: '4px',
                                                    border: 'none',
                                                    backgroundColor: 'rgba(255, 255, 255, 0.05)',
                                                    fontSize: '14px',
                                                    color: 'white'
                                                }}
                                                placeholder={t('gameUI.writeMessage')}
                                            />
                                            <button
                                                type="submit"
                                                style={{
                                                    padding: '8px 15px',
                                                    borderRadius: '4px',
                                                    border: 'none',
                                                    backgroundColor: '#4CAF50',
                                                    color: 'white',
                                                    cursor: 'pointer'
                                                }}
                                            >
                                                →
                                            </button>
                                        </form>
                                    </>
                                )}
                            </div>
                        </div>
                    </>
                )
            )}

            {showingEndMessage && gameOverInfo && (
                <VictoryScreen
                    gameOverInfo={gameOverInfo}
                    isMobile={isMobile}
                    t={t}
                    onContinue={handleContinue}
                />
            )}
        </div>
    );
};

export default Game;