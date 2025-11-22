// server.js - Refactorizado para gestión por sala

import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { Vector3, Quaternion, Matrix } from '@babylonjs/core'; // Añadir Matrix
import cors from 'cors';
import { performance } from 'perf_hooks'; // Para performance.now() en Node.js

const app = express();

// Utilidades de configuración por entorno
function parseEnvList(name, fallbackList) {
  const raw = process.env[name];
  if (!raw || typeof raw !== 'string') return fallbackList;
  const list = raw.split(',').map(s => s.trim()).filter(Boolean);
  return list.length ? list : fallbackList;
}

// Configuración específica de CORS para Express (parametrizable por env)
const allowedOrigins = parseEnvList('ALLOWED_ORIGINS', [
  "https://football-online-3d.dantecollazzi.com",
  "https://www.dantecollazzi.com",
  "http://localhost:3000"
]);

app.use(cors({
  origin: function (origin, callback) {
    // Permitir solicitudes sin origin (como las de Postman o curl)
    if (!origin) return callback(null, true);

    if (allowedOrigins.indexOf(origin) === -1) {
      const msg = 'The CORS policy for this site does not allow access from the specified Origin.';
      return callback(new Error(msg), false);
    }
    return callback(null, true);
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  credentials: true,
  maxAge: 86400 // Cache preflight requests for 24 hours
}));

const httpServer = createServer(app);

// Configuración de Socket.IO
const io = new Server(httpServer, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"],
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization"]
  }
});

// --- Constantes del Juego (parametrizables) ---
const availableSalas = parseEnvList('ROOMS', ['room1', 'room2']);
const FIELD_WIDTH = 40;
const FIELD_HEIGHT = 30;
const BALL_RADIUS = 0.5;
const PLAYER_RADIUS = 0.5;
const PLAYER_SPEED = 5; // Velocidad base (unidades por segundo) - Reference: Player moves at 5 u/s
const GOAL_DEPTH = 7;
const GOAL_Z_MIN = -GOAL_DEPTH / 2;
const GOAL_Z_MAX = GOAL_DEPTH / 2;
const GOAL_NET_DEPTH = 2.5; // Nueva constante: Profundidad hacia atrás de la portería
const BALL_MASS = 0.45;
const PLAYER_MASS = 75; // Masa real
const INV_BALL_MASS = 1 / BALL_MASS;
const INV_PLAYER_MASS = 1 / PLAYER_MASS;
const FRICTION = 0.994; // Coeficiente de fricción por tick (ajustado a DT) - Low friction to maintain speed
const RESTITUTION = 0.6; // Coeficiente de restitución (elasticidad)
const MAX_PLAYERS_PER_TEAM = 3;
const GOALS_TO_WIN = 3;
const BALL_CONTROL_RADIUS = 1.5;
const BALL_RELEASE_BOOST = 10; // Deprecated (mantener compat)
const BALL_RELEASE_MIN = 30;    // Minimum shot speed: 30 u/s (6x faster than player) - Quick tap
const BALL_RELEASE_MAX = 60;   // Maximum shot speed: 60 u/s (12x faster than player) - Full charge
const PHYSICS_TICK_RATE = 60; // Hz
const PHYSICS_DT = 1 / PHYSICS_TICK_RATE; // Delta time para física

const TEAM_CHARACTERS = {
  left: ['player', 'pig'],
  right: ['turtle', 'lizard']
};

const gameStates = {
  WAITING: 'waiting',
  PLAYING: 'playing',
  GOAL_SCORED: 'goal_scored', // Estado intermedio después de un gol
  GAME_OVER: 'game_over'     // Estado cuando el juego ha terminado
};

// --- Estado del Juego por Sala ---
const salaStates = {};
availableSalas.forEach(roomId => {
  salaStates[roomId] = {
    players: new Map(), // Mapa de socket.id -> playerData
    teams: { // Almacena solo IDs para referencia rápida
      left: new Set(),
      right: new Set()
    },
    readyState: { // Almacena solo IDs de jugadores listos
      left: new Set(),
      right: new Set()
    },
    currentGameState: gameStates.WAITING,
    score: { left: 0, right: 0 },
    ballPosition: new Vector3(0, BALL_RADIUS, 0), // Inicia en el suelo
    ballVelocity: new Vector3(0, 0, 0),
    lastUpdateTime: performance.now(),
    ballLastShotTime: 0,           // Timestamp del último disparo
    ballFrictionCooldownMs: 800,   // Ventana sin fricción tras disparo - El balón ignorará fricción durante casi 1 segundo
    goalScoredTimeout: null, // ID del temporizador para reiniciar tras gol
    gameOverData: null,     // Datos del resultado final
    gameLoopInterval: null, // ID del intervalo del bucle principal
    playerMovements: new Map() // Mapa de socket.id -> { moveDirection: Vector3 }
  };
});


// --- Rutas API (Ej: Status) ---
app.get('/:roomId/status', (req, res) => {
  const { roomId } = req.params;
  if (!salaStates[roomId]) {
    return res.status(404).json({ error: 'Sala no encontrada' });
  }
  const state = salaStates[roomId];
  const status = getTeamStatus(state); // Usa la función auxiliar

  res.json({
    playerCount: state.players.size,
    players: Array.from(state.players.values()).map(p => ({
      id: p.id,
      name: p.name,
      team: p.team,
      characterType: p.characterType,
      ready: p.ready,
    })),
    gameInProgress: state.currentGameState === gameStates.PLAYING,
    score: state.score,
    teams: status.teams,
    readyState: getReadyPayload(state) // Corregido: usar getReadyPayload en lugar de status.readyState
  });
});

// --- Funciones de Utilidad ---
function sanitizeInput(input, maxLength = 200) {
  if (typeof input !== 'string') return '';
  // Simple sanitization, considera librerías más robustas para producción
  return input.replace(/</g, "<").replace(/>/g, ">").trim().slice(0, maxLength);
}

