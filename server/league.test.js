import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable, Writable } from 'node:stream';
import { createHandler } from './index.js';
import { validateRecord } from './league.js';

const env = { SUPABASE_URL: 'https://liga.example', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_teste' };
const headers = { authorization: 'Bearer token-da-conta', 'content-type': 'application/json' };
const club = { id: '00000000-0000-4000-8000-000000000001', name: 'Aurora FC', color: '#1155AA', code: 'AUR' };
const fixture = {
  id: '00000000-0000-4000-8000-000000000003',
  home_id: club.id, away_id: '00000000-0000-4000-8000-000000000002',
  home_score: 0, away_score: 2, played_on: '2024-02-29',
};

// Exercita o handler HTTP e o formato de resposta sem abrir uma porta TCP.
async function call(handler, url, options = {}) {
  const req = Readable.from(options.body ? [Buffer.from(options.body)] : []);
  Object.assign(req, { method: 'GET', headers, ...options, url });
  const chunks = [];
  const res = new Writable({ write(chunk, _, cb) { chunks.push(chunk); cb(); } });
  const responseHeaders = {};
  res.setHeader = (key, value) => { responseHeaders[key] = value; };
  res.writeHead = (status, values) => {
    res.statusCode = status;
    res.headersSent = true;
    Object.assign(responseHeaders, values);
  };
  await handler(req, res);
  const body = Buffer.concat(chunks).toString();
  return {
    status: res.statusCode, headers: responseHeaders,
    body: responseHeaders['Content-Type']?.includes('application/json') && body ? JSON.parse(body) : body,
  };
}

const offline = () => assert.fail('Não deveria consultar o banco.');
test('configuração pública e autenticação obrigatória', async () => {
  const handler = createHandler({ env: {}, fetchImpl: offline });
  const config = await call(handler, '/api/config');
  assert.deepEqual(config.body, { url: null, key: null });
  assert.equal((await call(handler, '/api/league', { headers: {} })).status, 401);
  assert.equal((await call(handler, '/api/league')).status, 503);
  assert.throws(() => createHandler({ env: { ...env, SUPABASE_PUBLISHABLE_KEY: 'sb_secret_exemplo' } }));
});

test('uma única leitura encaminha o token da sessão e a chave pública', async () => {
  const league = { teams: [club], matches: [fixture] };
  const handler = createHandler({ env, fetchImpl: async (url, init) => {
    assert.equal(url, 'https://liga.example/rest/v1/rpc/futtable_league');
    assert.equal(init.headers.Authorization, headers.authorization);
    assert.equal(init.headers.apikey, env.SUPABASE_PUBLISHABLE_KEY);
    return Response.json(league);
  } });
  assert.deepEqual((await call(handler, '/api/league')).body, league);
});

test('cadastro normaliza o clube e atribui o proprietário no banco', async () => {
  const handler = createHandler({ env, fetchImpl: async (url, options) => {
    assert.equal(new URL(url).pathname, '/rest/v1/teams');
    assert.deepEqual(JSON.parse(options.body), club);
    return Response.json([club], { status: 201 });
  } });
  const body = JSON.stringify({ ...club, name: '  Aurora  FC ', code: 'aur', owner_id: 'outra-conta' });
  const response = await call(handler, '/api/teams', { method: 'POST', body });
  assert.equal(response.status, 201);
  assert.deepEqual(response.body, club);
});

test('repetição de uma gravação só tem sucesso se o conteúdo for igual', async () => {
  const handler = createHandler({ env, fetchImpl: async (_, options) => options.method === 'POST'
    ? Response.json({ code: '23505' }, { status: 409 }) : Response.json([fixture]) });
  const add = data => call(handler, '/api/matches', { method: 'POST', body: JSON.stringify(data) });
  assert.deepEqual((await add(fixture)).body, fixture);
  assert.equal((await add({ ...fixture, away_score: 3 })).status, 409);
});

test('validações rejeitam datas impossíveis, autoconfronto e placares inválidos', () => {
  assert.deepEqual(validateRecord('matches', fixture), fixture);
  for (const change of [{ played_on: '2023-02-29' }, { away_id: club.id }, { home_score: -1 }, { away_score: 100 }, { home_score: '3' }]) {
    assert.throws(() => validateRecord('matches', { ...fixture, ...change }), { status: 400 });
  }
});

test('entrada inválida é rejeitada antes de qualquer acesso ao banco', async () => {
  const handler = createHandler({ env, fetchImpl: offline });
  for (const [body, status] of [['{}', 400], ['{', 400], ['x'.repeat(17000), 413]]) {
    assert.equal((await call(handler, '/api/teams', { method: 'POST', body })).status, status);
  }
  assert.equal((await call(handler, '/api/matches/id-invalido', { method: 'DELETE' })).status, 400);
});

test('remoção por ID usa o token da conta e tolera remoção prévia', async () => {
  const handler = createHandler({ env, fetchImpl: async (url, options) => {
    assert.equal(new URL(url).searchParams.get('id'), 'eq.' + fixture.id);
    assert.equal(options.method, 'DELETE');
    assert.equal(options.headers.Authorization, headers.authorization);
    return Response.json([]);
  } });
  assert.equal((await call(handler, '/api/matches/' + fixture.id, { method: 'DELETE' })).status, 204);
});

test('sessão expirada gera resposta 401 sem expor a mensagem interna do banco', async () => {
  const handler = createHandler({ env, fetchImpl: async () => Response.json({ message: 'detalhe privado' }, { status: 401 }) });
  const response = await call(handler, '/api/league');
  assert.equal(response.status, 401);
  assert.doesNotMatch(response.body.error, /privado/);
});

test('entrega a página e bloqueia caminhos externos ao build', async t => {
  const root = await mkdtemp(join(tmpdir(), 'futtable-http-'));
  t.after(() => rm(root, { force: true, recursive: true }));
  const dist = join(root, 'dist');
  await mkdir(dist);
  await writeFile(join(dist, 'index.html'), '<html>FutTable</html>');
  await writeFile(join(root, 'segredo.txt'), 'privado');
  await symlink(join(root, 'segredo.txt'), join(dist, 'atalho.txt'));
  const handler = createHandler({ env: {}, dist });
  assert.equal((await call(handler, '/')).body, '<html>FutTable</html>');
  assert.equal((await call(handler, '/', { method: 'HEAD' })).body, '');
  for (const path of ['/atalho.txt', '/%2e%2e%2fsegredo.txt', '/.env', '/arquivo.js']) {
    assert.equal((await call(handler, path)).status, 404);
  }
});

const correction = { previous_home_score: 0, previous_away_score: 2, home_score: 1, away_score: 3 };
const corrected = { ...fixture, home_score: 1, away_score: 3 };

function patchScore(handler, data = correction) {
  return call(handler, '/api/matches/' + fixture.id, { method: 'PATCH', body: JSON.stringify(data) });
}

test('correção envia só o placar para atualização e condiciona a escrita aos dois gols anteriores', async () => {
  const handler = createHandler({ env, fetchImpl: async (url, options) => {
    const query = new URL(url).searchParams;
    assert.equal(options.method, 'PATCH');
    assert.equal(query.get('id'), 'eq.' + fixture.id);
    assert.equal(query.get('home_score'), 'eq.0');
    assert.equal(query.get('away_score'), 'eq.2');
    assert.deepEqual(JSON.parse(options.body), { home_score: 1, away_score: 3 });
    return Response.json([corrected]);
  } });
  const response = await patchScore(handler, { ...correction, played_on: '2020-01-01' });
  assert.equal(response.status, 200);
  assert.deepEqual(response.body, corrected);
});

test('correção identifica conflito, repetição e ausência após uma atualização sem efeito', async () => {
  for (const [current, status] of [[[fixture], 409], [[corrected], 200], [[], 404]]) {
    const handler = createHandler({ env, fetchImpl: async (url, options) => {
      if (options.method === 'PATCH') return Response.json([]);
      assert.equal(options.method, 'GET');
      const query = new URL(url).searchParams;
      assert.equal(query.get('id'), 'eq.' + fixture.id);
      assert.equal(query.has('home_score'), false);
      assert.equal(query.has('away_score'), false);
      return Response.json(current);
    } });
    assert.equal((await patchScore(handler)).status, status);
  }
});

test('correção requer placares válidos tanto na versão original quanto na nova', async () => {
  const handler = createHandler({ env, fetchImpl: offline });
  for (const field of Object.keys(correction)) {
    assert.equal((await patchScore(handler, { ...correction, [field]: undefined })).status, 400);
    assert.equal((await patchScore(handler, { ...correction, [field]: -1 })).status, 400);
  }
});
