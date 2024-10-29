// server/server.js

import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { Vector3, Quaternion } from '@babylonjs/core';
import cors from 'cors';

const app = express();
app.use(cors());

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// En server.js, añade estas constantes al inicio:
const MAX_PLAYERS_PER_TEAM = 3;
const teams = {
  left: [],
  right: []
};


// Mapa para almacenar los jugadores conectados
const players = new Map();

// Posición y velocidad de la pelota
let ballPosition = new Vector3(0, 0.5, 0);
let ballVelocity = new Vector3(0, 0, 0);

// Constantes del juego
const FIELD_WIDTH = 30;
const FIELD_HEIGHT = 20;
const BALL_RADIUS = 0.5;
const PLAYER_RADIUS = 0.5;
const PLAYER_SPEED = 0.167;

// Constantes de las porterías
const GOAL_DEPTH = 5;
const GOAL_Z_MIN = -GOAL_DEPTH / 2;
const GOAL_Z_MAX = GOAL_DEPTH / 2;

// Puntuación
let score = { left: 0, right: 0 };

// Nuevas constantes físicas
const BALL_MASS = 0.45; // Masa de la pelota en kg
const PLAYER_MASS = 75; // Masa del jugador en kg
const FRICTION = 0.98; // Coeficiente de fricción
const RESTITUTION = 0.8; // Coeficiente de restitución

// Función de sanitización básica
function sanitizeMessage(message) {
  // Elimina etiquetas HTML
  const sanitized = message.replace(/<[^>]*>?/gm, '');
  // Escapa caracteres especiales
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
  console.log('Pelota reiniciada a posición', vector3ToObject(ballPosition));
}

