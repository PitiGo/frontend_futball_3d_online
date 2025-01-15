import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { Vector3, Quaternion } from '@babylonjs/core';
import cors from 'cors';

const app = express();
app.use(cors());

const TEAM_CHARACTERS = {
  left: ['player', 'pig'],
  right: ['turtle', 'lizard']
};

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
  proxy: true
});

// Constantes y estados del juego
const MAX_PLAYERS_PER_TEAM = 3;
const GOALS_TO_WIN = 3;
const BALL_CONTROL_RADIUS = 1.5; // Radio de control del balón
const BALL_CONTROL_FORCE = 0.8; // Qué tanto el jugador puede influir en el balón
const BALL_RELEASE_BOOST = 0.8; // Multiplicador de velocidad al soltar el balón

const teams = {
  left: [],
  right: []
};

const gameStates = {
  WAITING: 'waiting',
  PLAYING: 'playing'
};

let currentGameState = gameStates.WAITING;
const players = new Map();

// Configuración del campo y la física
const FIELD_WIDTH = 40;
const FIELD_HEIGHT = 30;
const BALL_RADIUS = 0.5;
const PLAYER_RADIUS = 0.5;
const PLAYER_SPEED = 0.167;
const GOAL_DEPTH = 7;
const GOAL_Z_MIN = -GOAL_DEPTH / 2;
const GOAL_Z_MAX = GOAL_DEPTH / 2;
const BALL_MASS = 0.45;
const PLAYER_MASS = 75;
const FRICTION = 0.98;
const RESTITUTION = 0.8;

// Estado de la pelota y puntuación
let ballPosition = new Vector3(0, 0.5, 0);
let ballVelocity = new Vector3(0, 0, 0);
let score = { left: 0, right: 0 };

