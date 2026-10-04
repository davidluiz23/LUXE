import { createServer } from 'node:http';
import { createHash, timingSafeEqual } from 'node:crypto';
import { mkdir, open, readFile, rename, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';

const MAX_BODY_BYTES = 24_576;
const digest = value => createHash('sha256').update(value).digest('hex');
const reply = (response, status, body) => {
  response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(body));
};

// Mount alongside the user's existing bot. It owns login, reconnects and creds.
export function createBaileysBridge({ getSocket, isConnected, token, receiptDirectory }) {
  if (typeof token !== 'string' || token.length < 32) throw new Error('A bridge token of at least 32 characters is required.');
  if (typeof getSocket !== 'function' || typeof isConnected !== 'function') throw new Error('Provide getSocket and isConnected callbacks from the existing bot.');
  if (typeof receiptDirectory !== 'string' || !receiptDirectory) throw new Error('A persistent receipt directory is required.');
  const directory = resolve(receiptDirectory);
  const authorized = createHash('sha256').update(`Bearer ${token}`).digest();
  const inFlight = new Map();

  async function deliver(id, fingerprint, to, text) {
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const file = join(directory, `${digest(id)}.json`);
    let receipt;
    try { receipt = JSON.parse(await readFile(file, 'utf8')); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (receipt) {
      if (receipt.fingerprint !== fingerprint) return { status: 409, body: { error: 'idempotency_conflict' } };
      if (receipt.status === 'sent') return { status: 200, body: { ok: true, messageId: receipt.messageId, duplicate: true } };
      // An interrupted send needs reconciliation; never blindly send it again.
      return { status: 409, body: { error: 'delivery_unknown' } };
    }
    const socket = getSocket();
    if (!isConnected() || typeof socket?.sendMessage !== 'function') {
      return { status: 503, body: { error: 'bot_disconnected' } };
    }
    let reservation;
    try { reservation = await open(file, 'wx', 0o600); }
    catch (error) {
      if (error.code === 'EEXIST') return { status: 409, body: { error: 'delivery_in_progress' } };
      throw error;
    }
    try {
      await reservation.writeFile(JSON.stringify({ fingerprint, status: 'sending', startedAt: new Date().toISOString() }));
      await reservation.sync();
    } finally { await reservation.close(); }
    let timer;
    try {
      const result = await Promise.race([
        socket.sendMessage(`${to}@s.whatsapp.net`, { text }),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Delivery timed out')), 10_000); }),
      ]);
      const messageId = result?.key?.id;
      if (typeof messageId !== 'string' || !messageId) return { status: 502, body: { error: 'delivery_unknown' } };
      const temporary = `${file}.tmp`;
      await writeFile(temporary, JSON.stringify({ fingerprint, status: 'sent', messageId, sentAt: new Date().toISOString() }), { mode: 0o600 });
      await rename(temporary, file);
      return { status: 200, body: { ok: true, messageId } };
    } catch {
      return { status: 502, body: { error: 'delivery_unknown' } };
    } finally { clearTimeout(timer); }
  }

  const server = createServer(async (request, response) => {
    try {
      const supplied = createHash('sha256').update(String(request.headers.authorization || '')).digest();
      if (!timingSafeEqual(supplied, authorized)) return reply(response, 401, { error: 'unauthorized' });
      const route = new URL(request.url, 'http://bridge.local').pathname;
      if (route === '/health' && request.method === 'GET') {
        const connected = !!isConnected();
        return reply(response, connected ? 200 : 503, { ok: connected, provider: 'baileys', connected });
      }
      if (route !== '/v1/messages') return reply(response, 404, { error: 'not_found' });
      if (request.method !== 'POST') return reply(response, 405, { error: 'method_not_allowed' });
      if (!String(request.headers['content-type'] || '').startsWith('application/json')) return reply(response, 415, { error: 'json_required' });
      if (Number(request.headers['content-length']) > MAX_BODY_BYTES) return reply(response, 413, { error: 'request_too_large' });
      let size = 0;
      const chunks = [];
      for await (const chunk of request) {
        size += chunk.length;
        if (size <= MAX_BODY_BYTES) chunks.push(chunk);
      }
      if (size > MAX_BODY_BYTES) return reply(response, 413, { error: 'request_too_large' });
      let body;
      try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
      catch { return reply(response, 400, { error: 'invalid_json' }); }
      const id = request.headers['idempotency-key'];
      if (!body || typeof body !== 'object' || Array.isArray(body) ||
          typeof body.to !== 'string' || !/^[1-9]\d{6,14}$/.test(body.to) ||
          typeof body.text !== 'string' || !body.text.trim() || body.text.length > 4096 ||
          typeof id !== 'string' || !/^[a-zA-Z0-9:_.-]{1,240}$/.test(id)) {
        return reply(response, 400, { error: 'invalid_message' });
      }
      const fingerprint = digest(JSON.stringify([body.to, body.text]));
      let active = inFlight.get(id);
      if (active && active.fingerprint !== fingerprint) return reply(response, 409, { error: 'idempotency_conflict' });
      if (!active) {
        active = { fingerprint, promise: deliver(id, fingerprint, body.to, body.text) };
        inFlight.set(id, active);
      }
      try {
        const result = await active.promise;
        reply(response, result.status, result.body);
      } finally {
        if (inFlight.get(id) === active) inFlight.delete(id);
      }
    } catch {
      if (!response.headersSent) reply(response, 503, { error: 'bridge_unavailable' });
      else response.end();
    }
  });
  server.requestTimeout = 15_000;
  server.headersTimeout = 10_000;
  return server;
}
