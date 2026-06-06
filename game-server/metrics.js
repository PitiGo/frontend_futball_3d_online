// metrics.js — Métricas Prometheus para el servidor de juego.
//
// Expone un registry con:
//   - Métricas por defecto de Node.js (CPU, memoria, event loop, GC...).
//   - Contadores de eventos del juego (goles, partidas, conexiones, robos, ítems).
//   - Gauges del estado actual (sockets conectados, jugadores/bots por sala,
//     partidas activas, estado de cada sala) calculados al hacer scrape.
//
// Uso en server.js:
//   import * as metrics from './metrics.js';
//   metrics.setSnapshotProvider(() => ({ sockets, rooms: [...] }));
//   app.get('/metrics', metrics.handler);
//   metrics.goalsTotal.inc({ room, team });

import client from 'prom-client';

const register = new client.Registry();
register.setDefaultLabels({ app: 'football-online-3d' });

// Métricas del runtime (process_*, nodejs_*).
client.collectDefaultMetrics({ register, prefix: 'football_' });

// Proveedor del estado actual para los gauges. server.js lo inyecta. Debe
// devolver { sockets:Number, rooms:[{ room, humans, bots, players, state, active }] }.
let snapshotProvider = () => ({ sockets: 0, rooms: [] });
export function setSnapshotProvider(fn) {
  if (typeof fn === 'function') snapshotProvider = fn;
}

// prom-client ejecuta el collect() de cada métrica justo antes de serializarla,
// en orden de registro. Para no recalcular el snapshot una vez por gauge en el
// mismo scrape, lo cacheamos durante una ventana corta: todos los collect() de
// una misma recogida ocurren en el mismo instante (sub-ms), así que comparten
// el snapshot, y los scrapes (cada varios segundos) siempre obtienen uno fresco.
const SNAPSHOT_TTL_MS = 100;
let cachedSnapshot = null;
let cachedAt = 0;
function getSnapshot() {
  const now = Date.now();
  if (cachedSnapshot && now - cachedAt < SNAPSHOT_TTL_MS) return cachedSnapshot;
  try {
    cachedSnapshot = snapshotProvider() || { sockets: 0, rooms: [] };
  } catch {
    cachedSnapshot = { sockets: 0, rooms: [] };
  }
  cachedAt = now;
  return cachedSnapshot;
}

const ROOM_STATES = ['waiting', 'playing', 'goal_scored', 'game_over'];

// ---------------------------------------------------------------------------
// Contadores (eventos acumulativos)
// ---------------------------------------------------------------------------
export const goalsTotal = new client.Counter({
  name: 'football_goals_total',
  help: 'Goles marcados',
  labelNames: ['room', 'team'],
  registers: [register],
});

export const ownGoalsTotal = new client.Counter({
  name: 'football_own_goals_total',
  help: 'Goles en propia puerta',
  labelNames: ['room', 'team'],
  registers: [register],
});

export const matchesStartedTotal = new client.Counter({
  name: 'football_matches_started_total',
  help: 'Partidas iniciadas',
  labelNames: ['room'],
  registers: [register],
});

export const matchesFinishedTotal = new client.Counter({
  name: 'football_matches_finished_total',
  help: 'Partidas finalizadas, etiquetadas por resultado (left/right/draw)',
  labelNames: ['room', 'result'],
  registers: [register],
});

export const playerConnectionsTotal = new client.Counter({
  name: 'football_player_connections_total',
  help: 'Sockets conectados (acumulado)',
  registers: [register],
});

export const playerDisconnectionsTotal = new client.Counter({
  name: 'football_player_disconnections_total',
  help: 'Sockets desconectados (acumulado)',
  registers: [register],
});

export const playerJoinsTotal = new client.Counter({
  name: 'football_player_joins_total',
  help: 'Jugadores que entran a una sala (joinGame)',
  labelNames: ['room'],
  registers: [register],
});

export const ballStealsTotal = new client.Counter({
  name: 'football_ball_steals_total',
  help: 'Robos de balón a un rival',
  labelNames: ['room', 'by'],
  registers: [register],
});

export const itemsCollectedTotal = new client.Counter({
  name: 'football_items_collected_total',
  help: 'Ítems de velocidad recogidos',
  labelNames: ['room'],
  registers: [register],
});

// ---------------------------------------------------------------------------
// Gauges (estado instantáneo). Se recalculan en cada scrape a partir del
// snapshot del servidor para evitar inc/dec dispersos y propensos a errores.
// ---------------------------------------------------------------------------
/* eslint-disable no-new */
new client.Gauge({
  name: 'football_connected_sockets',
  help: 'Sockets conectados actualmente',
  registers: [register],
  collect() {
    this.set(getSnapshot().sockets || 0);
  },
});

new client.Gauge({
  name: 'football_players_in_room',
  help: 'Jugadores totales (humanos + bots) por sala',
  labelNames: ['room'],
  registers: [register],
  collect() {
    this.reset();
    for (const r of getSnapshot().rooms || []) this.set({ room: r.room }, r.players || 0);
  },
});

new client.Gauge({
  name: 'football_humans_in_room',
  help: 'Jugadores humanos por sala',
  labelNames: ['room'],
  registers: [register],
  collect() {
    this.reset();
    for (const r of getSnapshot().rooms || []) this.set({ room: r.room }, r.humans || 0);
  },
});

new client.Gauge({
  name: 'football_bots_in_room',
  help: 'Bots por sala',
  labelNames: ['room'],
  registers: [register],
  collect() {
    this.reset();
    for (const r of getSnapshot().rooms || []) this.set({ room: r.room }, r.bots || 0);
  },
});

new client.Gauge({
  name: 'football_room_state',
  help: 'Estado de la sala (1 = estado actual, 0 el resto). Una serie por estado posible.',
  labelNames: ['room', 'state'],
  registers: [register],
  collect() {
    this.reset();
    for (const r of getSnapshot().rooms || []) {
      for (const s of ROOM_STATES) this.set({ room: r.room, state: s }, r.state === s ? 1 : 0);
    }
  },
});

new client.Gauge({
  name: 'football_active_matches',
  help: 'Partidas en curso (estado playing)',
  registers: [register],
  collect() {
    let active = 0;
    for (const r of getSnapshot().rooms || []) if (r.active) active += 1;
    this.set(active);
  },
});
/* eslint-enable no-new */

export { register };

// Handler Express para GET /metrics.
export async function handler(_req, res) {
  try {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  } catch (err) {
    res.status(500).end(String(err));
  }
}
