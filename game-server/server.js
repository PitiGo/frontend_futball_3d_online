// server.js - Refactorizado para gestión por sala

import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { Vector3, Quaternion, Matrix } from '@babylonjs/core'; // Añadir Matrix
import cors from 'cors';
import { performance } from 'perf_hooks'; // Para performance.now() en Node.js
import {
  getCharacterStats,
  resolveBallGoalPostCollisions,
  isBallInGoal,
  findPassAssistDirection,
  stepPlayerVelocityXZ,
  FIELD_WIDTH,
  FIELD_HEIGHT,
  GOAL_Z_MIN,
  GOAL_Z_MAX,
  GOAL_NET_DEPTH,
  BALL_RADIUS,
} from './physics/collisions.js';

const app = express();

// --- Logger gateado por entorno ---
// En producción (NODE_ENV=production) silenciamos los logs de depuración para
// reducir ruido; warn/error siempre se muestran. Forzar con LOG_LEVEL=debug.
const DEBUG_LOGS = process.env.LOG_LEVEL === 'debug' || process.env.NODE_ENV !== 'production';
const _console = console;
const log = (...args) => { if (DEBUG_LOGS) _console.log(...args); };
const warn = (...args) => _console.warn(...args);
const error = (...args) => _console.error(...args);

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
  "https://dantecollazzi.com", // Domain without www
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
const PLAYER_RADIUS = 0.5;
const PLAYER_SPEED = 5; // Velocidad base (unidades por segundo) - Reference: Player moves at 5 u/s
const BALL_MASS = 0.45;
const PLAYER_MASS = 75; // Masa real
const INV_BALL_MASS = 1 / BALL_MASS;
const INV_PLAYER_MASS = 1 / PLAYER_MASS;
const FRICTION = 0.98; // Arcade feel: less sliding on the pitch
const RESTITUTION = 0.6; // Coeficiente de restitución (elasticidad)
const MAX_PLAYERS_PER_TEAM = 3;
const GOALS_TO_WIN = 3;
const BALL_CONTROL_RADIUS = 1.5;
const BALL_RELEASE_MIN = 13; // Minimum shot speed (quick tap)
const BALL_RELEASE_MAX = 22; // Maximum shot speed (full charge) — reducido para que ni a máxima carga cruce todo el campo
const MAX_BALL_SPEED = 28; // Cap above release max; keeps shots readable
const PHYSICS_TICK_RATE = 60; // Hz
const STATE_EMIT_RATE = 20; // Hz — physics at 60, network at 20
const EMIT_EVERY_N_TICKS = PHYSICS_TICK_RATE / STATE_EMIT_RATE;
const PHYSICS_DT = 1 / PHYSICS_TICK_RATE; // Delta time para física
const KICKOFF_FREEZE_MS = 2000;

// Duración del partido (parametrizable). Al agotarse, gana quien tenga más goles.
const MATCH_DURATION_MS = (parseInt(process.env.MATCH_DURATION_SEC, 10) || 180) * 1000;

// --- Sprint / Stamina ---
const SPRINT_SPEED_MULTIPLIER = 1.55; // Boost de velocidad mientras se esprinta
const STAMINA_MAX = 100;
const STAMINA_DRAIN_PER_SEC = 32;   // Gasto al esprintar
const STAMINA_REGEN_PER_SEC = 18;   // Recuperación cuando no se esprinta
const STAMINA_RECOVER_THRESHOLD = 30; // Tras agotarse, hay que recuperar hasta aquí para volver a esprintar

const TEAM_CHARACTERS = {
  left: ['player', 'pig'],
  right: ['turtle', 'lizard']
};

// --- Bots / IA simple ---
const BOT_TOUCH_RANGE = 1.4;        // Distancia para tocar/golpear el balón
const BOT_TOUCH_COOLDOWN_MS = 320;  // Separación mínima entre toques (regate fluido)
const BOT_SHOT_COOLDOWN_MS = 900;   // Separación mínima entre disparos potentes
const BOT_DEFEND_BIAS = 0.35;       // Cuánto retrocede un bot lejano hacia su campo
const BOT_SHOOT_DISTANCE = 14;      // Solo dispara a puerta si está a <= esta distancia del arco rival
const BOT_DRIBBLE_SPEED = 9;        // Toque corto de conducción (con fricción → el balón se queda cerca)
const BOT_SHOT_SPEED = 26;          // Disparo a puerta (sin fricción durante la ventana de disparo)

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
    roomId, // Identificador de la sala (para ids de bots, logs, etc.)
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
    ballFrictionCooldownMs: 320,   // Ventana sin fricción tras disparo: lo justo para que salga limpio del pie sin que cruce todo el campo
    goalScoredTimeout: null, // ID del temporizador para reiniciar tras gol
    gameOverTimeout: null,   // ID del temporizador para reiniciar tras game over
    gameOverData: null,     // Datos del resultado final
    gameLoopInterval: null, // ID del intervalo del bucle principal
    playerMovements: new Map(), // Mapa de socket.id -> { moveDirection: Vector3 }
    physicsTickCount: 0,
    kickoffFrozenUntil: 0,
    matchTimeLeftMs: MATCH_DURATION_MS, // Tiempo restante; solo baja en PLAYING activo
    lastBounceEmit: 0, // Throttle para el evento de sonido de rebote
    lastShooter: null, // { id, team } del último jugador que impulsó el balón (atribución de goles)
    scorers: new Map(), // id -> { name, team, goals } acumulado del partido (sobrevive a desconexiones)
    botCounter: 0, // Contador para nombrar/identificar bots
    lastSent: new Map(), // id -> snapshot enviado (delta compression)
    emitCount: 0, // Contador de emisiones para keyframes periódicos
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
  // Escapa < y > para nombres/chat. React escapa el DOM por defecto; no usamos dangerouslySetInnerHTML.
  // Para HTML arbitrario en chat, considerar reintroducir sanitize-html.
  return input.replace(/[<>]/g, '').trim().slice(0, maxLength);
}

function vector3ToObject(v) { return v ? { x: v.x, y: v.y, z: v.z } : { x: 0, y: 0, z: 0 }; }
function quaternionToObject(q) { return q ? { x: q.x, y: q.y, z: q.z, w: q.w } : { x: 0, y: 0, z: 0, w: 1 }; }

// Network payload optimization: 2-decimal precision (cm-level on a 40x30 pitch)
// shrinks each float's JSON length. Sent 20x/sec per player, this adds up.
function round2(n) { return Math.round(n * 100) / 100; }
function vector3ToNetObject(v) {
  return v ? { x: round2(v.x), y: round2(v.y), z: round2(v.z) } : { x: 0, y: 0, z: 0 };
}

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

