// geo.js — País del cliente a partir de zona horaria, cabeceras CDN o GeoIP.
//
// Importante: no confiar en X-Forwarded-For / CF-IPCountry salvo que el peer
// inmediato sea un proxy de confianza (red privada / lista TRUSTED_PROXIES).
// Si no, un cliente o hop intermedio puede inyectar una IP/país falsos
// (p. ej. MX cuando el jugador está en UY).
import geoip from 'geoip-lite';

const PRIVATE_V4 = /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.|0\.|169\.254\.)/;

// Zona horaria del dispositivo → país ISO. Preferimos esta señal para
// "procedencia" del jugador porque GeoIP gratis suele fallar en LatAm.
const TZ_TO_COUNTRY = {
  'America/Montevideo': 'UY',
  'America/Argentina/Buenos_Aires': 'AR',
  'America/Argentina/Cordoba': 'AR',
  'America/Argentina/Mendoza': 'AR',
  'America/Argentina/Salta': 'AR',
  'America/Sao_Paulo': 'BR',
  'America/Fortaleza': 'BR',
  'America/Recife': 'BR',
  'America/Bahia': 'BR',
  'America/Manaus': 'BR',
  'America/Belem': 'BR',
  'America/Santiago': 'CL',
  'America/Punta_Arenas': 'CL',
  'America/Asuncion': 'PY',
  'America/La_Paz': 'BO',
  'America/Lima': 'PE',
  'America/Bogota': 'CO',
  'America/Guayaquil': 'EC',
  'America/Caracas': 'VE',
  'America/Mexico_City': 'MX',
  'America/Cancun': 'MX',
  'America/Merida': 'MX',
  'America/Monterrey': 'MX',
  'America/Tijuana': 'MX',
  'America/Mazatlan': 'MX',
  'America/Chihuahua': 'MX',
  'America/New_York': 'US',
  'America/Chicago': 'US',
  'America/Denver': 'US',
  'America/Los_Angeles': 'US',
  'America/Toronto': 'CA',
  'America/Vancouver': 'CA',
  'Europe/Paris': 'FR',
  'Europe/Madrid': 'ES',
  'Europe/London': 'GB',
  'Europe/Berlin': 'DE',
  'Europe/Rome': 'IT',
  'Europe/Lisbon': 'PT',
  'Europe/Amsterdam': 'NL',
  'Atlantic/Canary': 'ES',
};

function parseTrustedProxies() {
  const raw = process.env.TRUSTED_PROXIES || '';
  return new Set(
    raw.split(',').map((s) => s.trim()).filter(Boolean).map((ip) => ip.replace(/^::ffff:/, '')),
  );
}

const TRUSTED_PROXIES = parseTrustedProxies();

function normalizeCountry(code) {
  if (!code || typeof code !== 'string') return null;
  const c = code.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(c) || c === 'XX' || c === 'T1') return null;
  return c;
}

function stripIp(addr) {
  return String(addr || '').replace(/^::ffff:/, '').trim();
}

function isPrivateOrLocal(ip) {
  if (!ip) return true;
  if (ip === '::1') return true;
  return PRIVATE_V4.test(ip);
}

export function isTrustedProxy(ip) {
  const clean = stripIp(ip);
  if (!clean) return false;
  if (TRUSTED_PROXIES.has(clean)) return true;
  // Por defecto, peers de red privada (Docker / nginx local) se consideran proxy.
  return isPrivateOrLocal(clean);
}

/** IP del peer TCP inmediato (sin mirar cabeceras). */
export function getPeerIp(socket) {
  const addr = socket.handshake?.address || socket.conn?.remoteAddress || '';
  return stripIp(addr);
}

/**
 * IP del cliente real. Solo usa X-Forwarded-For / X-Real-IP si el peer es un
 * proxy de confianza; si no, usa la IP del socket (evita spoofing).
 */
export function getClientIp(socket) {
  const peer = getPeerIp(socket);
  if (isTrustedProxy(peer)) {
    const headers = socket.handshake?.headers || {};
    const xf = headers['x-forwarded-for'] || headers['x-real-ip'];
    if (xf) {
      const first = stripIp(String(xf).split(',')[0]);
      if (first) return first;
    }
  }
  return peer;
}

export function countryFromTimeZone(timeZone) {
  if (!timeZone || typeof timeZone !== 'string') return null;
  const tz = timeZone.trim();
  return normalizeCountry(TZ_TO_COUNTRY[tz]) || null;
}

function countryFromCdnHeaders(headers) {
  return normalizeCountry(
    headers['cf-ipcountry']
      || headers['cloudfront-viewer-country']
      || headers['x-vercel-ip-country']
      || headers['x-appengine-country']
      || headers['x-country-code'],
  );
}

function countryFromIp(ip) {
  if (!ip || isPrivateOrLocal(ip)) return null;
  try {
    return normalizeCountry(geoip.lookup(ip)?.country) || null;
  } catch {
    return null;
  }
}

/**
 * Resuelve país de origen.
 * Prioridad: zona horaria del cliente → CDN (solo proxy confiable) → GeoIP → unknown.
 * @returns {{ country: string, ipCountry: string|null, source: string, ip: string, timeZone: string|null }}
 */
export function resolveClientCountry(socket, { timeZone } = {}) {
  const ip = getClientIp(socket);
  const peer = getPeerIp(socket);
  const headers = socket.handshake?.headers || {};
  const ipCountry = countryFromIp(ip);
  const tzCountry = countryFromTimeZone(timeZone);

  if (tzCountry) {
    return {
      country: tzCountry,
      ipCountry,
      source: 'timezone',
      ip,
      timeZone: timeZone || null,
    };
  }

  if (isTrustedProxy(peer)) {
    const cdn = countryFromCdnHeaders(headers);
    if (cdn) {
      return {
        country: cdn,
        ipCountry: ipCountry || cdn,
        source: 'cdn',
        ip,
        timeZone: timeZone || null,
      };
    }
  }

  if (ipCountry) {
    return {
      country: ipCountry,
      ipCountry,
      source: 'geoip',
      ip,
      timeZone: timeZone || null,
    };
  }

  if (isPrivateOrLocal(ip)) {
    return {
      country: 'local',
      ipCountry: null,
      source: 'local',
      ip,
      timeZone: timeZone || null,
    };
  }

  return {
    country: 'unknown',
    ipCountry: null,
    source: 'unknown',
    ip,
    timeZone: timeZone || null,
  };
}