function vector3ToObject(v) { return v ? { x: v.x, y: v.y, z: v.z } : { x: 0, y: 0, z: 0 }; }
function quaternionToObject(q) { return q ? { x: q.x, y: q.y, z: q.z, w: q.w } : { x: 0, y: 0, z: 0, w: 1 }; }

function getSpawnPosition(team) {
  const side = team === 'left' ? -1 : 1;
  return new Vector3(
    side * FIELD_WIDTH / 4,
    PLAYER_RADIUS, // Inicia en el suelo
    (Math.random() - 0.5) * (FIELD_HEIGHT * 0.8)
  );
}

function resetBall(state) {
  state.ballPosition.set(0, BALL_RADIUS, 0);
  state.ballVelocity.set(0, 0, 0);
}

function resetPlayersPositions(roomId, state) {
  console.log(`[${roomId}] Reposicionando jugadores.`);
  state.players.forEach((player) => {
    if (player.team) {
      player.position = getSpawnPosition(player.team);
    } else {
      // Posición central si aún no tiene equipo (raro en este punto)
      player.position.set(0, PLAYER_RADIUS, (Math.random() - 0.5) * 5);
    }
    player.velocity.set(0, 0, 0);
    player.rotation.copyFromFloats(0, 0, 0, 1); // Mirando Z positivo
    player.isControllingBall = false;
    player.ballControlTime = 0;
    // Asegurarse de que el estado de movimiento esté inicializado
    if (!state.playerMovements.has(player.id)) {
      state.playerMovements.set(player.id, { moveDirection: Vector3.Zero() });
    } else {
      state.playerMovements.get(player.id).moveDirection.set(0, 0, 0);
    }
  });
  // Emitir estado para que el cliente vea las nuevas posiciones inmediatamente
  emitGameState(roomId, state);
}


// Devuelve información formateada para enviar al cliente
function getTeamStatus(state) {
  const getPlayerInfo = (id) => {
    const p = state.players.get(id);
    // Incluir 'ready' aquí también podría ser útil para la UI de equipos
    return p ? { id: p.id, name: p.name, characterType: p.characterType, ready: p.ready } : null;
  };

  return {
    teams: {
      left: Array.from(state.teams.left).map(getPlayerInfo).filter(Boolean),
      right: Array.from(state.teams.right).map(getPlayerInfo).filter(Boolean)
    },
    // readyState se envía por separado con readyUpdate para claridad
  };
}

// Devuelve información de jugadores listos
function getReadyPayload(state) {
  const getReadyInfo = (id) => {
    const p = state.players.get(id);
    // Enviar solo info esencial para el estado 'listo'
    return p ? { id: p.id, name: p.name, ready: p.ready } : null;
  }
  return {
    left: Array.from(state.readyState.left).map(getReadyInfo).filter(Boolean),
    right: Array.from(state.readyState.right).map(getReadyInfo).filter(Boolean)
  }
}

// Returns a winning message based on the team that won
function getWinningMessage(winningTeam) {
  if (winningTeam === 'left') {
    return "The Mammals team (Blue) has won!";
  } else if (winningTeam === 'right') {
    return "The Reptiles team (Red) has won!";
  } else {
    return "Game Over!"; // Default message
  }
}

// --- Lógica de Inicio/Fin de Juego ---

function checkStartGame(roomId, state) {
  if (state.currentGameState !== gameStates.WAITING) return false;

  const leftReadyCount = state.readyState.left.size;
  const rightReadyCount = state.readyState.right.size;
  const leftPlayerCount = state.teams.left.size;
  const rightPlayerCount = state.teams.right.size;

  // Condiciones para empezar: Al menos 1 jugador por equipo, y TODOS listos
  if (leftPlayerCount > 0 && rightPlayerCount > 0 &&
    leftReadyCount === leftPlayerCount && rightReadyCount === rightPlayerCount) {
    console.log(`[${roomId}] ¡Iniciando juego!`);
    startGame(roomId, state);
    return true;
  }
  return false;
}

function startGame(roomId, state) {
  state.currentGameState = gameStates.PLAYING;
  state.score = { left: 0, right: 0 };
  state.gameOverData = null; // Limpiar datos de juego anterior
  resetBall(state);
  resetPlayersPositions(roomId, state); // Pasar roomId para emitir estado inicial
  io.to(roomId).emit('gameStart'); // Avisar a los clientes
  io.to(roomId).emit('scoreUpdate', state.score); // Enviar score inicial

  // Iniciar el bucle de física/juego si no está corriendo
  if (!state.gameLoopInterval) {
    state.lastUpdateTime = performance.now();
    state.gameLoopInterval = setInterval(() => {
      // Separar lógica de física y emisión
      updateGamePhysics(roomId, state);
      emitGameState(roomId, state);
    }, 1000 / PHYSICS_TICK_RATE);
    console.log(`[${roomId}] Bucle de juego iniciado para ${roomId}.`);
  }
}

function stopGame(roomId, state, reason, finalScore, winningTeam) {
  if (state.currentGameState === gameStates.GAME_OVER) return; // Evitar múltiples llamadas

  console.log(`[${roomId}] Intentando detener juego. Razón: ${reason}`);
  if (state.gameLoopInterval) {
    clearInterval(state.gameLoopInterval);
    state.gameLoopInterval = null;
    console.log(`[${roomId}] Bucle de juego detenido para ${roomId}.`);
  }

  if (state.goalScoredTimeout) {
    clearTimeout(state.goalScoredTimeout);
    state.goalScoredTimeout = null;
  }

  state.currentGameState = gameStates.GAME_OVER;
  state.gameOverData = { reason, finalScore, winningTeam, goalsToWin: GOALS_TO_WIN };

  // Resetear estado 'listo' de jugadores
  state.players.forEach(player => {
    player.ready = false;
    player.isControllingBall = false;
  });
  state.readyState.left.clear();
  state.readyState.right.clear();

  io.to(roomId).emit('gameOver', state.gameOverData);
  console.log(`[${roomId}] Juego terminado: ${reason}`);

  // Programa el reinicio de la sala después de un tiempo (ej: 10-15 segundos)
  console.log(`[${roomId}] Programando reinicio de sala en 15 segundos...`);
  setTimeout(() => resetFullRoomState(roomId, state), 15000); // 15 segundos
}

