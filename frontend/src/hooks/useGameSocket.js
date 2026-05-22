import { useCallback, useEffect } from 'react';
import { io } from 'socket.io-client';

export function useGameSocket({
  roomId,
  socketRef,
  canvasRef,
  engineRef,
  sceneRef,
  createScene,
  updateGameState,
  hasJoined,
  playerName,
  isRedirectingRef,
  showingEndMessageRef,
  goalTimeoutRef,
  scoreTextRef,
  startConfetti,
  setToast,
  setIsConnected,
  setCurrentTeam,
  setTeamSelected,
  setTeams,
  setReadyState,
  setGameStarted,
  setGameInProgress,
  setScore,
  setGoalFeedback,
  setShakeScreen,
  setGameOverInfo,
  setShowingEndMessage,
  setSelectedCharacter,
  setChatMessages,
  setConnectedPlayers,
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

    const showError = (message) => setToast({ message, type: 'error' });

    const handleConnect = () => {
      setIsConnected(true);
      if (hasJoined && playerName) {
        socket.emit('joinGame', { name: playerName, roomId });
      }
    };

    const handleConnectError = () => setIsConnected(false);

    const handleTeamSelected = ({ team }) => {
      setCurrentTeam(team);
      setTeamSelected(true);
    };

    const handleCharacterSelected = ({ characterType }) => {
      setSelectedCharacter(characterType);
    };

    const handleGameStart = () => {
      setGameStarted(true);
      setGameInProgress(true);
    };

    const handleGoalScored = ({ team, score: newScore }) => {
      setScore(newScore);
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
    };

    const handleGameOver = (gameOverData) => {
      setGameStarted(false);
      setGameInProgress(false);
      if (gameOverData) {
        setGameOverInfo(gameOverData);
        setShowingEndMessage(true);
      }
    };

    const handleScoreUpdate = (newScore) => setScore(newScore);

    const handleGameStateInfo = ({ currentState }) => {
      setGameInProgress(currentState === 'playing');
      if (currentState === 'waiting') {
        setTimeout(() => {
          if (showingEndMessageRef.current) return;
          setShowingEndMessage(false);
          setGameStarted(false);
          setScore({ left: 0, right: 0 });
          setGameOverInfo(null);
        }, 100);
      }
    };

    const handleChatUpdate = (message) => setChatMessages((prev) => [...prev, message]);

    socket.on('connect', handleConnect);
    socket.on('connect_error', handleConnectError);
    socket.on('teamSelected', handleTeamSelected);
    socket.on('characterSelected', handleCharacterSelected);
    socket.on('teamUpdate', setTeams);
    socket.on('readyUpdate', setReadyState);
    socket.on('gameStateUpdate', updateGameState);
    socket.on('gameStart', handleGameStart);
    socket.on('goalScored', handleGoalScored);
    socket.on('gameOver', handleGameOver);
    socket.on('scoreUpdate', handleScoreUpdate);
    socket.on('gameStateInfo', handleGameStateInfo);
    socket.on('chatUpdate', handleChatUpdate);
    socket.on('playersListUpdate', setConnectedPlayers);
    socket.on('joinError', ({ message }) => showError(message));
    socket.on('selectTeamError', ({ message }) => showError(message));
    socket.on('selectCharacterError', ({ message }) => showError(message));
    socket.on('readyError', ({ message }) => showError(message));

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
      socket.off('teamUpdate', setTeams);
      socket.off('readyUpdate', setReadyState);
      socket.off('gameStateUpdate', updateGameState);
      socket.off('gameStart', handleGameStart);
      socket.off('goalScored', handleGoalScored);
      socket.off('gameOver', handleGameOver);
      socket.off('scoreUpdate', handleScoreUpdate);
      socket.off('gameStateInfo', handleGameStateInfo);
      socket.off('chatUpdate', handleChatUpdate);
      socket.off('playersListUpdate', setConnectedPlayers);
      socket.off('joinError');
      socket.off('selectTeamError');
      socket.off('selectCharacterError');
      socket.off('readyError');
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
    startConfetti,
    canvasRef,
    engineRef,
    socketRef,
    goalTimeoutRef,
    scoreTextRef,
    sceneRef,
    showingEndMessageRef,
    setToast,
    setIsConnected,
    setCurrentTeam,
    setTeamSelected,
    setTeams,
    setReadyState,
    setGameStarted,
    setGameInProgress,
    setScore,
    setGoalFeedback,
    setShakeScreen,
    setGameOverInfo,
    setShowingEndMessage,
    setSelectedCharacter,
    setChatMessages,
    setConnectedPlayers,
  ]);

  return { handleTeamSelect };
}
