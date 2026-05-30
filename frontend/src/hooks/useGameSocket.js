import { useCallback, useEffect } from 'react';
import { io } from 'socket.io-client';

export function useGameSocket({
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
  callbacksRef,
}) {
  const setupSocket = useCallback(() => {
    if (!roomId) return null;

    const publicGameUrl = process.env.REACT_APP_GAME_SERVER_URL
      || (window.location.hostname === 'localhost'
        ? 'http://localhost:4000'
        : 'https://football-online-3d.dantecollazzi.com');

    try {
      const isLocalhost = window.location.hostname === 'localhost'
        || window.location.hostname === '127.0.0.1';
      return io(publicGameUrl, {
        transports: isLocalhost ? ['websocket', 'polling'] : ['websocket'],
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
        withCredentials: true,
      });
    } catch (error) {
      console.error('Error al crear el socket:', error);
      return null;
    }
  }, [roomId]);

  const handleTeamSelect = useCallback((team) => {
    if (!socketRef.current?.connected) return;
    socketRef.current.emit('selectTeam', { team });
  }, [socketRef]);

  useEffect(() => {
    if (!roomId) return undefined;

    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    if (!engineRef.current) {
      createScene(canvas);
    }

    let socket = socketRef.current;
    if (!socket || (!socket.connected && !socket.connecting)) {
      if (socket) socket.disconnect();
      socket = setupSocket();
      socketRef.current = socket;
    }
    if (!socket) return undefined;

    const cb = () => callbacksRef.current;

    const handleConnect = () => {
      cb().onConnected?.();
      if (hasJoined && playerName) {
        socket.emit('joinGame', { name: playerName, roomId });
      }
    };

    const handleConnectError = () => cb().onConnectError?.();

    const handleTeamSelected = (data) => cb().onTeamSelected?.(data);
    const handleCharacterSelected = (data) => cb().onCharacterSelected?.(data);
    const handleGameStart = () => cb().onGameStart?.();
    const handleGoalScored = (data) => cb().onGoalScored?.(data);
    const handleGameOver = (data) => cb().onGameOver?.(data);
    const handleScoreUpdate = (data) => cb().onScoreUpdate?.(data);
    const handleGameStateInfo = (data) => cb().onGameStateInfo?.(data);
    const handleChatUpdate = (data) => cb().onChatUpdate?.(data);
    const handlePlayersListUpdate = (data) => cb().onPlayersListUpdate?.(data);
    const handleBallBounce = (data) => cb().onBallBounce?.(data);
    const handleJoinError = ({ message }) => cb().onError?.(message);
    const handleSelectTeamError = ({ message }) => cb().onError?.(message);
    const handleSelectCharacterError = ({ message }) => cb().onError?.(message);
    const handleReadyError = ({ message }) => cb().onError?.(message);
    const handleChatError = ({ message }) => cb().onError?.(message);

    socket.on('connect', handleConnect);
    socket.on('connect_error', handleConnectError);
    socket.on('teamSelected', handleTeamSelected);
    socket.on('characterSelected', handleCharacterSelected);
    socket.on('teamUpdate', (data) => cb().onTeamUpdate?.(data));
    socket.on('readyUpdate', (data) => cb().onReadyUpdate?.(data));
    socket.on('gameStateUpdate', updateGameState);
    socket.on('gameStart', handleGameStart);
    socket.on('goalScored', handleGoalScored);
    socket.on('gameOver', handleGameOver);
    socket.on('scoreUpdate', handleScoreUpdate);
    socket.on('gameStateInfo', handleGameStateInfo);
    socket.on('chatUpdate', handleChatUpdate);
    socket.on('playersListUpdate', handlePlayersListUpdate);
    socket.on('ballBounce', handleBallBounce);
    socket.on('joinError', handleJoinError);
    socket.on('selectTeamError', handleSelectTeamError);
    socket.on('selectCharacterError', handleSelectCharacterError);
    socket.on('readyError', handleReadyError);
    socket.on('chatError', handleChatError);

    const engine = engineRef.current;
    if (engine && !engine.isPointerLock) {
      engine.runRenderLoop(() => {
        if (sceneRef.current) {
          sceneRef.current.render();
        }
      });
    }

    return () => {
      socket.off('connect', handleConnect);
      socket.off('connect_error', handleConnectError);
      socket.off('teamSelected', handleTeamSelected);
      socket.off('characterSelected', handleCharacterSelected);
      socket.off('teamUpdate');
      socket.off('readyUpdate');
      socket.off('gameStateUpdate', updateGameState);
      socket.off('gameStart', handleGameStart);
      socket.off('goalScored', handleGoalScored);
      socket.off('gameOver', handleGameOver);
      socket.off('scoreUpdate', handleScoreUpdate);
      socket.off('gameStateInfo', handleGameStateInfo);
      socket.off('chatUpdate', handleChatUpdate);
      socket.off('playersListUpdate', handlePlayersListUpdate);
      socket.off('ballBounce', handleBallBounce);
      socket.off('joinError');
      socket.off('selectTeamError');
      socket.off('selectCharacterError');
      socket.off('readyError');
      socket.off('chatError');
      if (goalTimeoutRef.current) {
        clearTimeout(goalTimeoutRef.current);
        goalTimeoutRef.current = null;
      }
    };
  }, [
    roomId,
    createScene,
    setupSocket,
    updateGameState,
    hasJoined,
    playerName,
    canvasRef,
    engineRef,
    socketRef,
    goalTimeoutRef,
    sceneRef,
    callbacksRef,
  ]);

  return { handleTeamSelect };
}