// Reinicia la sala al estado WAITING, manteniendo jugadores y equipos
function resetFullRoomState(roomId, state) {
  if (!state) return;
  console.log(`[${roomId}] Reiniciando estado de sala a WAITING.`);

  if (state.gameLoopInterval) {
    clearInterval(state.gameLoopInterval);
    state.gameLoopInterval = null;
  }
  if (state.goalScoredTimeout) {
    clearTimeout(state.goalScoredTimeout);
    state.goalScoredTimeout = null;
  }

  state.currentGameState = gameStates.WAITING;
  state.score = { left: 0, right: 0 };
  state.gameOverData = null;
  resetBall(state);
  state.readyState.left.clear();
  state.readyState.right.clear();

  // Reposicionar jugadores y resetear estado 'listo'
  state.players.forEach(player => {
    player.ready = false;
    player.isControllingBall = false;
    if (player.team) {
      player.position = getSpawnPosition(player.team);
    } else {
      player.position.set(0, PLAYER_RADIUS, (Math.random() - 0.5) * 5);
    }
    player.velocity.set(0, 0, 0);
    // Mantener personaje seleccionado
  });

  const status = getTeamStatus(state);
  io.to(roomId).emit('teamUpdate', status.teams);
  io.to(roomId).emit('readyUpdate', getReadyPayload(state)); // Enviar estado 'listo' vacío
  io.to(roomId).emit('gameStateInfo', { currentState: state.currentGameState });
  emitGameState(roomId, state); // Enviar estado inicial de posiciones
}

function handleGoal(roomId, state, scoringTeam) {
  // Doble chequeo por si acaso
  if (state.currentGameState !== gameStates.PLAYING) {
    console.log(`[${roomId}] Intento de gol ignorado, estado actual: ${state.currentGameState}`);
    return;
  }

  state.currentGameState = gameStates.GOAL_SCORED; // Cambiar estado INMEDIATAMENTE

  if (scoringTeam === 'left') {
    state.score.left++;
    console.log(`[${roomId}] Gol para equipo IZQUIERDO. Score: ${state.score.left}-${state.score.right}`);
  } else {
    state.score.right++;
    console.log(`[${roomId}] Gol para equipo DERECHO. Score: ${state.score.left}-${state.score.right}`);
  }

  io.to(roomId).emit('goalScored', { team: scoringTeam, score: state.score });

  // Comprobar victoria ANTES de reiniciar
  if (state.score.left >= GOALS_TO_WIN) {
    stopGame(roomId, state, getWinningMessage('left'), { ...state.score }, 'left');
    return; // Importante: salir para no programar el reinicio
  }
  if (state.score.right >= GOALS_TO_WIN) {
    stopGame(roomId, state, getWinningMessage('right'), { ...state.score }, 'right');
    return; // Importante: salir para no programar el reinicio
  }

  // Si no hay victoria, programar reinicio
  console.log(`[${roomId}] Gol anotado, pausando para reinicio...`);
  // Limpiar timeout anterior por si acaso (aunque el cambio de estado debería prevenirlo)
  if (state.goalScoredTimeout) clearTimeout(state.goalScoredTimeout);

  state.goalScoredTimeout = setTimeout(() => {
    // Solo reiniciar si seguimos en estado GOAL_SCORED (no GAME_OVER)
    if (state.currentGameState === gameStates.GOAL_SCORED) {
      console.log(`[${roomId}] Reiniciando juego después de gol.`);
      resetBall(state);
      resetPlayersPositions(roomId, state); // Pasar roomId
      state.currentGameState = gameStates.PLAYING; // Reanudar juego
      io.to(roomId).emit('gameStateInfo', { currentState: state.currentGameState }); // Notificar reanudación
      state.goalScoredTimeout = null;
    } else {
      console.log(`[${roomId}] Reinicio cancelado, estado del juego ya es ${state.currentGameState}`);
    }
  }, 3000); // 3 segundos de pausa
}

function checkPlayerOutOfBounds(state, roomId) {
  state.players.forEach(player => {
    if (Math.abs(player.position.x) > FIELD_WIDTH / 2 + 2 || Math.abs(player.position.z) > FIELD_HEIGHT / 2 + 2) {
      console.warn(`[${roomId}] Jugador ${player.name} fuera de límites, reposicionando.`);
      if (player.team) {
        player.position = getSpawnPosition(player.team);
      } else {
        player.position.set(0, PLAYER_RADIUS, 0);
      }
      player.velocity.set(0, 0, 0);
      // Considerar emitir estado aquí si es un cambio importante
    }
  });
}

