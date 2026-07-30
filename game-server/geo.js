// geo.js — País del cliente a partir de cabeceras CDN o GeoIP local (IP).
import geoip from 'geoip-lite';

const PRIVATE_V4 = /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.|0\.|169\.254\.)/;

function normalizeCountry(code) {
  if (!code || typeof code !== 'string') return null;
  const c = code.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(c) || c === 'XX' || c === 'T1') return null;
  return c;
}

export function getClientIp(socket) {
  const headers = socket.handshake?.headers || {};
  const xf = headers['x-forwarded-for'] || headers['x-real-ip'];
  if (xf) {
    const first = String(xf).split(',')[0].trim();
    if (first) return first.replace(/^::ffff:/, '');
  }
  const addr = socket.handshake?.address || socket.conn?.remoteAddress || '';
  return String(addr).replace(/^::ffff:/, '');
}

export function resolveClientCountry(socket) {
  const headers = socket.handshake?.headers || {};
  const fromHeader = normalizeCountry(
    headers['cf-ipcountry']
      || headers['cloudfront-viewer-country']
      || headers['x-vercel-ip-country']
      || headers['x-appengine-country']
      || headers['x-country-code'],
  );
  if (fromHeader) return fromHeader;

  const ip = getClientIp(socket);
  if (!ip || ip === '::1' || PRIVATE_V4.test(ip)) return 'local';

  try {
    const hit = geoip.lookup(ip);
    return normalizeCountry(hit?.country) || 'unknown';
  } catch {
    return 'unknown';
  }
}