function updateGameState() {
  // Verificar si la pelota ha pasado por alguna portería
  if (ballPosition.x < -FIELD_WIDTH / 2 + BALL_RADIUS) {
    if (ballPosition.z >= GOAL_Z_MIN && ballPosition.z <= GOAL_Z_MAX) {
      score.right++;
      console.log(`Gol para el equipo derecho. Puntuación: ${score.left} - ${score.right}`);
      resetBall();
      return;
    }
  } else if (ballPosition.x > FIELD_WIDTH / 2 - BALL_RADIUS) {
    if (ballPosition.z >= GOAL_Z_MIN && ballPosition.z <= GOAL_Z_MAX) {
      score.left++;
      console.log(`Gol para el equipo izquierdo. Puntuación: ${score.left} - ${score.right}`);
      resetBall();
      return;
    }
  }

  // Actualizar la posición de la pelota
  ballPosition = ballPosition.add(ballVelocity);

  // Lógica de rebote mejorada
  if (Math.abs(ballPosition.x) > FIELD_WIDTH / 2 - BALL_RADIUS) {
    if (ballPosition.z < GOAL_Z_MIN || ballPosition.z > GOAL_Z_MAX) {
      ballVelocity.x *= -RESTITUTION;
      ballPosition.x = Math.sign(ballPosition.x) * (FIELD_WIDTH / 2 - BALL_RADIUS);
      console.log(`Pelota rebotó en el borde x: ${ballPosition.x.toFixed(2)}`);
    }
  }

  if (Math.abs(ballPosition.z) > FIELD_HEIGHT / 2 - BALL_RADIUS) {
    ballVelocity.z *= -RESTITUTION;
    ballPosition.z = Math.sign(ballPosition.z) * (FIELD_HEIGHT / 2 - BALL_RADIUS);
    console.log(`Pelota rebotó en el borde z: ${ballPosition.z.toFixed(2)}`);
  }

  // Aplicar fricción a la pelota
  ballVelocity = ballVelocity.scale(FRICTION);

  // Detección de colisiones mejorada
  players.forEach((player) => {
    const distanceToPlayer = Vector3.Distance(player.position, ballPosition);
    if (distanceToPlayer < PLAYER_RADIUS + BALL_RADIUS) {
      // Calcular el vector de colisión
      const collisionNormal = ballPosition.subtract(player.position).normalize();

      // Calcular las velocidades relativas
      const relativeVelocity = ballVelocity.subtract(player.velocity);

      // Calcular el impulso
      const impulseStrength = -(1 + RESTITUTION) * Vector3.Dot(relativeVelocity, collisionNormal) /
        (1 / BALL_MASS + 1 / PLAYER_MASS);

      const impulse = collisionNormal.scale(impulseStrength);

      // Aplicar el impulso a la pelota y al jugador
      ballVelocity = ballVelocity.add(impulse.scale(1 / BALL_MASS));
      player.velocity = player.velocity.subtract(impulse.scale(1 / PLAYER_MASS));

      // Separar la pelota y el jugador para evitar superposición
      const separation = (PLAYER_RADIUS + BALL_RADIUS - distanceToPlayer) * 0.5;
      ballPosition = ballPosition.add(collisionNormal.scale(separation));
      player.position = player.position.subtract(collisionNormal.scale(separation));

      console.log(`Colisión entre pelota y jugador ${player.id}. Nueva velocidad de la pelota: (${ballVelocity.x.toFixed(2)}, ${ballVelocity.y.toFixed(2)}, ${ballVelocity.z.toFixed(2)})`);
    }
  });

  // Limitar la velocidad máxima del balón
  const MAX_BALL_SPEED = 1;
  if (ballVelocity.length() > MAX_BALL_SPEED) {
    ballVelocity = ballVelocity.normalize().scale(MAX_BALL_SPEED);
  }

  // Actualizar la posición de los jugadores según sus movimientos
  players.forEach((player) => {
    let playerVelocity = new Vector3(0, 0, 0);

    // Movimiento en diagonal
    const speedMultiplier = 1; // Puedes ajustar este valor si quieres que el movimiento diagonal sea más lento

    if (player.movement.up) {
      playerVelocity.z += PLAYER_SPEED * speedMultiplier;
    }
    if (player.movement.down) {
      playerVelocity.z -= PLAYER_SPEED * speedMultiplier;
    }
    if (player.movement.left) {
      playerVelocity.x -= PLAYER_SPEED * speedMultiplier;
    }
    if (player.movement.right) {
      playerVelocity.x += PLAYER_SPEED * speedMultiplier;
    }

    // Actualizar posición del jugador
    player.position = player.position.add(playerVelocity);

    // Guardar velocidad del jugador
    player.velocity = playerVelocity.clone();

    // Limitar la posición dentro del campo
    player.position.x = Math.max(Math.min(player.position.x, FIELD_WIDTH / 2 - PLAYER_RADIUS), -FIELD_WIDTH / 2 + PLAYER_RADIUS);
    player.position.z = Math.max(Math.min(player.position.z, FIELD_HEIGHT / 2 - PLAYER_RADIUS), -FIELD_HEIGHT / 2 + PLAYER_RADIUS);
  });

  // Preparar el estado del juego para enviar
  const gameState = {
    players: Array.from(players.values()).map(player => ({
      id: player.id,
      name: player.name,
      position: vector3ToObject(player.position),
      rotation: quaternionToObject(player.rotation),
      isMoving: player.movement.up || player.movement.down ||
        player.movement.left || player.movement.right
    })),
    ballPosition: vector3ToObject(ballPosition),
    score: score,
    connectedPlayers: Array.from(players.values()).map(player => ({
      id: player.id,
      name: player.name
    }))
  };

  // Emitir el estado del juego a todos los clientes
  io.emit('gameStateUpdate', gameState);
}

// Iniciar la actualización del estado del juego a 60 FPS
setInterval(updateGameState, 1000 / 60);

console.log("Servidor iniciado, esperando conexiones...");