// --- Bucle Principal de Física y Lógica ---
function updateGamePhysics(roomId, state) {
  const now = performance.now();
  // Usar PHYSICS_DT directamente para la física, deltaTime solo para referencia o lógica no física
  // const deltaTime = Math.min((now - state.lastUpdateTime) / 1000, PHYSICS_DT * 3); // Clamp para evitar saltos grandes
  state.lastUpdateTime = now;

  if (state.currentGameState !== gameStates.PLAYING) {
    return; // No actualizar física si no se está jugando activamente
  }

  // 1. Actualizar Jugadores
  state.players.forEach(player => {
    const movement = state.playerMovements.get(player.id);
    if (!movement || !player.team) return;

    // Aplicar velocidad instantánea basada en input (más responsivo)
    // Podríamos añadir aceleración/inercia si quisiéramos
    player.velocity.copyFrom(movement.moveDirection).scaleInPlace(PLAYER_SPEED);

    // Integración de Euler simple
    player.position.addInPlace(player.velocity.scale(PHYSICS_DT));

    // Colisiones con bordes
    if (player.position.x < -FIELD_WIDTH / 2 + PLAYER_RADIUS) {
      player.position.x = -FIELD_WIDTH / 2 + PLAYER_RADIUS; player.velocity.x = 0;
    } else if (player.position.x > FIELD_WIDTH / 2 - PLAYER_RADIUS) {
      player.position.x = FIELD_WIDTH / 2 - PLAYER_RADIUS; player.velocity.x = 0;
    }
    if (player.position.z < -FIELD_HEIGHT / 2 + PLAYER_RADIUS) {
      player.position.z = -FIELD_HEIGHT / 2 + PLAYER_RADIUS; player.velocity.z = 0;
    } else if (player.position.z > FIELD_HEIGHT / 2 - PLAYER_RADIUS) {
      player.position.z = FIELD_HEIGHT / 2 - PLAYER_RADIUS; player.velocity.z = 0;
    }
    player.position.y = PLAYER_RADIUS; // Mantener en el suelo

    // Rotación (Mirar en la dirección del movimiento)
    if (movement.moveDirection.lengthSquared() > 0.01) { // Usar input para rotación más directa
      const angle = Math.atan2(movement.moveDirection.x, movement.moveDirection.z);
      Quaternion.FromEulerAnglesToRef(0, angle, 0, player.rotation);
    }
  });

  // 2. Actualizar Pelota
  // Aplicar fricción (excepto inmediatamente después de un disparo)
  const nowMs = performance.now();
  const inShotWindow = (nowMs - state.ballLastShotTime) < state.ballFrictionCooldownMs;
  if (!inShotWindow) {
    state.ballVelocity.scaleInPlace(Math.pow(FRICTION, PHYSICS_DT / (1 / 60))); // Ajustar a DT
  }

  // Integración de Euler
  state.ballPosition.addInPlace(state.ballVelocity.scale(PHYSICS_DT));

  // Colisiones con bordes y Goles
  let scored = false;
  if (Math.abs(state.ballPosition.x) >= FIELD_WIDTH / 2 - BALL_RADIUS) {
    
    // Verificar si está dentro del ancho de la portería (Eje Z) y altura (Eje Y)
    const inGoalWidth = state.ballPosition.z >= GOAL_Z_MIN && state.ballPosition.z <= GOAL_Z_MAX;
    const inGoalHeight = state.ballPosition.y < 3; // Altura del travesaño
    
    if (inGoalWidth && inGoalHeight) {
      // ESTÁ DENTRO DE LA PORTERÍA
      
      // 1. Detectar Gol si no se ha marcado aún
      // Solo marcamos gol si acaba de cruzar la línea (para evitar spamming)
      // Un chequeo simple es si el estado actual NO es GOAL_SCORED
      if (state.currentGameState === gameStates.PLAYING) {
        const scoringTeam = state.ballPosition.x > 0 ? 'left' : 'right';
        handleGoal(roomId, state, scoringTeam);
        scored = true; 
      }

      // 2. Física de la Red (Nuevo)
      // Si la pelota llega al fondo de la red (Límite del campo + profundidad red)
      const goalBackX = (FIELD_WIDTH / 2) + GOAL_NET_DEPTH;
      
      if (Math.abs(state.ballPosition.x) >= goalBackX - BALL_RADIUS) {
        // Rebote contra la red trasera
        state.ballPosition.x = Math.sign(state.ballPosition.x) * (goalBackX - BALL_RADIUS);
        state.ballVelocity.x *= -0.2; // Rebote muy amortiguado (la red absorbe energía)
        state.ballVelocity.z *= 0.9;  // Fricción con la red
      }
      
      // Nota: Podrías añadir rebotes laterales con los postes/red lateral aquí si quisieras ser muy preciso,
      // pero con el fondo basta para que la pelota no se pierda.

    } else {
      // NO ES GOL: Rebote normal contra la pared de fondo (fuera de portería)
      state.ballPosition.x = Math.sign(state.ballPosition.x) * (FIELD_WIDTH / 2 - BALL_RADIUS);
      state.ballVelocity.x *= -RESTITUTION;
    }
  }
  if (!scored && Math.abs(state.ballPosition.z) >= FIELD_HEIGHT / 2 - BALL_RADIUS) {
    state.ballPosition.z = Math.sign(state.ballPosition.z) * (FIELD_HEIGHT / 2 - BALL_RADIUS);
    state.ballVelocity.z *= -RESTITUTION;
  }
  // Colisión con suelo
  if (state.ballPosition.y < BALL_RADIUS) {
    state.ballPosition.y = BALL_RADIUS;
    if (state.ballVelocity.y < 0) {
      state.ballVelocity.y *= -RESTITUTION * 0.5; // Rebote menor
      // Frenar X/Z en rebote suelo
      state.ballVelocity.x *= 0.95;
      state.ballVelocity.z *= 0.95;
    }
  }
  // Si el juego ya no está en PLAYING (porque handleGoal cambió el estado), salir
  if (state.currentGameState !== gameStates.PLAYING) return;


  // 3. Colisiones Jugador-Pelota y Control
  let playerCurrentlyControllingId = null;
  state.players.forEach(p => { if (p.isControllingBall) playerCurrentlyControllingId = p.id; });

  state.players.forEach(player => {
    if (!player.team) return;

    const vecToBall = state.ballPosition.subtract(player.position);
    const distSq = vecToBall.lengthSquared();
    const combinedRadius = PLAYER_RADIUS + BALL_RADIUS;
    const combinedRadiusSq = combinedRadius * combinedRadius;

    // Lógica de Control Activo
    if (player.isControllingBall) {
      if (player.id !== playerCurrentlyControllingId) {
        // Esto no debería pasar si solo uno controla, pero por seguridad:
        player.isControllingBall = false;
        return;
      }

      const controlDuration = (performance.now() - player.ballControlTime) / 1000;
      if (controlDuration >= 3) {
        console.log(`[${roomId}] ${player.name} pierde control por tiempo.`);
        player.isControllingBall = false;
        playerCurrentlyControllingId = null; // Liberar control
        // Empuje en la dirección a la que mira al expirar
        const forward = new Vector3(0, 0, 1);
        const rotationMatrix = new Matrix();
        player.rotation.toRotationMatrix(rotationMatrix);
        const worldForward = Vector3.TransformNormal(forward, rotationMatrix).normalize();
        const expireSpeed = 6; // menor que un disparo manual
        state.ballVelocity = worldForward.scale(expireSpeed);
      } else {
        // Mantener pelota al frente
        const forward = new Vector3(0, 0, 1); // Local Z+
        const rotationMatrix = new Matrix();
        player.rotation.toRotationMatrix(rotationMatrix); // Usar rotación del jugador
        const worldForward = Vector3.TransformNormal(forward, rotationMatrix).normalize();

        const targetBallPos = player.position.add(worldForward.scale(PLAYER_RADIUS + BALL_RADIUS + 0.1));
        targetBallPos.y = BALL_RADIUS;
        state.ballPosition = Vector3.Lerp(state.ballPosition, targetBallPos, 0.35); // Un poco más rápido
        state.ballVelocity.set(0, 0, 0);
      }
    }
    // Colisión Física (si NADIE la controla o si choca con otro jugador)
    else if (distSq < combinedRadiusSq) {
      // console.log(`[${roomId}] Colisión física: ${player.name}`); // Log spam
      const normal = vecToBall.normalize();
      const relativeVelocity = state.ballVelocity.subtract(player.velocity);
      const velocityAlongNormal = Vector3.Dot(relativeVelocity, normal);

      if (velocityAlongNormal < 0) { // Solo si se acercan
        // Restitution boost multiplier (1.5) - Makes ball "shoot" on contact instead of sticking to foot
        const restitutionBoost = 1.5;
        const impulseMagnitude = -(1 + RESTITUTION * restitutionBoost) * velocityAlongNormal / (INV_BALL_MASS + INV_PLAYER_MASS);
        const impulse = normal.scale(impulseMagnitude);
        state.ballVelocity.addInPlace(impulse.scale(INV_BALL_MASS));
        // player.velocity.subtractInPlace(impulse.scale(INV_PLAYER_MASS)); // El jugador se ve menos afectado

        // Separación
        const overlap = combinedRadius - Math.sqrt(distSq);
        if (overlap > 0) {
          const separation = normal.scale(overlap * 0.51); // 0.51 para asegurar separación
          state.ballPosition.addInPlace(separation);
          // player.position.subtractInPlace(separation);
        }
      }
    }
  });

  // 4. Limitar Velocidades y Detener Pelota
  const maxBallSpeedSq = 65 * 65; // Maximum speed limit - Must be greater than BALL_RELEASE_MAX (60)
  if (state.ballVelocity.lengthSquared() > maxBallSpeedSq) {
    state.ballVelocity.normalize().scaleInPlace(Math.sqrt(maxBallSpeedSq));
  }
  if (state.ballVelocity.lengthSquared() < 0.05 * 0.05 && state.ballPosition.y === BALL_RADIUS) {
    state.ballVelocity.set(0, 0, 0); // Detener si es muy lenta en el suelo
  }

  // 5. Verificar Out of Bounds (Opcional)
  // checkPlayerOutOfBounds(state, roomId);

} // Fin de updateGamePhysics


