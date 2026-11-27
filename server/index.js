import { createServer } from 'node:http';
import { open, realpath } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { pipeline } from 'node:stream/promises';
import { HttpError, leagueClient, publicConfig } from './league.js';

const defaultDist = fileURLToPath(new URL('../dist/', import.meta.url));
const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

function json(res, status, value) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(value));
}

async function readBody(req) {
  if (req.headers['content-type']?.split(';')[0].trim().toLowerCase() !== 'application/json') {
    throw new HttpError(415, 'Use o formato JSON para enviar os dados.');
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 16 * 1024) throw new HttpError(413, 'Os dados enviados excedem o tamanho permitido.');
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new HttpError(400, 'O JSON enviado é inválido.');
  }
}

async function handleApi(req, res, pathname, config, fetchImpl) {
  if (req.method === 'GET' && pathname === '/api/config') return json(res, 200, config);
  const client = leagueClient(config, req.headers.authorization, fetchImpl);
  if (req.method === 'GET' && pathname === '/api/league') {
    return json(res, 200, await client.getLeague());
  }
  if (req.method === 'POST' && ['/api/teams', '/api/matches'].includes(pathname)) {
    const data = await client.add(pathname.slice('/api/'.length), await readBody(req));
    return json(res, 201, data);
  }
  const record = pathname.match(/^\/api\/(teams|matches)\/([^/]+)$/);
  if (req.method === 'PATCH' && record) {
    const data = await readBody(req);
    const updated = record[1] === 'teams' ? await client.updateTeam(record[2], data) : await client.updateScore(record[2], data);
    return json(res, 200, updated);
  }
  if (req.method === 'DELETE' && record) {
    if (record[1] === 'teams') await client.removeTeam(record[2], await readBody(req));
    else await client.removeMatch(record[2]);
    res.writeHead(204, { 'Cache-Control': 'no-store' });
    return res.end();
  }
  throw new HttpError(404, 'Rota não encontrada.');
}

async function serveStatic(req, res, pathname, dist) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    throw new HttpError(405, 'Método não permitido.');
  }
  if (pathname.includes('\\') || pathname.includes('\0') ||
      pathname.split('/').some(part => part.startsWith('.'))) {
    throw new HttpError(404, 'Arquivo não encontrado.');
  }
  const root = await realpath(dist).catch(() => null);
  if (!root) throw new HttpError(503, 'Gere a interface com npm run build.');
  const target = join(root, extname(pathname) ? pathname : 'index.html');
  const file = await realpath(target).catch(() => null);
  if (!file || !file.startsWith(root + sep)) throw new HttpError(404, 'Arquivo não encontrado.');
  const handle = await open(file);
  try {
    const stat = await handle.stat();
    if (!stat.isFile()) throw new HttpError(404, 'Arquivo não encontrado.');
    res.writeHead(200, {
      'Content-Type': mimeTypes[extname(file)] ?? 'application/octet-stream',
      'Content-Length': stat.size,
      'Cache-Control': pathname.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache',
    });
    if (req.method === 'HEAD') return res.end();
    await pipeline(handle.createReadStream({ autoClose: false }), res);
  } finally {
    await handle.close();
  }
}

export function createHandler({ env = process.env, fetchImpl = fetch, dist = defaultDist } = {}) {
  const config = publicConfig(env);
  return async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('X-Frame-Options', 'DENY');
    try {
      let pathname;
      try {
        // Usa somente o caminho local como entrada, independentemente do Host.
        pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      } catch {
        throw new HttpError(400, 'Endereço inválido.');
      }
      if (pathname === '/api' || pathname.startsWith('/api/')) {
        await handleApi(req, res, pathname, config, fetchImpl);
      } else {
        await serveStatic(req, res, pathname, dist);
      }
    } catch (error) {
      if (!res.headersSent && !res.destroyed) {
        const known = error instanceof HttpError;
        json(res, known ? error.status : 500, { error: known ? error.message : 'Erro interno ao processar a solicitação.' });
      }
    }
  };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const port = Number(process.env.PORT || 3001);
  const server = createServer({ requestTimeout: 30000, headersTimeout: 15000 }, createHandler());
  server.listen(port, () => console.log('FutTable disponível na porta ' + server.address().port));
}