// kickoffTeam: equipo que saca (recibió el gol). Se le coloca un jugador cerca
// del centro para darle la posesión inicial; el rival arranca más retrasado.
function resetPlayersPositions(roomId, state, kickoffTeam = null) {
  log(`[${roomId}] Reposicionando jugadores.${kickoffTeam ? ` Saque: ${kickoffTeam}` : ''}`);
  const kickoffAssigned = { left: false, right: false };
  state.players.forEach((player) => {
    if (player.team) {
      const side = player.team === 'left' ? -1 : 1;
      if (kickoffTeam && player.team === kickoffTeam && !kickoffAssigned[player.team]) {
        // Primer jugador del equipo que saca: junto al círculo central.
        player.position = new Vector3(side * 2.5, PLAYER_RADIUS, (Math.random() - 0.5) * 4);
        kickoffAssigned[player.team] = true;
      } else if (kickoffTeam && player.team !== kickoffTeam) {
        // Equipo que anotó: retrocede a su propio campo (no contesta el saque).
        player.position = new Vector3(side * (FIELD_WIDTH / 3), PLAYER_RADIUS, (Math.random() - 0.5) * (FIELD_HEIGHT * 0.8));
      } else {
        player.position = getSpawnPosition(player.team);
      }
    } else {
      // Posición central si aún no tiene equipo (raro en este punto)
      player.position.set(0, PLAYER_RADIUS, (Math.random() - 0.5) * 5);
    }
    player.velocity.set(0, 0, 0);
    player.rotation.copyFromFloats(0, 0, 0, 1); // Mirando Z positivo
    player.isControllingBall = false;
    player.ballControlTime = 0;
    player.lastKickTime = 0;
    player.stamina = STAMINA_MAX;
    player.wantSprint = false;
    player.isSprinting = false;
    player.exhausted = false;
    // Asegurarse de que el estado de movimiento esté inicializado
    if (!state.playerMovements.has(player.id)) {
      state.playerMovements.set(player.id, { moveDirection: Vector3.Zero() });
    } else {
      state.playerMovements.get(player.id).moveDirection.set(0, 0, 0);
    }
  });
  if (state.players.size > 0) {
    emitGameState(roomId, state);
  }
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

// Finaliza el partido al agotarse el tiempo: gana quien tenga más goles (o empate).
function endMatchByTime(roomId, state) {
  const { left, right } = state.score;
  let winningTeam = null;
  let reason;
  if (left > right) {
    winningTeam = 'left';
    reason = getWinningMessage('left') + " (Time up)";
  } else if (right > left) {
    winningTeam = 'right';
    reason = getWinningMessage('right') + " (Time up)";
  } else {
    reason = "Time up — it's a draw!";
  }
  stopGame(roomId, state, reason, { ...state.score }, winningTeam);
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
    log(`[${roomId}] ¡Iniciando juego!`);
    startGame(roomId, state);
    return true;
  }
  return false;
}

function startGame(roomId, state) {
  state.currentGameState = gameStates.PLAYING;
  state.score = { left: 0, right: 0 };
  state.gameOverData = null; // Limpiar datos de juego anterior
  state.matchTimeLeftMs = MATCH_DURATION_MS; // Reiniciar reloj de partido
  state.scorers = new Map(); // Reiniciar estadísticas de goleadores
  state.lastShooter = null;
  state.players.forEach((p) => { p.goals = 0; });
  resetBall(state);
  resetPlayersPositions(roomId, state); // Pasar roomId para emitir estado inicial
  io.to(roomId).emit('gameStart'); // Avisar a los clientes
  io.to(roomId).emit('scoreUpdate', state.score); // Enviar score inicial
  io.to(roomId).emit('gameStateInfo', { currentState: state.currentGameState, kickoffInMs: KICKOFF_FREEZE_MS });

  // Iniciar el bucle de física/juego si no está corriendo
  if (!state.gameLoopInterval) {
    state.lastUpdateTime = performance.now();
    state.physicsTickCount = 0;
    state.kickoffFrozenUntil = performance.now() + KICKOFF_FREEZE_MS;
    state.gameLoopInterval = setInterval(() => {
      updateGamePhysics(roomId, state);
      state.physicsTickCount += 1;
      if (state.physicsTickCount % EMIT_EVERY_N_TICKS === 0) {
        emitGameState(roomId, state);
      }
    }, 1000 / PHYSICS_TICK_RATE);
    log(`[${roomId}] Bucle de juego iniciado (${PHYSICS_TICK_RATE}Hz física, ${STATE_EMIT_RATE}Hz red).`);
  }
}

function stopGame(roomId, state, reason, finalScore, winningTeam) {
  if (state.currentGameState === gameStates.GAME_OVER) return; // Evitar múltiples llamadas

  log(`[${roomId}] Intentando detener juego. Razón: ${reason}`);
  if (state.gameLoopInterval) {
    clearInterval(state.gameLoopInterval);
    state.gameLoopInterval = null;
    log(`[${roomId}] Bucle de juego detenido para ${roomId}.`);
  }

  if (state.goalScoredTimeout) {
    clearTimeout(state.goalScoredTimeout);
    state.goalScoredTimeout = null;
  }
  
  // Limpiar timeout anterior de game over si existe
  if (state.gameOverTimeout) {
    clearTimeout(state.gameOverTimeout);
    state.gameOverTimeout = null;
  }

  state.currentGameState = gameStates.GAME_OVER;
  const scorers = Array.from(state.scorers.values())
    .filter((s) => s.goals > 0)
    .sort((a, b) => b.goals - a.goals);
  const mvp = scorers.length > 0 ? scorers[0] : null;
  state.gameOverData = { reason, finalScore, winningTeam, goalsToWin: GOALS_TO_WIN, scorers, mvp };

  // Resetear estado 'listo' de jugadores
  state.players.forEach(player => {
    player.ready = false;
    player.isControllingBall = false;
  });
  state.readyState.left.clear();
  state.readyState.right.clear();

  // Emitir gameOver PRIMERO, antes de cualquier otro evento
  log(`[${roomId}] Emitiendo gameOver con datos:`, JSON.stringify(state.gameOverData, null, 2));
  io.to(roomId).emit('gameOver', state.gameOverData);
  // También emitir gameStateInfo con GAME_OVER para sincronizar estado
  io.to(roomId).emit('gameStateInfo', { currentState: state.currentGameState });
  log(`[${roomId}] Juego terminado: ${reason}. Eventos gameOver y gameStateInfo emitidos.`);

  // Programa el reinicio de la sala después de un tiempo (reduced to 5 seconds for faster flow)
  log(`[${roomId}] Programando reinicio de sala en 5 segundos...`);
  state.gameOverTimeout = setTimeout(() => {
    log(`[${roomId}] Ejecutando reinicio de sala...`);
    state.gameOverTimeout = null;
    resetFullRoomState(roomId, state);
  }, 5000); // 5 segundos
}