// --- Emisión de Estado ---
function emitGameState(roomId, state) {
  // Crear payload solo con datos necesarios para el cliente
  const playersData = Array.from(state.players.values()).map(p => ({
    id: p.id,
    name: p.name,
    team: p.team,
    characterType: p.characterType,
    position: vector3ToObject(p.position),
    rotation: quaternionToObject(p.rotation),
    isMoving: state.playerMovements.get(p.id)?.moveDirection.lengthSquared() > 0.01,
    isControllingBall: p.isControllingBall,
    // ready: p.ready // Podría ser útil para la UI
  }));

  // Calcular jugador que controla y tiempo restante
  let controllingPlayerId = null;
  let controlRemainingMs = 0;
  state.players.forEach(p => {
    if (p.isControllingBall) {
      controllingPlayerId = p.id;
      controlRemainingMs = Math.max(0, 3000 - (performance.now() - p.ballControlTime));
    }
  });

  const gameStatePayload = {
    players: playersData,
    ballPosition: vector3ToObject(state.ballPosition),
    score: state.score,
    currentState: state.currentGameState, // Enviar estado para UI cliente
    controllingPlayerId,
    controlRemainingMs
  };

  // Emitir a la sala específica
  io.to(roomId).volatile.emit('gameStateUpdate', gameStatePayload);
}