// Manejo de conexiones de Socket.IO
io.on('connection', (socket) => {
  console.log(`Nuevo cliente conectado: ${socket.id}`);

  // Enviar inmediatamente el estado actual de los equipos
  socket.emit('teamUpdate', teams);

  // Manejar evento de unión al juego
  socket.on('joinGame', (playerData) => {
    const { name } = playerData;

    // Validación del nombre del jugador
    if (typeof name !== 'string' || name.trim() === '') {
      socket.emit('error', { message: 'Nombre inválido' });
      return;
    }

    // Resto del código igual...
    players.set(socket.id, {
      id: socket.id,
      name: name,
      team: null,
      position: new Vector3(0, 0.5, 0),
      rotation: Quaternion.Identity(),
      movement: { up: false, down: false, left: false, right: false },
      velocity: new Vector3(0, 0, 0)
    });

    // Después de agregar el jugador, enviar la actualización de equipos
    socket.emit('teamUpdate', teams);

    console.log(`Jugador ${name} agregado con ID ${socket.id}`);
    console.log(`Total de jugadores: ${players.size}`);
    console.log('Estado actual de los equipos:', teams);

    // Emitir un evento específico para la actualización de la lista de jugadores
    io.emit('playersListUpdate', Array.from(players.values()).map(player => ({
      id: player.id,
      name: player.name
    })));

    // Enviar estado inicial del juego al nuevo jugador
    const gameState = {
      players: Array.from(players.values()).map(player => ({
        id: player.id,
        name: player.name,
        position: vector3ToObject(player.position),
        rotation: quaternionToObject(player.rotation),
      })),
      ballPosition: vector3ToObject(ballPosition),
      score: score,
      connectedPlayers: Array.from(players.values()).map(player => ({
        id: player.id,
        name: player.name
      }))
    };

    socket.emit('gameStateUpdate', gameState);
    console.log(`Estado inicial enviado a ${socket.id}:`, gameState);
  });


  // Añade el manejador para la selección de equipo:
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
    if (player && !player.team) {
      player.team = team;
      teams[team].push({ id: socket.id, name: player.name });

      // Asignar posición inicial según el equipo
      player.position = new Vector3(
        team === 'left' ? -FIELD_WIDTH / 4 : FIELD_WIDTH / 4,
        0.5,
        (Math.random() * FIELD_HEIGHT - FIELD_HEIGHT / 2) * 0.8
      );

      // Notificar a todos los clientes sobre la actualización de equipos
      io.emit('teamUpdate', teams);

      // Notificar al jugador que su selección fue exitosa
      socket.emit('teamSelected', { team });

      console.log(`Jugador ${player.name} se unió al equipo ${team}`);
    }
  });

  // Manejar inicio de movimiento
  socket.on('playerMoveStart', (data) => {
    const { direction } = data;
    const validDirections = ['up', 'down', 'left', 'right'];

    // Validar dirección
    if (!validDirections.includes(direction)) {
      socket.emit('error', { message: 'Dirección de movimiento inválida' });
      return;
    }

    const player = players.get(socket.id);
    if (player) {
      player.movement[direction] = true;
      console.log(`Jugador ${player.id} empezó a moverse en dirección ${direction}`);
    }
  });

  // Manejar detención de movimiento
  socket.on('playerMoveStop', (data) => {
    const { direction } = data;
    const validDirections = ['up', 'down', 'left', 'right'];

    // Validar dirección
    if (!validDirections.includes(direction)) {
      socket.emit('error', { message: 'Dirección de movimiento inválida' });
      return;
    }

    const player = players.get(socket.id);
    if (player) {
      player.movement[direction] = false;
      console.log(`Jugador ${player.id} dejó de moverse en dirección ${direction}`);
    }
  });

  // Manejar mensajes de chat
  socket.on('chatMessage', (message) => {
    const player = players.get(socket.id);
    if (player && typeof message === 'string') {
      const sanitizedMessage = sanitizeMessage(message.trim());

      if (sanitizedMessage.length > 0 && sanitizedMessage.length <= 200) {
        const chatMessage = {
          playerId: socket.id,
          playerName: player.name,
          message: sanitizedMessage,
          timestamp: new Date().toISOString()
        };
        console.log(`Chat message from ${player.name}: ${sanitizedMessage}`);
        io.emit('chatUpdate', chatMessage);
      } else {
        socket.emit('error', { message: 'Mensaje de chat inválido' });
      }
    }
  });

  // Modificar el manejo de desconexión para limpiar los equipos:
  socket.on('disconnect', () => {
    const player = players.get(socket.id);
    if (player && player.team) {
      const teamArray = teams[player.team];
      const index = teamArray.findIndex(p => p.id === socket.id);
      if (index !== -1) {
        teamArray.splice(index, 1);
        io.emit('teamUpdate', teams);
      }
    }
    players.delete(socket.id);
    io.emit('playersListUpdate', Array.from(players.values()).map(player => ({
      id: player.id,
      name: player.name,
      team: player.team
    })));
  });



});

// Definir el puerto del servidor
const PORT = process.env.PORT || 4000;

// Iniciar el servidor
httpServer.listen(PORT, () => {
  console.log(`Servidor de juego corriendo en el puerto ${PORT}`);
});