// Funciones de utilidad
function sanitizeMessage(message) {
  const sanitized = message.replace(/<[^>]*>?/gm, '');
  return sanitized
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function vector3ToObject(vector) {
  return { x: vector.x, y: vector.y, z: vector.z };
}

function quaternionToObject(quaternion) {
  return { x: quaternion.x, y: quaternion.y, z: quaternion.z, w: quaternion.w };
}

function resetBall() {
  ballPosition = new Vector3(0, 0.5, 0);
  ballVelocity = new Vector3(0, 0, 0);
}

// Nueva función para reposicionar jugadores
function resetPlayersPositions() {
  players.forEach((player, id) => {
    if (player.team === 'left') {
      player.position = new Vector3(
        -FIELD_WIDTH / 4,  // Cuarto izquierdo del campo
        0.5,
        (Math.random() * FIELD_HEIGHT - FIELD_HEIGHT / 2) * 0.8  // Posición Z aleatoria
      );
    } else if (player.team === 'right') {
      player.position = new Vector3(
        FIELD_WIDTH / 4,   // Cuarto derecho del campo
        0.5,
        (Math.random() * FIELD_HEIGHT - FIELD_HEIGHT / 2) * 0.8  // Posición Z aleatoria
      );
    }
    // Resetear velocidad y estado de control del balón
    player.velocity = new Vector3(0, 0, 0);
    player.isControllingBall = false;
    player.ballControlTime = 0;
  });
}

function getWinningMessage(team) {
  if (team === 'left') {
    return '¡El EQUIPO MAMÍFEROS ha ganado el partido!';
  } else {
    return '¡El EQUIPO REPTILES ganado el partido!';
  }
}

function checkVictory() {
  if (score.left >= GOALS_TO_WIN) {
    endGame(getWinningMessage('left'));
    return true;
  }
  if (score.right >= GOALS_TO_WIN) {
    endGame(getWinningMessage('right'));
    return true;
  }
  return false;
}

function getReadyStatus() {
  return {
    left: teams.left.map(player => ({
      id: player.id,
      name: player.name,
      ready: players.get(player.id)?.ready || false
    })),
    right: teams.right.map(player => ({
      id: player.id,
      name: player.name,
      ready: players.get(player.id)?.ready || false
    }))
  };
}

function checkGameStatus() {
  if (currentGameState !== gameStates.PLAYING) {
    return;
  }

  const leftTeamPlayers = teams.left.length;
  const rightTeamPlayers = teams.right.length;
  const totalPlayers = leftTeamPlayers + rightTeamPlayers;

  let shouldEndGame = false;
  let endReason = '';

  if (totalPlayers === 0) {
    shouldEndGame = true;
    endReason = 'No hay jugadores conectados';
  } else if (leftTeamPlayers === 0) {
    shouldEndGame = true;
    endReason = 'El equipo azul se quedó sin jugadores';
  } else if (rightTeamPlayers === 0) {
    shouldEndGame = true;
    endReason = 'El equipo rojo se quedó sin jugadores';
  }

  if (shouldEndGame) {
    endGame(endReason);
  }
}

// En server.js
function endGame(reason) {
  currentGameState = gameStates.WAITING;
  const finalScore = { ...score };
  score = { left: 0, right: 0 };
  resetBall();

  // Determinar el equipo ganador basado en la razón o el puntaje
  const winningTeam = reason.includes('MAMÍFEROS') ? 'left' : 'right';

  // Limpiar estado de jugadores y equipos
  teams.left.forEach(player => {
    const playerData = players.get(player.id);
    if (playerData) {
      playerData.ready = false;
      playerData.characterType = null;
      playerData.position = new Vector3(-FIELD_WIDTH / 4, 0.5,
        (Math.random() * FIELD_HEIGHT - FIELD_HEIGHT / 2) * 0.8);
    }
  });

  teams.right.forEach(player => {
    const playerData = players.get(player.id);
    if (playerData) {
      playerData.ready = false;
      playerData.characterType = null;
      playerData.position = new Vector3(FIELD_WIDTH / 4, 0.5,
        (Math.random() * FIELD_HEIGHT - FIELD_HEIGHT / 2) * 0.8);
    }
  });

  // Emitir actualización completa de estado
  const gameEndData = {
    currentState: currentGameState,
    reason: reason,
    finalScore,
    goalsToWin: GOALS_TO_WIN,
    winningTeam: winningTeam,  // Añadir explícitamente el equipo ganador
    players: Array.from(players.values()).map(player => ({
      id: player.id,
      name: player.name,
      team: player.team,
      characterType: player.characterType,
      ready: player.ready
    }))
  };

  io.emit('gameEnd', gameEndData);
}
function updateGameState() {
  if (currentGameState !== gameStates.PLAYING) {
    return;
  }

  // Verificar goles
  if (ballPosition.x < -FIELD_WIDTH / 2 + BALL_RADIUS) {
    if (ballPosition.z >= GOAL_Z_MIN && ballPosition.z <= GOAL_Z_MAX) {
      score.right++;
      console.log(`Gol para el equipo derecho. Puntuación: ${score.left} - ${score.right}`);
      io.emit('goalScored', {
        team: 'right',
        score: score
      });

      if (checkVictory()) return;
      resetBall();
      resetPlayersPositions();
      return;
    }
  } else if (ballPosition.x > FIELD_WIDTH / 2 - BALL_RADIUS) {
    if (ballPosition.z >= GOAL_Z_MIN && ballPosition.z <= GOAL_Z_MAX) {
      score.left++;
      console.log(`Gol para el equipo izquierdo. Puntuación: ${score.left} - ${score.right}`);
      io.emit('goalScored', {
        team: 'left',
        score: score
      });

      if (checkVictory()) return;
      resetBall();
      resetPlayersPositions(); 
      return;
    }
  }

  // Actualizar posición de la pelota
  ballPosition = ballPosition.add(ballVelocity);

  // Rebotes en las paredes
  if (Math.abs(ballPosition.x) > FIELD_WIDTH / 2 - BALL_RADIUS) {
    if (ballPosition.z < GOAL_Z_MIN || ballPosition.z > GOAL_Z_MAX) {
      ballVelocity.x *= -RESTITUTION;
      ballPosition.x = Math.sign(ballPosition.x) * (FIELD_WIDTH / 2 - BALL_RADIUS);
    }
  }

  if (Math.abs(ballPosition.z) > FIELD_HEIGHT / 2 - BALL_RADIUS) {
    ballVelocity.z *= -RESTITUTION;
    ballPosition.z = Math.sign(ballPosition.z) * (FIELD_HEIGHT / 2 - BALL_RADIUS);
  }

  // Aplicar fricción
  ballVelocity = ballVelocity.scale(FRICTION);

  // Colisiones jugador-pelota
  players.forEach((player) => {
    const distanceToPlayer = Vector3.Distance(player.position, ballPosition);
    const KICK_RADIUS = PLAYER_RADIUS + BALL_RADIUS + 0.3; // Radio para patear
    const controlRadius = player.isControllingBall ? BALL_CONTROL_RADIUS : (PLAYER_RADIUS + BALL_RADIUS);

    if (distanceToPlayer < controlRadius) {
      if (player.isControllingBall) {
        const controlDuration = (Date.now() - player.ballControlTime) / 1000;
        if (controlDuration >= 3) {
          player.isControllingBall = false;
          const randomVelocity = new Vector3(
            (Math.random() - 0.5) * 1.5,
            0,
            (Math.random() - 0.5) * 1.5
          );

          // Añadir el impulso basado en la velocidad del jugador
          const playerVelocityComponent = player.velocity.scale(0.8);
          ballVelocity = randomVelocity.add(playerVelocityComponent);
        } else {
          let direction;
          if (player.velocity.length() > 0.01) {
            direction = player.velocity.normalize();
          } else {
            direction = new Vector3(
              Math.cos(player.rotation.y),
              0,
              Math.sin(player.rotation.y)
            );
          }

          const idealPosition = player.position.add(
            direction.scale(PLAYER_RADIUS + BALL_RADIUS + 0.5)
          );

          ballPosition = Vector3.Lerp(ballPosition, idealPosition, 0.2);
          ballVelocity = Vector3.Zero();
        }
      } else {
        // Colisión normal
        const collisionNormal = ballPosition.subtract(player.position).normalize();
        const relativeVelocity = ballVelocity.subtract(player.velocity);
        const impulseStrength = -(1 + RESTITUTION) * Vector3.Dot(relativeVelocity, collisionNormal) /
          (1 / BALL_MASS + 1 / PLAYER_MASS);

        const impulse = collisionNormal.scale(impulseStrength * 1.2);
        ballVelocity = ballVelocity.add(impulse.scale(1 / BALL_MASS));
        player.velocity = player.velocity.subtract(impulse.scale(1 / PLAYER_MASS));
      }
    }
  });

  // Limitar velocidad de la pelota
  const MAX_BALL_SPEED = 1;
  if (ballVelocity.length() > MAX_BALL_SPEED) {
    ballVelocity = ballVelocity.normalize().scale(MAX_BALL_SPEED);
  }

  // Actualizar posiciones de jugadores
  // En el bucle updateGameState, dentro del manejo de movimiento del jugador
  players.forEach((player) => {
    let playerVelocity = new Vector3(0, 0, 0);
    const speedMultiplier = 1;
    const diagonalMultiplier = 0.707; // Aproximadamente 1/√2

    // Manejo de direcciones diagonales
    switch (player.movement.direction) {
      case 'up-right':
        playerVelocity.z += PLAYER_SPEED * diagonalMultiplier;
        playerVelocity.x += PLAYER_SPEED * diagonalMultiplier;
        break;
      case 'up-left':
        playerVelocity.z += PLAYER_SPEED * diagonalMultiplier;
        playerVelocity.x -= PLAYER_SPEED * diagonalMultiplier;
        break;
      case 'down-right':
        playerVelocity.z -= PLAYER_SPEED * diagonalMultiplier;
        playerVelocity.x += PLAYER_SPEED * diagonalMultiplier;
        break;
      case 'down-left':
        playerVelocity.z -= PLAYER_SPEED * diagonalMultiplier;
        playerVelocity.x -= PLAYER_SPEED * diagonalMultiplier;
        break;
      default:
        // Movimientos originales
        if (player.movement.up) playerVelocity.z += PLAYER_SPEED;
        if (player.movement.down) playerVelocity.z -= PLAYER_SPEED;
        if (player.movement.left) playerVelocity.x -= PLAYER_SPEED;
        if (player.movement.right) playerVelocity.x += PLAYER_SPEED;
    }

    player.position = player.position.add(playerVelocity);
    player.velocity = playerVelocity.clone();

    // Limitar posición dentro del campo
    player.position.x = Math.max(Math.min(player.position.x, FIELD_WIDTH / 2 - PLAYER_RADIUS), -FIELD_WIDTH / 2 + PLAYER_RADIUS);
    player.position.z = Math.max(Math.min(player.position.z, FIELD_HEIGHT / 2 - PLAYER_RADIUS), -FIELD_HEIGHT / 2 + PLAYER_RADIUS);
  });

  // Emitir estado del juego
  const gameState = {
    players: Array.from(players.values()).map(player => ({
      id: player.id,
      name: player.name,
      position: vector3ToObject(player.position),
      rotation: quaternionToObject(player.rotation),
      isMoving: player.movement.up || player.movement.down || player.movement.left || player.movement.right,
      team: player.team,
      characterType: player.characterType,
      isControllingBall: player.isControllingBall,  // Asegúrate de que esta línea esté presente
      ballControlTime: player.isControllingBall ? player.ballControlTime : null
    })),
    ballPosition: vector3ToObject(ballPosition),
    score: score,
    connectedPlayers: Array.from(players.values()).map(player => ({
      id: player.id,
      name: player.name,
      team: player.team,
      characterType: player.characterType
    }))
  };

  io.emit('gameStateUpdate', gameState);
}

// Iniciar el bucle del juego
setInterval(updateGameState, 1000 / 60);

// Manejo de conexiones
io.on('connection', (socket) => {
  console.log(`Nuevo cliente conectado: ${socket.id}`);

  socket.emit('teamUpdate', teams);
  socket.emit('gameStateInfo', { currentState: currentGameState });

  socket.on('joinGame', (playerData) => {
    const { name } = playerData;

    if (typeof name !== 'string' || name.trim() === '') {
      socket.emit('error', { message: 'Nombre inválido' });
      return;
    }

    if (currentGameState === gameStates.PLAYING) {
      socket.emit('gameInProgress');
      return;
    }

    players.set(socket.id, {
      id: socket.id,
      name: name,
      team: null,
      characterType: null,
      position: new Vector3(0, 0.5, 0),
      rotation: new Quaternion(),
      movement: { up: false, down: false, left: false, right: false },
      velocity: new Vector3(0, 0, 0),
      ready: false,
      isControllingBall: false,
      ballControlTime: 0
    });

    console.log(`Jugador ${name} agregado con ID ${socket.id}`);

    socket.emit('teamUpdate', teams);
    io.emit('playersListUpdate', Array.from(players.values()).map(player => ({
      id: player.id,
      name: player.name,
      characterType: player.characterType
    })));
  });

  socket.on('selectCharacter', ({ characterType }) => {
    const player = players.get(socket.id);
    if (!player) {
      socket.emit('error', { message: 'Jugador no encontrado' });
      return;
    }

    if (!player.team && characterType !== null) {
      socket.emit('error', { message: 'Debes seleccionar un equipo primero' });
      return;
    }

    // Permitir null para deseleccionar, o validar el personaje si se está seleccionando uno
    if (characterType !== null && !TEAM_CHARACTERS[player.team].includes(characterType)) {
      socket.emit('error', { message: 'Personaje no disponible para este equipo' });
      return;
    }

    player.characterType = characterType;
    console.log(`Jugador ${player.name} ${characterType ? 'seleccionó' : 'deseleccionó'} el personaje: ${characterType}`);

    io.emit('playerUpdate', {
      id: socket.id,
      name: player.name,
      characterType: characterType,
      team: player.team
    });
  });

  socket.on('selectTeam', ({ team }) => {
    if (team !== 'left' && team !== 'right') {
      socket.emit('error', { message: 'Equipo inválido' });
      return;
    }

    if (teams[team].length >= MAX_PLAYERS_PER_TEAM) {
      socket.emit('error', { message: 'Equipo lleno' });
      return;
    }

    const player = players.get(socket.id);
    if (!player) {
      socket.emit('error', { message: 'Jugador no encontrado' });
      return;
    }

    if (player.team) {
      const oldTeam = teams[player.team];
      const index = oldTeam.findIndex(p => p.id === socket.id);
      if (index !== -1) {
        oldTeam.splice(index, 1);
      }
    }

    player.team = team;
    player.ready = false;
    teams[team].push({ id: socket.id, name: player.name });

    player.position = new Vector3(
      team === 'left' ? -FIELD_WIDTH / 4 : FIELD_WIDTH / 4,
      0.5,
      (Math.random() * FIELD_HEIGHT - FIELD_HEIGHT / 2) * 0.8
    );

    io.emit('teamUpdate', teams);
    socket.emit('teamSelected', { team });
    io.emit('readyUpdate', getReadyStatus());

    checkGameStatus();
  });

  socket.on('toggleReady', () => {
    const player = players.get(socket.id);
    if (player && player.team) {
      player.ready = !player.ready;
      console.log(`Jugador ${player.name} (${socket.id}) cambió su estado ready a:`, player.ready);

      const readyStatus = getReadyStatus();
      io.emit('readyUpdate', readyStatus);

      const allPlayersReady = [...teams.left, ...teams.right]
        .every(teamPlayer => players.get(teamPlayer.id)?.ready);

      console.log('¿Todos los jugadores están listos?', allPlayersReady);

      if (allPlayersReady && teams.left.length > 0 && teams.right.length > 0) {
        currentGameState = gameStates.PLAYING;
        io.emit('gameStart');
        score = { left: 0, right: 0 };
        resetBall();
      }

      io.emit('gameStateInfo', { currentState: currentGameState });
    }
  });

  socket.on('playerMoveStart', ({ direction }) => {
    if (!['up', 'down', 'left', 'right'].includes(direction)) {
      socket.emit('error', { message: 'Dirección inválida' });
      return;
    }

    const player = players.get(socket.id);
    if (player) {
      player.movement[direction] = true;
    }
  });

  socket.on('playerMoveStop', ({ direction }) => {
    if (!['up', 'down', 'left', 'right'].includes(direction)) {
      socket.emit('error', { message: 'Dirección inválida' });
      return;
    }

    const player = players.get(socket.id);
    if (player) {
      player.movement[direction] = false;
    }
  });

  socket.on('chatMessage', (message) => {
    const player = players.get(socket.id);
    if (player && typeof message === 'string') {
      const sanitizedMessage = sanitizeMessage(message.trim());
      if (sanitizedMessage.length > 0 && sanitizedMessage.length <= 200) {
        io.emit('chatUpdate', {
          playerId: socket.id,
          playerName: player.name,
          message: sanitizedMessage,
          timestamp: new Date().toISOString()
        });
      }
    }
  });

  socket.on('ballControl', ({ control, shooting }) => {
    const player = players.get(socket.id);
    if (player) {
      const distanceToPlayer = Vector3.Distance(player.position, ballPosition);
      const KICK_RADIUS = PLAYER_RADIUS + BALL_RADIUS + 0.3;

      console.log(`Jugador ${player.name} ${control ? 'inició' : 'soltó'} el control del balón`);
      player.isControllingBall = control;

      if (control) {
        player.ballControlTime = Date.now();
      } else if (shooting) {
        // Aplicar boost SOLO al soltar Y si está dentro del radio de pateo
        const controlDuration = (Date.now() - player.ballControlTime) / 1000;
        if (controlDuration < 3 && distanceToPlayer <= KICK_RADIUS) {
          const playerToBall = ballPosition.subtract(player.position);
          // Aumentar el boost para un disparo más potente
          ballVelocity = playerToBall.normalize().scale(BALL_RELEASE_BOOST * 0.8);
          console.log('Aplicando disparo - Distancia:', distanceToPlayer);
        }
      }
    }
  });


  socket.on('disconnect', () => {
    const player = players.get(socket.id);
    if (player && player.team) {
      const teamArray = teams[player.team];
      const index = teamArray.findIndex(p => p.id === socket.id);
      if (index !== -1) {
        teamArray.splice(index, 1);
        io.emit('teamUpdate', teams);
        io.emit('readyUpdate', getReadyStatus());
      }
    }
    players.delete(socket.id);
    io.emit('playersListUpdate', Array.from(players.values()).map(player => ({
      id: player.id,
      name: player.name,
      team: player.team,
      characterType: player.characterType
    })));

    checkGameStatus();
  });
});

const PORT = process.env.PORT || 4000;
httpServer.listen(PORT, () => {
  console.log(`Servidor de juego corriendo en el puerto ${PORT}`);
});