// --- Manejadores de Eventos de Socket.IO ---
io.on('connection', (socket) => {
  console.log(`++ Cliente conectado: ${socket.id}`);
  let currentRoomId = null; // ID de la sala para este socket

  // Handler 'joinGame'
  socket.on('joinGame', ({ name, roomId }) => {
    console.log(`[${roomId || 'N/A'}] -> joinGame de ${socket.id} (${name})`);

    // Validaciones
    if (!roomId || !availableSalas.includes(roomId)) {
      console.error(`[${roomId || 'N/A'}] Error joinGame: Sala inválida '${roomId}'`);
      return socket.emit('joinError', { message: 'Sala inválida.' });
    }
    const state = salaStates[roomId];
    if (!state) {
      console.error(`[${roomId}] Error joinGame: Estado de sala no encontrado.`);
      return socket.emit('joinError', { message: 'Error interno del servidor.' });
    }
    const sanitizedName = sanitizeInput(name, 15); // Limitar nombre
    if (!sanitizedName) {
      console.error(`[${roomId}] Error joinGame: Nombre inválido.`);
      return socket.emit('joinError', { message: 'Nombre inválido o vacío.' });
    }
    // Evitar unirse si el nombre ya está en uso en esa sala
    let nameExists = false;
    state.players.forEach(p => { if (p.name === sanitizedName) nameExists = true; });
    if (nameExists) {
      console.error(`[${roomId}] Error joinGame: Nombre "${sanitizedName}" ya en uso.`);
      return socket.emit('joinError', { message: `El nombre "${sanitizedName}" ya está en uso.` });
    }

    // Rechazar si el juego está lleno (considerando equipos) o en progreso?
    // if (state.players.size >= MAX_PLAYERS_PER_TEAM * 2) {
    //    return socket.emit('joinError', { message: 'La sala está llena.' });
    // }
    if (state.currentGameState === gameStates.PLAYING) {
      console.log(`[${roomId}] Aviso joinGame: Juego en progreso para ${sanitizedName}.`);
      // Permitir unirse pero informar que está en progreso
      // socket.emit('gameInProgress', { score: state.score });
      // O podrías rechazar:
      // return socket.emit('joinError', { message: 'Partida en curso, inténtalo más tarde.' });
    }


    // Unir socket a la sala y almacenar roomId
    socket.join(roomId);
    currentRoomId = roomId; // Asociar este socket a la sala

    // Crear datos completos del jugador
    const playerData = {
      id: socket.id,
      name: sanitizedName,
      team: null,
      characterType: null,
      position: new Vector3(0, PLAYER_RADIUS, (Math.random() - 0.5) * 5), // Posición inicial antes de equipo
      rotation: new Quaternion(0, 0, 0, 1), // Rotación inicial
      velocity: new Vector3(0, 0, 0),
      ready: false,
      isControllingBall: false,
      ballControlTime: 0,
      roomId: roomId // Referencia a su sala
    };
    state.players.set(socket.id, playerData);
    state.playerMovements.set(socket.id, { moveDirection: Vector3.Zero() });

    console.log(`[${roomId}] Jugador ${sanitizedName} (${socket.id}) añadido y unido.`);

    // Enviar confirmación y estado actual al nuevo jugador
    socket.emit('gameJoined', { id: socket.id, name: sanitizedName, roomId: roomId });
    const status = getTeamStatus(state);
    socket.emit('teamUpdate', status.teams);
    socket.emit('readyUpdate', getReadyPayload(state)); // Enviar estado listo actual
    socket.emit('gameStateInfo', { currentState: state.currentGameState, score: state.score });
    if (state.gameOverData) {
      socket.emit('gameOver', state.gameOverData); // Informar si el juego anterior terminó
    }


    // Notificar a todos en la sala (incluido el nuevo)
    io.to(roomId).emit('playersListUpdate', Array.from(state.players.values()).map(p => ({
      id: p.id, name: p.name, team: p.team, characterType: p.characterType
    })));
    // Enviar estado de juego actual a todos para sincronizar nuevas posiciones/estado
    emitGameState(roomId, state);

  });

  // Handler 'selectTeam'
  socket.on('selectTeam', ({ team }) => {
    if (!currentRoomId) return console.error(`[${socket.id}] Error selectTeam: Socket no está en una sala.`);
    const state = salaStates[currentRoomId];
    const player = state.players.get(socket.id);

    console.log(`[${currentRoomId}] -> selectTeam de ${player?.name || socket.id}. Equipo: ${team}`);

    if (!player) return console.error(`[${currentRoomId}] Error selectTeam: Jugador ${socket.id} no encontrado.`);
    if (team !== 'left' && team !== 'right') return socket.emit('selectTeamError', { message: 'Equipo inválido' });
    if (state.teams[team].size >= MAX_PLAYERS_PER_TEAM && !state.teams[team].has(socket.id)) {
      return socket.emit('selectTeamError', { message: 'Este equipo está lleno' });
    }
    // Permitir cambio de equipo solo si el juego no ha empezado
    if (state.currentGameState !== gameStates.WAITING && state.currentGameState !== gameStates.GAME_OVER) {
      return socket.emit('selectTeamError', { message: 'No puedes cambiar de equipo ahora.' });
    }

    // Quitar del equipo y estado 'listo' anterior
    if (player.team && state.teams[player.team]) {
      state.teams[player.team].delete(socket.id);
      state.readyState[player.team].delete(socket.id);
      player.ready = false; // Asegurar que no está listo
    }

    // Asignar nuevo equipo y posición
    player.team = team;
    state.teams[team].add(socket.id);
    player.position = getSpawnPosition(team);
    player.characterType = null; // Resetear personaje al cambiar de equipo
    player.ready = false; // Asegurar que no está listo

    console.log(`[${currentRoomId}] Jugador ${player.name} movido al equipo ${team}.`);

    // Emitir actualizaciones a la sala
    const status = getTeamStatus(state);
    io.to(currentRoomId).emit('teamUpdate', status.teams);
    io.to(currentRoomId).emit('readyUpdate', getReadyPayload(state));
    socket.emit('teamSelected', { team }); // Confirmación individual
    // Enviar actualización completa para reflejar cambio de equipo/personaje/posición
    emitGameState(currentRoomId, state);

  });

  // Handler 'selectCharacter'
  socket.on('selectCharacter', ({ characterType }) => {
    if (!currentRoomId) return console.error(`[${socket.id}] Error selectCharacter: Socket no está en una sala.`);
    const state = salaStates[currentRoomId];
    const player = state.players.get(socket.id);

    console.log(`[${currentRoomId}] -> selectCharacter de ${player?.name || socket.id}. Personaje: ${characterType}`);

    if (!player) return console.error(`[${currentRoomId}] Error selectCharacter: Jugador ${socket.id} no encontrado.`);
    if (!player.team) return socket.emit('selectCharacterError', { message: 'Selecciona un equipo primero.' });
    if (player.ready) return socket.emit('selectCharacterError', { message: 'Cancela tu estado "Listo" para cambiar.' });

    // Permitir deseleccionar (null)
    const isValid = characterType === null || TEAM_CHARACTERS[player.team].includes(characterType);
    if (!isValid) {
      return socket.emit('selectCharacterError', { message: 'Personaje no válido para tu equipo.' });
    }

    player.characterType = characterType;
    console.log(`[${currentRoomId}] Jugador ${player.name} personaje actualizado a: ${characterType}`);

    // Notificar a todos (teamUpdate ahora incluye characterType)
    const status = getTeamStatus(state);
    io.to(currentRoomId).emit('teamUpdate', status.teams);
    socket.emit('characterSelected', { characterType }); // Confirmar al jugador
  });

  // Handler 'toggleReady'
  socket.on('toggleReady', () => {
    if (!currentRoomId) return console.error(`[${socket.id}] Error toggleReady: Socket no está en una sala.`);
    const state = salaStates[currentRoomId];
    const player = state.players.get(socket.id);

    console.log(`[${currentRoomId}] -> toggleReady de ${player?.name || socket.id}.`);

    if (!player || !player.team) return console.error(`[${currentRoomId}] Error toggleReady: Jugador no encontrado o sin equipo.`);
    // Requerir personaje para estar listo
    if (!player.characterType && !player.ready) { // Si intenta ponerse listo sin personaje
      return socket.emit('readyError', { message: 'Debes seleccionar un personaje.' });
    }
    // No permitir cambiar a listo si el juego ya empezó (solo a no listo)
    if (state.currentGameState !== gameStates.WAITING && state.currentGameState !== gameStates.GAME_OVER && !player.ready) {
      return socket.emit('readyError', { message: 'La partida ya ha comenzado.' });
    }


    player.ready = !player.ready;

    if (player.ready) {
      state.readyState[player.team].add(socket.id);
      console.log(`[${currentRoomId}] Jugador ${player.name} está LISTO.`);
    } else {
      state.readyState[player.team].delete(socket.id);
      console.log(`[${currentRoomId}] Jugador ${player.name} YA NO está listo.`);
    }

    // Emitir actualización de estado 'listo' a la sala
    io.to(currentRoomId).emit('readyUpdate', getReadyPayload(state));

    // Comprobar si el juego debe empezar (solo si estamos esperando)
    if (state.currentGameState === gameStates.WAITING) {
      checkStartGame(currentRoomId, state);
    }
  });

  // --- Manejo de Movimiento ---
  // Espera un objeto { x, z } normalizado o null
  socket.on('playerMove', (moveData) => {
    if (!currentRoomId) return; // Ignorar si no está en sala
    const state = salaStates[currentRoomId];
    const movementState = state.playerMovements.get(socket.id);
    const player = state.players.get(socket.id);

    // Ignorar si el jugador no existe, no tiene estado de movimiento, o el juego no está en PLAYING
    if (!movementState || !player || state.currentGameState !== gameStates.PLAYING) return;

    if (moveData && typeof moveData.x === 'number' && typeof moveData.z === 'number') {
      // Usar y normalizar el vector recibido
      movementState.moveDirection.copyFromFloats(moveData.x, 0, moveData.z);
      // Normalizar solo si no es el vector cero
      if (movementState.moveDirection.lengthSquared() > 0.001) {
        movementState.moveDirection.normalize();
      } else {
        movementState.moveDirection.set(0, 0, 0); // Asegurar que sea cero si es muy pequeño
      }
    } else {
      // Si moveData es null o inválido, detener movimiento
      movementState.moveDirection.set(0, 0, 0);
    }
    // No emitimos nada aquí, el estado se envía en el bucle principal
  });

  // Eliminados handlers playerMoveStart/playerMoveStop en favor de playerMove con vector

  // Handler 'ballControl'
  socket.on('ballControl', ({ control }) => {
    if (!currentRoomId) return;
    const state = salaStates[currentRoomId];
    const player = state.players.get(socket.id);
    if (!player || state.currentGameState !== gameStates.PLAYING) return;

    //console.log(`[${currentRoomId}] -> ballControl de ${player.name}. Control: ${control}`);

    if (control === true) {
      // Intenta tomar control
      const distSq = state.ballPosition.subtract(player.position).lengthSquared();
      const controlRadiusSq = BALL_CONTROL_RADIUS * BALL_CONTROL_RADIUS;
      let alreadyControlled = false;
      state.players.forEach(p => { if (p.isControllingBall) alreadyControlled = true; });

      if (!alreadyControlled && distSq < controlRadiusSq) {
        player.isControllingBall = true;
        player.ballControlTime = performance.now();
        state.ballVelocity.set(0, 0, 0); // Detener balón
        console.log(`[${currentRoomId}] ${player.name} INICIA control de balón.`);
      } else {
        //console.log(`[${currentRoomId}] ${player.name} FALLA control.`);
      }
    } else if (control === false) {
      // Soltar el balón (disparo)
      if (player.isControllingBall) {
        player.isControllingBall = false;
        console.log(`[${currentRoomId}] ${player.name} SUELTA balón (disparo).`);

        // Calcular dirección del disparo (hacia donde mira el jugador)
        const forward = new Vector3(0, 0, 1); // Z local
        const rotationMatrix = new Matrix();
        player.rotation.toRotationMatrix(rotationMatrix);
        let worldForward = Vector3.TransformNormal(forward, rotationMatrix).normalize();

        // Mezclar con dirección de movimiento si existe para mayor control
        const movement = (salaStates[currentRoomId].playerMovements.get(socket.id)?.moveDirection) || Vector3.Zero();
        if (movement.lengthSquared() > 0.01) {
          worldForward = worldForward.add(movement).normalize();
        }

        // Aplicar impulso proporcional al tiempo de control (0..3s)
        const nowTs = performance.now();
        const controlHeldSec = Math.min(3, Math.max(0, (nowTs - player.ballControlTime) / 1000));
        const t = controlHeldSec / 3; // 0..1
        const speed = BALL_RELEASE_MIN + (BALL_RELEASE_MAX - BALL_RELEASE_MIN) * t;
        // Conservar momento previo del balón en dirección del tiro (proyección positiva)
        const prevAlongForward = Vector3.Dot(state.ballVelocity, worldForward);
        const momentumBoost = Math.max(0, prevAlongForward * 0.8); // Aumentado de 0.4 a 0.8 para dar más peso a la inercia del jugador
        state.ballVelocity = worldForward.scale(speed + momentumBoost);
        state.ballLastShotTime = nowTs; // activar ventana sin fricción
        console.log(`[${currentRoomId}] Velocidad disparo: ${state.ballVelocity.length().toFixed(2)} (hold ${controlHeldSec.toFixed(2)}s)`);

        // Empujar pelota ligeramente para evitar recolisión inmediata
        state.ballPosition.addInPlace(state.ballVelocity.normalize().scale(PLAYER_RADIUS + BALL_RADIUS + 0.1));
      }
    }
    // El estado se emitirá en el siguiente tick de emitGameState
  });

  // Handler 'chatMessage'
  socket.on('chatMessage', (message) => {
    if (!currentRoomId) return;
    const state = salaStates[currentRoomId];
    const player = state.players.get(socket.id);
    if (!player) return;

    const sanitizedMessage = sanitizeInput(message);
    if (!sanitizedMessage) return;

    console.log(`[${currentRoomId}] Chat [${player.name}]: ${sanitizedMessage}`);
    // Emitir a la sala correcta
    io.to(currentRoomId).emit('chatUpdate', {
      playerId: socket.id,
      playerName: player.name,
      message: sanitizedMessage,
      timestamp: Date.now()
    });
  });

  // Handler 'disconnect'
  socket.on('disconnect', (reason) => {
    console.log(`-- Cliente desconectado: ${socket.id}. Sala: ${currentRoomId || 'N/A'}. Razón: ${reason}`);
    if (!currentRoomId) return; // Si nunca se unió a una sala

    const state = salaStates[currentRoomId];
    if (!state) return; // Si la sala ya no existe? (raro)

    const player = state.players.get(socket.id);

    if (player) {
      console.log(`[${currentRoomId}] Limpiando jugador ${player.name} (${socket.id}) por desconexión.`);

      // Quitar de equipos y estado 'listo'
      if (player.team) {
        state.teams[player.team].delete(socket.id);
        state.readyState[player.team].delete(socket.id);
      }
      // Quitar del mapa principal de jugadores y movimientos
      state.players.delete(socket.id);
      state.playerMovements.delete(socket.id);

      // Notificar a los demás en la sala
      const status = getTeamStatus(state);
      io.to(currentRoomId).emit('teamUpdate', status.teams);
      io.to(currentRoomId).emit('readyUpdate', getReadyPayload(state));
      io.to(currentRoomId).emit('playerLeft', { id: socket.id, name: player.name });
      io.to(currentRoomId).emit('playersListUpdate', Array.from(state.players.values()).map(p => ({
        id: p.id, name: p.name, team: p.team, characterType: p.characterType
      })));


      // Comprobar si el juego debe terminar
      checkGameEndOnDisconnect(currentRoomId, state);

    } else {
      console.log(`[${currentRoomId}] Advertencia: Jugador ${socket.id} desconectado no encontrado en estado.`);
    }

    // Importante: No limpiar currentRoomId aquí, se limpia para el próximo ciclo de conexión
    // currentRoomId = null; // No hacer esto aquí

  }); // Fin de socket.on('disconnect')

}); // Fin de io.on('connection')