// Reinicia la sala al estado WAITING, manteniendo jugadores y equipos
function resetFullRoomState(roomId, state) {
  if (!state) return;
  log(`[${roomId}] Reiniciando estado de sala a WAITING.`);

  if (state.gameLoopInterval) {
    clearInterval(state.gameLoopInterval);
    state.gameLoopInterval = null;
  }
  if (state.goalScoredTimeout) {
    clearTimeout(state.goalScoredTimeout);
    state.goalScoredTimeout = null;
  }
  
  // Limpiar timeout de game over si existe
  if (state.gameOverTimeout) {
    clearTimeout(state.gameOverTimeout);
    state.gameOverTimeout = null;
  }

  state.currentGameState = gameStates.WAITING;
  state.score = { left: 0, right: 0 };
  state.gameOverData = null;
  resetBall(state);
  state.readyState.left.clear();
  state.readyState.right.clear();

  // Reposicionar jugadores y resetear estado 'listo'
  state.players.forEach(player => {
    player.isControllingBall = false;
    player.stamina = STAMINA_MAX;
    player.wantSprint = false;
    player.isSprinting = false;
    player.exhausted = false;
    // Los bots vuelven a quedar listos automáticamente para una revancha.
    if (player.isBot && player.team) {
      player.ready = true;
      state.readyState[player.team].add(player.id);
    } else {
      player.ready = false;
    }
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
  io.to(roomId).emit('scoreUpdate', state.score); // Enviar score actualizado
  emitGameState(roomId, state); // Enviar estado inicial de posiciones
  log(`[${roomId}] Estado de sala reiniciado a WAITING. Eventos emitidos.`);
}

// Acumula un gol para un jugador en las estadísticas del partido.
function creditGoal(state, playerId, name, team) {
  const existing = state.scorers.get(playerId);
  if (existing) {
    existing.goals += 1;
    existing.name = name || existing.name;
  } else {
    state.scorers.set(playerId, { id: playerId, name: name || 'Unknown', team, goals: 1 });
  }
  const player = state.players.get(playerId);
  if (player) player.goals = (player.goals || 0) + 1;
}

function handleGoal(roomId, state, scoringTeam) {
  // Doble chequeo por si acaso
  if (state.currentGameState !== gameStates.PLAYING) {
    log(`[${roomId}] Intento de gol ignorado, estado actual: ${state.currentGameState}`);
    return;
  }

  state.currentGameState = gameStates.GOAL_SCORED; // Cambiar estado INMEDIATAMENTE

  if (scoringTeam === 'left') {
    state.score.left++;
    log(`[${roomId}] Gol para equipo IZQUIERDO. Score: ${state.score.left}-${state.score.right}`);
  } else {
    state.score.right++;
    log(`[${roomId}] Gol para equipo DERECHO. Score: ${state.score.left}-${state.score.right}`);
  }

  // Atribución del gol al último jugador que impulsó el balón.
  let scorerName = null;
  let ownGoal = false;
  const shooter = state.lastShooter;
  if (shooter) {
    const shooterPlayer = state.players.get(shooter.id);
    const shooterName = shooterPlayer ? shooterPlayer.name : (state.scorers.get(shooter.id)?.name || null);
    if (shooter.team === scoringTeam) {
      creditGoal(state, shooter.id, shooterName, scoringTeam);
      scorerName = shooterName;
    } else {
      // El balón entró en su propia portería: autogol (no se acredita).
      ownGoal = true;
      scorerName = shooterName;
    }
  }

  io.to(roomId).emit('goalScored', { team: scoringTeam, score: state.score, scorerName, ownGoal });

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
  log(`[${roomId}] Gol anotado, pausando para reinicio...`);
  // Limpiar timeout anterior por si acaso (aunque el cambio de estado debería prevenirlo)
  if (state.goalScoredTimeout) clearTimeout(state.goalScoredTimeout);

  state.goalScoredTimeout = setTimeout(() => {
    // Solo reiniciar si seguimos en estado GOAL_SCORED (no GAME_OVER)
    if (state.currentGameState === gameStates.GOAL_SCORED) {
      log(`[${roomId}] Reiniciando juego después de gol.`);
      resetBall(state);
      // Saque para el equipo que recibió el gol (ventaja de posesión).
      const concedingTeam = scoringTeam === 'left' ? 'right' : 'left';
      state.lastShooter = null;
      resetPlayersPositions(roomId, state, concedingTeam); // Pasar roomId
      state.currentGameState = gameStates.PLAYING; // Reanudar juego
      state.kickoffFrozenUntil = performance.now() + KICKOFF_FREEZE_MS;
      io.to(roomId).emit('gameStateInfo', { currentState: state.currentGameState, kickoffInMs: KICKOFF_FREEZE_MS }); // Notificar reanudación
      state.goalScoredTimeout = null;
    } else {
      log(`[${roomId}] Reinicio cancelado, estado del juego ya es ${state.currentGameState}`);
    }
  }, 3000); // 3 segundos de pausa
}

function checkPlayerOutOfBounds(state, roomId) {
  state.players.forEach(player => {
    if (Math.abs(player.position.x) > FIELD_WIDTH / 2 + 2 || Math.abs(player.position.z) > FIELD_HEIGHT / 2 + 2) {
      warn(`[${roomId}] Jugador ${player.name} fuera de límites, reposicionando.`);
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

// --- Bots / IA ---
function countHumans(state) {
  let n = 0;
  state.players.forEach((p) => { if (!p.isBot) n += 1; });
  return n;
}

function createBot(state, team) {
  if (team !== 'left' && team !== 'right') return null;
  if (state.teams[team].size >= MAX_PLAYERS_PER_TEAM) return null;
  state.botCounter += 1;
  const id = `bot-${state.roomId || 'r'}-${state.botCounter}`;
  const chars = TEAM_CHARACTERS[team];
  const characterType = chars[Math.floor(Math.random() * chars.length)];
  const bot = {
    id,
    name: `Bot ${state.botCounter}`,
    team,
    characterType,
    position: getSpawnPosition(team),
    rotation: new Quaternion(0, 0, 0, 1),
    velocity: new Vector3(0, 0, 0),
    ready: true, // Los bots siempre están listos
    isBot: true,
    isControllingBall: false,
    ballControlTime: 0,
    lastKickTime: 0,
    stamina: STAMINA_MAX,
    wantSprint: false,
    isSprinting: false,
    exhausted: false,
    goals: 0,
  };
  state.players.set(id, bot);
  state.playerMovements.set(id, { moveDirection: Vector3.Zero() });
  state.teams[team].add(id);
  state.readyState[team].add(id);
  return bot;
}

function removeBotFromTeam(state, team) {
  // Elimina el último bot añadido a ese equipo.
  const botIds = Array.from(state.teams[team]).filter((id) => state.players.get(id)?.isBot);
  if (botIds.length === 0) return false;
  const id = botIds[botIds.length - 1];
  state.players.delete(id);
  state.playerMovements.delete(id);
  state.teams[team].delete(id);
  state.readyState[team].delete(id);
  return true;
}

function removeAllBots(state) {
  ['left', 'right'].forEach((team) => {
    Array.from(state.teams[team]).forEach((id) => {
      if (state.players.get(id)?.isBot) {
        state.players.delete(id);
        state.playerMovements.delete(id);
        state.teams[team].delete(id);
        state.readyState[team].delete(id);
      }
    });
  });
}

// IA por tick: los bots conducen el balón hacia la portería rival con toques
// cortos y solo disparan (con imprecisión) cuando están cerca del arco. Así el
// balón no cruza el campo de una sola patada y los goles son más evitables.
function updateBotAI(state) {
  let controlledByHuman = false;
  state.players.forEach((p) => { if (p.isControllingBall && !p.isBot) controlledByHuman = true; });

  const ball = state.ballPosition;
  const now = performance.now();
  state.players.forEach((bot) => {
    if (!bot.isBot || !bot.team) return;
    const move = state.playerMovements.get(bot.id);
    if (!move) return;

    const toBallX = ball.x - bot.position.x;
    const toBallZ = ball.z - bot.position.z;
    const dist = Math.hypot(toBallX, toBallZ);

    // Dirección base: perseguir el balón.
    if (dist > 0.001) {
      move.moveDirection.copyFromFloats(toBallX / dist, 0, toBallZ / dist);
    } else {
      move.moveDirection.set(0, 0, 0);
    }

    // Si el balón está lejos en su propio campo, frena un poco (postura defensiva).
    const ownHalfSign = bot.team === 'left' ? -1 : 1;
    const ballInOwnHalf = Math.sign(ball.x) === ownHalfSign;
    if (dist > 6 && !ballInOwnHalf) {
      move.moveDirection.scaleInPlace(1 - BOT_DEFEND_BIAS);
    }

    // Tocar el balón solo si está al alcance y no lo controla un humano.
    if (dist >= BOT_TOUCH_RANGE || controlledByHuman) return;

    const goalX = bot.team === 'left' ? FIELD_WIDTH / 2 : -FIELD_WIDTH / 2;
    const distToGoal = Math.hypot(goalX - ball.x, ball.z);
    const stats = getCharacterStats(bot.characterType);
    const isShot = distToGoal <= BOT_SHOOT_DISTANCE;
    const cooldown = isShot ? BOT_SHOT_COOLDOWN_MS : BOT_TOUCH_COOLDOWN_MS;
    if ((now - (bot.lastKickTime || 0)) < cooldown) return;

    // Apuntar al centro del arco rival (preciso, sin imprecisión deliberada).
    const aimX = goalX - ball.x;
    const aimZ = (0 - ball.z);
    const aimLen = Math.hypot(aimX, aimZ) || 1;
    const aim = new Vector3(aimX / aimLen, 0, aimZ / aimLen);

    if (isShot) {
      // Disparo a puerta: rápido y con ventana sin fricción para que llegue.
      const speed = BOT_SHOT_SPEED * (stats.shotMultiplier || 1);
      state.ballVelocity = aim.scale(speed);
      state.ballLastShotTime = now; // activa la ventana sin fricción
    } else {
      // Conducción: toque corto. NO marca ballLastShotTime, así la fricción frena
      // el balón y se queda cerca para el siguiente toque (no cruza el campo).
      const speed = BOT_DRIBBLE_SPEED * (0.85 + Math.random() * 0.3);
      state.ballVelocity = aim.scale(speed);
    }
    state.lastShooter = { id: bot.id, team: bot.team };
    bot.lastKickTime = now;
    const sep = (stats.radius || PLAYER_RADIUS) + BALL_RADIUS + 0.5;
    state.ballPosition.addInPlace(aim.scale(sep));
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

  const kickoffFrozen = performance.now() < state.kickoffFrozenUntil;

  // Reloj de partido: solo corre durante el juego activo (no en saque ni pausas).
  if (!kickoffFrozen) {
    state.matchTimeLeftMs -= PHYSICS_DT * 1000;
    if (state.matchTimeLeftMs <= 0) {
      state.matchTimeLeftMs = 0;
      endMatchByTime(roomId, state);
      return;
    }
    // IA de bots: decide movimiento/golpeo antes de integrar la física.
    updateBotAI(state);
  }

  // 1. Actualizar Jugadores
  state.players.forEach(player => {
    const movement = state.playerMovements.get(player.id);
    if (!movement || !player.team) return;

    const stats = getCharacterStats(player.characterType);
    const playerRadius = stats.radius || PLAYER_RADIUS;

    if (kickoffFrozen) {
      player.velocity.set(0, 0, 0);
      player.position.y = playerRadius;
      return;
    }

    // Sprint / Stamina: drena al esprintar en movimiento, regenera el resto del tiempo.
    const isMoving = movement.moveDirection.lengthSquared() > 0.01;
    if (player.stamina <= 0) player.exhausted = true;
    if (player.stamina >= STAMINA_RECOVER_THRESHOLD) player.exhausted = false;
    const sprinting = player.wantSprint && isMoving && player.stamina > 0 && !player.exhausted;
    if (sprinting) {
      player.stamina = Math.max(0, player.stamina - STAMINA_DRAIN_PER_SEC * PHYSICS_DT);
    } else {
      player.stamina = Math.min(STAMINA_MAX, player.stamina + STAMINA_REGEN_PER_SEC * PHYSICS_DT);
    }
    player.isSprinting = sprinting;
    const speedFactor = sprinting ? SPRINT_SPEED_MULTIPLIER : 1;

    // Aceleración / frenado suave hacia la velocidad objetivo (inercia arcade)
    const maxSpeed = PLAYER_SPEED * stats.speedMultiplier * speedFactor;
    const targetX = movement.moveDirection.x * maxSpeed;
    const targetZ = movement.moveDirection.z * maxSpeed;
    stepPlayerVelocityXZ(player.velocity, targetX, targetZ, PHYSICS_DT);

    // Integración de Euler simple
    player.position.addInPlace(player.velocity.scale(PHYSICS_DT));

    // Colisiones con bordes
    if (player.position.x < -FIELD_WIDTH / 2 + playerRadius) {
      player.position.x = -FIELD_WIDTH / 2 + playerRadius; player.velocity.x = 0;
    } else if (player.position.x > FIELD_WIDTH / 2 - playerRadius) {
      player.position.x = FIELD_WIDTH / 2 - playerRadius; player.velocity.x = 0;
    }
    if (player.position.z < -FIELD_HEIGHT / 2 + playerRadius) {
      player.position.z = -FIELD_HEIGHT / 2 + playerRadius; player.velocity.z = 0;
    } else if (player.position.z > FIELD_HEIGHT / 2 - playerRadius) {
      player.position.z = FIELD_HEIGHT / 2 - playerRadius; player.velocity.z = 0;
    }
    player.position.y = playerRadius; // Mantener en el suelo

    // Rotación: seguir velocidad real cuando se mueve; input cuando arranca
    const horizSpeedSq = player.velocity.x * player.velocity.x + player.velocity.z * player.velocity.z;
    if (horizSpeedSq > 0.05) {
      const angle = Math.atan2(player.velocity.x, player.velocity.z);
      Quaternion.FromEulerAnglesToRef(0, angle, 0, player.rotation);
    } else if (movement.moveDirection.lengthSquared() > 0.01) {
      const angle = Math.atan2(movement.moveDirection.x, movement.moveDirection.z);
      Quaternion.FromEulerAnglesToRef(0, angle, 0, player.rotation);
    }
  });

  // 2. Actualizar Pelota
  if (kickoffFrozen) {
    state.ballVelocity.set(0, 0, 0);
    state.ballPosition.y = BALL_RADIUS;
    return;
  }

  // Aplicar fricción (excepto inmediatamente después de un disparo)
  const nowMs = performance.now();
  const inShotWindow = (nowMs - state.ballLastShotTime) < state.ballFrictionCooldownMs;
  if (!inShotWindow) {
    state.ballVelocity.scaleInPlace(Math.pow(FRICTION, PHYSICS_DT / (1 / 60))); // Ajustar a DT
  }

  // Integración de Euler
  state.ballPosition.addInPlace(state.ballVelocity.scale(PHYSICS_DT));

  // Colisiones con postes de portería (autoritativas, alineadas con el cliente)
  if (resolveBallGoalPostCollisions(state.ballPosition, state.ballVelocity, RESTITUTION)) {
    maybeEmitBounce(roomId, state);
  }

  // Colisiones con bordes y Goles
  let scored = false;
  if (Math.abs(state.ballPosition.x) >= FIELD_WIDTH / 2 - BALL_RADIUS) {

    if (isBallInGoal(state.ballPosition)) {
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
      maybeEmitBounce(roomId, state);
    }
  }
  if (!scored && Math.abs(state.ballPosition.z) >= FIELD_HEIGHT / 2 - BALL_RADIUS) {
    state.ballPosition.z = Math.sign(state.ballPosition.z) * (FIELD_HEIGHT / 2 - BALL_RADIUS);
    state.ballVelocity.z *= -RESTITUTION;
    maybeEmitBounce(roomId, state);
  }
  // Arcade 2D: keep ball on ground — no vertical bounce
  state.ballPosition.y = BALL_RADIUS;
  state.ballVelocity.y = 0;
  // Si el juego ya no está en PLAYING (porque handleGoal cambió el estado), salir
  if (state.currentGameState !== gameStates.PLAYING) return;


  // 3. Colisiones Jugador-Pelota y Control
  let playerCurrentlyControllingId = null;
  state.players.forEach(p => { if (p.isControllingBall) playerCurrentlyControllingId = p.id; });

  state.players.forEach(player => {
    if (!player.team) return;

    const stats = getCharacterStats(player.characterType);
    const playerRadius = stats.radius || PLAYER_RADIUS;
    const controlRadius = stats.controlRadius || BALL_CONTROL_RADIUS;

    const vecToBall = state.ballPosition.subtract(player.position);
    vecToBall.y = 0; // 2D collision on XZ plane — ignore player height differences
    const distSq = vecToBall.lengthSquared();
    const combinedRadius = playerRadius + BALL_RADIUS;
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
        log(`[${roomId}] ${player.name} libera disparo a máxima carga (control expirado).`);
        player.isControllingBall = false;
        playerCurrentlyControllingId = null; // Liberar control
        // Carga máxima: dispara con la máxima potencia en la dirección de mira.
        const forward = new Vector3(0, 0, 1);
        const rotationMatrix = new Matrix();
        player.rotation.toRotationMatrix(rotationMatrix);
        const worldForward = Vector3.TransformNormal(forward, rotationMatrix).normalize();
        worldForward.y = 0;
        if (worldForward.lengthSquared() > 0.001) worldForward.normalize();
        const fullStats = getCharacterStats(player.characterType);
        const fullSpeed = BALL_RELEASE_MAX * fullStats.shotMultiplier;
        state.ballVelocity = worldForward.scale(fullSpeed);
        state.ballLastShotTime = performance.now();
        state.lastShooter = { id: player.id, team: player.team };
        player.lastKickTime = performance.now();
        const sep = (fullStats.radius || PLAYER_RADIUS) + BALL_RADIUS + 0.8;
        state.ballPosition.addInPlace(worldForward.clone().scale(sep));
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
      // If player shot less than 300ms ago, ignore collision
      // This allows ball to exit freely without being slowed by player's body
      const timeSinceKick = performance.now() - (player.lastKickTime || 0);
      if (timeSinceKick < 300) {
        return; // Skip collision physics for this player
      }
      
      // log(`[${roomId}] Colisión física: ${player.name}`); // Log spam
      const normal = vecToBall.normalize();
      const relativeVelocity = state.ballVelocity.subtract(player.velocity);
      const velocityAlongNormal = Vector3.Dot(relativeVelocity, normal);

      if (velocityAlongNormal < 0) { // Solo si se acercan
        // Restitution boost multiplier (1.5) - Makes ball "shoot" on contact instead of sticking to foot
        const restitutionBoost = 1.2;
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

  // 4. Limitar Velocidades y anclar al suelo (física 2D)
  state.ballPosition.y = BALL_RADIUS;
  state.ballVelocity.y = 0;

  const maxBallSpeedSq = MAX_BALL_SPEED * MAX_BALL_SPEED;
  if (state.ballVelocity.lengthSquared() > maxBallSpeedSq) {
    state.ballVelocity.normalize().scaleInPlace(MAX_BALL_SPEED);
  }
  if (state.ballVelocity.lengthSquared() < 0.05 * 0.05 && state.ballPosition.y === BALL_RADIUS) {
    state.ballVelocity.set(0, 0, 0); // Detener si es muy lenta en el suelo
  }

  // 5. Verificar Out of Bounds (Opcional)
  // checkPlayerOutOfBounds(state, roomId);

} // Fin de updateGamePhysics


// Emite un evento de rebote (sonido en cliente), con throttle y umbral de velocidad.
const BOUNCE_EMIT_COOLDOWN_MS = 110;
const BOUNCE_MIN_SPEED = 3;
function maybeEmitBounce(roomId, state) {
  const speedSq = state.ballVelocity.x * state.ballVelocity.x + state.ballVelocity.z * state.ballVelocity.z;
  if (speedSq < BOUNCE_MIN_SPEED * BOUNCE_MIN_SPEED) return;
  const now = performance.now();
  if (now - state.lastBounceEmit < BOUNCE_EMIT_COOLDOWN_MS) return;
  state.lastBounceEmit = now;
  const strength = Math.min(1, Math.sqrt(speedSq) / MAX_BALL_SPEED);
  io.to(roomId).volatile.emit('ballBounce', { strength });
}

// --- Emisión de Estado (con delta compression) ---
// Solo enviamos los jugadores cuya posición o flags cambiaron desde el último
// envío. El cliente conserva la última posición de los ausentes (lerp). Para que
// el cliente sepa qué jugadores siguen en la sala, enviamos `roster` con todos
// los ids (barato) y solo elimina los que ya no estén ahí.
const POS_EPSILON = 0.02;
function playerChanged(prev, x, z, isMoving, isControllingBall, stamina, isSprinting) {
  if (!prev) return true;
  if (prev.isMoving !== isMoving || prev.isControllingBall !== isControllingBall || prev.isSprinting !== isSprinting) return true;
  if (Math.abs(prev.stamina - stamina) >= 0.02) return true;
  if (Math.abs(prev.x - x) >= POS_EPSILON || Math.abs(prev.z - z) >= POS_EPSILON) return true;
  return false;
}

// Cada ~2s (40 emisiones a 20Hz) enviamos un keyframe completo para que clientes
// recién conectados y posibles desincronizaciones se autocorrijan.
const FULL_KEYFRAME_EVERY = 40;
function emitGameState(roomId, state) {
  // Static fields (name, team, characterType) are sent via teamUpdate / playersListUpdate.
  state.emitCount = (state.emitCount || 0) + 1;
  const forceFull = state.emitCount % FULL_KEYFRAME_EVERY === 0;
  const playersData = [];
  const roster = [];
  state.players.forEach((p) => {
    roster.push(p.id);
    const x = round2(p.position.x);
    const z = round2(p.position.z);
    const isMoving = state.playerMovements.get(p.id)?.moveDirection.lengthSquared() > 0.01;
    const isControllingBall = p.isControllingBall;
    const stamina = Math.round((p.stamina / STAMINA_MAX) * 100) / 100; // 0..1 normalizado
    const isSprinting = p.isSprinting;

    const prev = state.lastSent.get(p.id);
    const isNew = !prev;
    if (forceFull || isNew || playerChanged(prev, x, z, isMoving, isControllingBall, stamina, isSprinting)) {
      const entry = {
        id: p.id,
        position: vector3ToNetObject(p.position),
        isMoving,
        isControllingBall,
        stamina,
        isSprinting,
      };
      // Adjuntar datos estáticos en el primer envío y en cada keyframe, para que
      // el cliente nunca renderice un personaje/equipo equivocado por una carrera
      // de sincronización con los metadatos.
      if (isNew || forceFull) {
        entry.characterType = p.characterType;
        entry.team = p.team;
      }
      playersData.push(entry);
      state.lastSent.set(p.id, { x, z, isMoving, isControllingBall, stamina, isSprinting });
    }
  });
  // Purgar del cache jugadores que ya no existen.
  if (state.lastSent.size > state.players.size) {
    state.lastSent.forEach((_, id) => { if (!state.players.has(id)) state.lastSent.delete(id); });
  }

  // Calcular jugador que controla, tiempo restante y carga del disparo (0..1)
  let controllingPlayerId = null;
  let controlRemainingMs = 0;
  let shotCharge = 0;
  state.players.forEach(p => {
    if (p.isControllingBall) {
      controllingPlayerId = p.id;
      const elapsed = performance.now() - p.ballControlTime;
      controlRemainingMs = Math.round(Math.max(0, 3000 - elapsed));
      shotCharge = Math.round(Math.min(1, Math.max(0, elapsed / 3000)) * 100) / 100;
    }
  });

  const gameStatePayload = {
    players: playersData,
    roster,
    ballPosition: vector3ToNetObject(state.ballPosition),
    score: state.score,
    matchTimeLeftMs: Math.round(state.matchTimeLeftMs),
    controllingPlayerId,
    controlRemainingMs,
    shotCharge,
  };

  // Emitir a la sala específica
  io.to(roomId).volatile.emit('gameStateUpdate', gameStatePayload);
}


// --- Manejadores de Eventos de Socket.IO ---
io.on('connection', (socket) => {
  log(`++ Cliente conectado: ${socket.id}`);
  let currentRoomId = null; // ID de la sala para este socket
  // Medición de latencia: el cliente envía su timestamp y lo devolvemos tal cual.
  socket.on('pingCheck', (clientTime) => {
    socket.emit('pongCheck', clientTime);
  });

  // Anti-spam de chat: ventana deslizante por socket.
  const chatTimestamps = [];
  const CHAT_WINDOW_MS = 5000;
  const CHAT_MAX_IN_WINDOW = 5; // Máx mensajes por ventana
  const CHAT_MIN_GAP_MS = 400;  // Separación mínima entre mensajes

  // Handler 'joinGame'
  socket.on('joinGame', ({ name, roomId }) => {
    log(`[${roomId || 'N/A'}] -> joinGame de ${socket.id} (${name})`);

    // Validaciones
    if (!roomId || !availableSalas.includes(roomId)) {
      error(`[${roomId || 'N/A'}] Error joinGame: Sala inválida '${roomId}'`);
      return socket.emit('joinError', { message: 'Sala inválida.' });
    }
    const state = salaStates[roomId];
    if (!state) {
      error(`[${roomId}] Error joinGame: Estado de sala no encontrado.`);
      return socket.emit('joinError', { message: 'Error interno del servidor.' });
    }
    const sanitizedName = sanitizeInput(name, 15); // Limitar nombre
    if (!sanitizedName) {
      error(`[${roomId}] Error joinGame: Nombre inválido.`);
      return socket.emit('joinError', { message: 'Nombre inválido o vacío.' });
    }
    // Evitar unirse si el nombre ya está en uso en esa sala
    let nameExists = false;
    state.players.forEach(p => { if (p.name === sanitizedName) nameExists = true; });
    if (nameExists) {
      error(`[${roomId}] Error joinGame: Nombre "${sanitizedName}" ya en uso.`);
      return socket.emit('joinError', { message: `El nombre "${sanitizedName}" ya está en uso.` });
    }

    // Rechazar si el juego está lleno (considerando equipos) o en progreso?
    // if (state.players.size >= MAX_PLAYERS_PER_TEAM * 2) {
    //    return socket.emit('joinError', { message: 'La sala está llena.' });
    // }
    if (state.currentGameState === gameStates.PLAYING) {
      log(`[${roomId}] Aviso joinGame: Juego en progreso para ${sanitizedName}.`);
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
      lastKickTime: 0, // To avoid immediate collision after shot
      stamina: STAMINA_MAX,   // Energía para esprintar (0..STAMINA_MAX)
      wantSprint: false,      // Input de sprint del jugador
      isSprinting: false,     // Estado real de sprint (resuelto en física)
      exhausted: false,       // Latch: bloquea sprint hasta recuperar stamina
      goals: 0,               // Goles anotados en el partido actual
      roomId: roomId // Referencia a su sala
    };
    state.players.set(socket.id, playerData);
    state.playerMovements.set(socket.id, { moveDirection: Vector3.Zero() });

    log(`[${roomId}] Jugador ${sanitizedName} (${socket.id}) añadido y unido.`);

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
    // Forzar envío completo (keyframe) para que el nuevo cliente reciba todo.
    state.lastSent.clear();
    emitGameState(roomId, state);

  });

  // Handler 'selectTeam'
  socket.on('selectTeam', ({ team }) => {
    if (!currentRoomId) return error(`[${socket.id}] Error selectTeam: Socket no está en una sala.`);
    const state = salaStates[currentRoomId];
    const player = state.players.get(socket.id);

    log(`[${currentRoomId}] -> selectTeam de ${player?.name || socket.id}. Equipo: ${team}`);

    if (!player) return error(`[${currentRoomId}] Error selectTeam: Jugador ${socket.id} no encontrado.`);
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

    log(`[${currentRoomId}] Jugador ${player.name} movido al equipo ${team}.`);

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
    if (!currentRoomId) return error(`[${socket.id}] Error selectCharacter: Socket no está en una sala.`);
    const state = salaStates[currentRoomId];
    const player = state.players.get(socket.id);

    log(`[${currentRoomId}] -> selectCharacter de ${player?.name || socket.id}. Personaje: ${characterType}`);

    if (!player) return error(`[${currentRoomId}] Error selectCharacter: Jugador ${socket.id} no encontrado.`);
    if (!player.team) return socket.emit('selectCharacterError', { message: 'Selecciona un equipo primero.' });
    if (player.ready) return socket.emit('selectCharacterError', { message: 'Cancela tu estado "Listo" para cambiar.' });

    // Permitir deseleccionar (null)
    const isValid = characterType === null || TEAM_CHARACTERS[player.team].includes(characterType);
    if (!isValid) {
      return socket.emit('selectCharacterError', { message: 'Personaje no válido para tu equipo.' });
    }

    player.characterType = characterType;
    log(`[${currentRoomId}] Jugador ${player.name} personaje actualizado a: ${characterType}`);

    // Notificar a todos (teamUpdate ahora incluye characterType)
    const status = getTeamStatus(state);
    io.to(currentRoomId).emit('teamUpdate', status.teams);
    socket.emit('characterSelected', { characterType }); // Confirmar al jugador
  });

  // Handler 'toggleReady'
  socket.on('toggleReady', () => {
    if (!currentRoomId) return error(`[${socket.id}] Error toggleReady: Socket no está en una sala.`);
    const state = salaStates[currentRoomId];
    const player = state.players.get(socket.id);

    log(`[${currentRoomId}] -> toggleReady de ${player?.name || socket.id}.`);

    if (!player || !player.team) return error(`[${currentRoomId}] Error toggleReady: Jugador no encontrado o sin equipo.`);
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
      log(`[${currentRoomId}] Jugador ${player.name} está LISTO.`);
    } else {
      state.readyState[player.team].delete(socket.id);
      log(`[${currentRoomId}] Jugador ${player.name} YA NO está listo.`);
    }

    // Emitir actualización de estado 'listo' a la sala
    io.to(currentRoomId).emit('readyUpdate', getReadyPayload(state));

    // Comprobar si el juego debe empezar (solo si estamos esperando)
    if (state.currentGameState === gameStates.WAITING) {
      checkStartGame(currentRoomId, state);
    }
  });

  // Handler 'addBot' — añade un bot a un equipo (solo en lobby / fin de partida)
  socket.on('addBot', ({ team } = {}) => {
    if (!currentRoomId) return;
    const state = salaStates[currentRoomId];
    if (!state) return;
    if (state.currentGameState !== gameStates.WAITING && state.currentGameState !== gameStates.GAME_OVER) {
      return socket.emit('readyError', { message: 'Solo puedes añadir bots antes de empezar.' });
    }
    const bot = createBot(state, team);
    if (!bot) return socket.emit('selectTeamError', { message: 'Ese equipo está lleno.' });
    log(`[${currentRoomId}] Bot añadido (${bot.name}) al equipo ${team}.`);

    io.to(currentRoomId).emit('teamUpdate', getTeamStatus(state).teams);
    io.to(currentRoomId).emit('readyUpdate', getReadyPayload(state));
    io.to(currentRoomId).emit('playersListUpdate', Array.from(state.players.values()).map(p => ({
      id: p.id, name: p.name, team: p.team, characterType: p.characterType,
    })));
    emitGameState(currentRoomId, state);

    if (state.currentGameState === gameStates.WAITING) {
      checkStartGame(currentRoomId, state);
    }
  });

  // Handler 'removeBot' — quita un bot de un equipo
  socket.on('removeBot', ({ team } = {}) => {
    if (!currentRoomId) return;
    const state = salaStates[currentRoomId];
    if (!state) return;
    if (state.currentGameState !== gameStates.WAITING && state.currentGameState !== gameStates.GAME_OVER) return;
    if (!removeBotFromTeam(state, team)) return;
    log(`[${currentRoomId}] Bot eliminado del equipo ${team}.`);
    io.to(currentRoomId).emit('teamUpdate', getTeamStatus(state).teams);
    io.to(currentRoomId).emit('readyUpdate', getReadyPayload(state));
    io.to(currentRoomId).emit('playersListUpdate', Array.from(state.players.values()).map(p => ({
      id: p.id, name: p.name, team: p.team, characterType: p.characterType,
    })));
    emitGameState(currentRoomId, state);
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

  // Handler 'sprint' — activa/desactiva la intención de esprintar del jugador
  socket.on('sprint', ({ active } = {}) => {
    if (!currentRoomId) return;
    const state = salaStates[currentRoomId];
    const player = state?.players.get(socket.id);
    if (!player || state.currentGameState !== gameStates.PLAYING) return;
    player.wantSprint = active === true;
  });

  // Handler 'ballControl'
  socket.on('ballControl', ({ control }) => {
    if (!currentRoomId) return;
    const state = salaStates[currentRoomId];
    const player = state.players.get(socket.id);
    if (!player || state.currentGameState !== gameStates.PLAYING) return;

    //log(`[${currentRoomId}] -> ballControl de ${player.name}. Control: ${control}`);

    if (control === true) {
      const stats = getCharacterStats(player.characterType);
      const controlRadius = stats.controlRadius || BALL_CONTROL_RADIUS;
      const toBall = state.ballPosition.subtract(player.position);
      toBall.y = 0;
      const distSq = toBall.lengthSquared();
      const controlRadiusSq = controlRadius * controlRadius;
      let alreadyControlled = false;
      state.players.forEach(p => { if (p.isControllingBall) alreadyControlled = true; });

      if (!alreadyControlled && distSq < controlRadiusSq) {
        player.isControllingBall = true;
        player.ballControlTime = performance.now();
        state.ballVelocity.set(0, 0, 0); // Detener balón
        log(`[${currentRoomId}] ${player.name} INICIA control de balón.`);
      } else {
        //log(`[${currentRoomId}] ${player.name} FALLA control.`);
      }
    } else if (control === false) {
      // Soltar el balón (disparo)
      if (player.isControllingBall) {
        player.isControllingBall = false;
        log(`[${currentRoomId}] ${player.name} SUELTA balón (disparo).`);

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
        worldForward.y = 0;
        if (worldForward.lengthSquared() > 0.001) worldForward.normalize();

        const assisted = findPassAssistDirection(
          player.id,
          player.team,
          player.position,
          { x: worldForward.x, z: worldForward.z },
          Array.from(state.players.values()),
        );
        worldForward.x = assisted.x;
        worldForward.z = assisted.z;
        worldForward.y = 0;

        // Calculate shot speed
        const nowTs = performance.now();
        const controlHeldSec = Math.min(3, Math.max(0, (nowTs - player.ballControlTime) / 1000));
        const t = controlHeldSec / 3; // 0..1
        const stats = getCharacterStats(player.characterType);
        const speed = (BALL_RELEASE_MIN + (BALL_RELEASE_MAX - BALL_RELEASE_MIN) * t) * stats.shotMultiplier;

        // Assign velocity
        state.ballVelocity = worldForward.scale(speed);
        state.ballLastShotTime = nowTs;
        state.lastShooter = { id: player.id, team: player.team }; // Atribución de gol

        // KEY CHANGE: Aggressive separation
        // Push ball 0.8 units (before 0.1) to ensure it doesn't touch the body
        const separationDist = (getCharacterStats(player.characterType).radius || PLAYER_RADIUS) + BALL_RADIUS + 0.8;
        state.ballPosition.addInPlace(worldForward.clone().scale(separationDist));

        // KEY CHANGE: Register kick time
        player.lastKickTime = nowTs;

        log(`[${currentRoomId}] SHOT: Speed ${speed.toFixed(1)}`);
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

    // Rate limiting: descarta el mensaje si supera el ritmo permitido.
    const nowTs = Date.now();
    while (chatTimestamps.length && nowTs - chatTimestamps[0] > CHAT_WINDOW_MS) {
      chatTimestamps.shift();
    }
    const lastTs = chatTimestamps[chatTimestamps.length - 1] || 0;
    if (nowTs - lastTs < CHAT_MIN_GAP_MS || chatTimestamps.length >= CHAT_MAX_IN_WINDOW) {
      socket.emit('chatError', { message: 'Estás enviando mensajes demasiado rápido.' });
      return;
    }
    chatTimestamps.push(nowTs);

    log(`[${currentRoomId}] Chat [${player.name}]: ${sanitizedMessage}`);
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
    log(`-- Cliente desconectado: ${socket.id}. Sala: ${currentRoomId || 'N/A'}. Razón: ${reason}`);
    if (!currentRoomId) return; // Si nunca se unió a una sala

    const state = salaStates[currentRoomId];
    if (!state) return; // Si la sala ya no existe? (raro)

    const player = state.players.get(socket.id);

    if (player) {
      log(`[${currentRoomId}] Limpiando jugador ${player.name} (${socket.id}) por desconexión.`);

      // Quitar de equipos y estado 'listo'
      if (player.team) {
        state.teams[player.team].delete(socket.id);
        state.readyState[player.team].delete(socket.id);
      }
      // Quitar del mapa principal de jugadores y movimientos
      state.players.delete(socket.id);
      state.playerMovements.delete(socket.id);

      // Si ya no quedan humanos, retirar los bots (no dejamos partidas solo-bots).
      if (countHumans(state) === 0) {
        removeAllBots(state);
        log(`[${currentRoomId}] Sin humanos: bots retirados.`);
      }

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
      log(`[${currentRoomId}] Advertencia: Jugador ${socket.id} desconectado no encontrado en estado.`);
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

  log(`[${roomId}] Comprobando fin de juego por desconexión. Left: ${leftCount}, Right: ${rightCount}`);

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
  log(`Servidor de juego corriendo en el puerto ${PORT} y escuchando en 0.0.0.0`);
});