// --- Función Auxiliar para Fin de Juego por Desconexión ---
function checkGameEndOnDisconnect(roomId, state) {
  // Solo actuar si el juego estaba en progreso
  if (state.currentGameState !== gameStates.PLAYING) return;

  const leftCount = state.teams.left.size;
  const rightCount = state.teams.right.size;

  // No terminar si aún queda al menos un jugador por equipo
  if (leftCount > 0 && rightCount > 0) return;

  console.log(`[${roomId}] Comprobando fin de juego por desconexión. Left: ${leftCount}, Right: ${rightCount}`);

  if (leftCount === 0 && rightCount > 0) {
    // Gana equipo derecho por abandono
    stopGame(roomId, state, getWinningMessage('right') + " (Equipo rival abandonó)", { left: state.score.left, right: GOALS_TO_WIN }, 'right');
  } else if (rightCount === 0 && leftCount > 0) {
    // Gana equipo izquierdo por abandono
    stopGame(roomId, state, getWinningMessage('left') + " (Equipo rival abandonó)", { left: GOALS_TO_WIN, right: state.score.right }, 'left');
  } else if (leftCount === 0 && rightCount === 0) {
    // No quedan jugadores
    stopGame(roomId, state, "Todos los jugadores abandonaron la partida.", state.score, null);
    // Podríamos resetear inmediatamente aquí si quisiéramos
    // resetFullRoomState(roomId, state);
  }
}


// --- Inicio del Servidor HTTP ---
const PORT = process.env.PORT || 4000;
httpServer.listen(PORT, '0.0.0.0', () => { // Escuchar en todas las interfaces
  console.log(`Servidor de juego corriendo en el puerto ${PORT} y escuchando en 0.0.0.0`);
});