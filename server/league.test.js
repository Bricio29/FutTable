import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable, Writable } from 'node:stream';
import { createHandler } from './index.js';
import { validateRecord } from './league.js';
import { clubCatalog } from '../src/clubCatalog.js';

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

function exampleKey(role) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ role })).toString('base64url');
  return [header, payload, 'assinatura-de-teste'].join('.');
}

test('configuração auto-hospedada expõe a chave anon e encaminha o token da conta', async () => {
  const key = exampleKey('anon');
  const url = 'https://gateway.example';
  for (const name of ['ANON_KEY', 'SUPABASE_ANON_KEY']) {
    const handler = createHandler({
      env: { SUPABASE_PUBLIC_URL: url + '/', [name]: key },
      fetchImpl: async (target, init) => {
        assert.equal(target, url + '/rest/v1/rpc/futtable_league');
        assert.equal(init.headers.apikey, key);
        assert.equal(init.headers.Authorization, headers.authorization);
        return Response.json({ teams: [], matches: [] });
      },
    });
    assert.deepEqual((await call(handler, '/api/config')).body, { url, key });
    assert.equal((await call(handler, '/api/league')).status, 200);
  }
});

test('rejeita chaves administrativas, tokens de conta e chaves legadas inválidas', () => {
  for (const key of [exampleKey('service_role'), exampleKey('authenticated'), 'sb_secret_teste', 'mal.formado.aqui']) {
    assert.throws(() => createHandler({ env: { SUPABASE_URL: env.SUPABASE_URL, ANON_KEY: key } }), /chave publicável/);
  }
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

const teamEdit = {
  name: 'Clube do Sol', code: 'SOL', color: '#F0C118',
  previous_name: 'Aurora & Cia, "A+B"', previous_code: club.code, previous_color: club.color,
};

function manageTeam(handler, method, data) {
  return call(handler, '/api/teams/' + club.id, { method, body: JSON.stringify(data) });
}

test('edição atualiza os campos permitidos e trata o nome anterior como um único filtro', async () => {
  const updated = { id: club.id, name: teamEdit.name, code: teamEdit.code, color: teamEdit.color };
  const handler = createHandler({ env, fetchImpl: async (url, options) => {
    const query = new URL(url).searchParams;
    assert.equal(options.method, 'PATCH');
    assert.equal(options.headers.Authorization, headers.authorization);
    assert.equal(query.get('id'), 'eq.' + club.id);
    for (const field of ['name', 'code', 'color']) assert.equal(query.get(field), 'eq.' + teamEdit['previous_' + field]);
    assert.deepEqual(JSON.parse(options.body), { name: updated.name, code: updated.code, color: updated.color });
    return Response.json([updated]);
  } });
  const response = await manageTeam(handler, 'PATCH', { ...teamEdit, name: 'Clube  do Sol', code: 'sol', owner_id: 'outro' });
  assert.equal(response.status, 200);
  assert.deepEqual(response.body, updated);
});

test('edição detecta cadastro removido, concorrente, duplicado e repetição após perda de resposta', async () => {
  const saved = { id: club.id, name: teamEdit.name, code: teamEdit.code, color: teamEdit.color };
  for (const [rows, status] of [[[], 404], [[club], 409], [[saved], 200]]) {
    const handler = createHandler({ env, fetchImpl: async (_, options) => Response.json(options.method === 'PATCH' ? [] : rows) });
    assert.equal((await manageTeam(handler, 'PATCH', teamEdit)).status, status);
  }
  const duplicate = createHandler({ env, fetchImpl: async () => Response.json({ code: '23505' }, { status: 409 }) });
  assert.equal((await manageTeam(duplicate, 'PATCH', teamEdit)).status, 409);
});

test('exclusão atômica exige contagem confirmada, aceita repetição e reporta conflito', async () => {
  for (const [result, status] of [['removed', 204], ['absent', 204], ['conflict', 409]]) {
    const handler = createHandler({ env, fetchImpl: async (url, options) => {
      assert.equal(new URL(url).pathname, '/rest/v1/rpc/futtable_remove_team');
      assert.equal(options.method, 'POST');
      assert.equal(options.headers.Authorization, headers.authorization);
      assert.deepEqual(JSON.parse(options.body), { team_id: club.id, expected_matches: 3 });
      return Response.json(result);
    } });
    assert.equal((await manageTeam(handler, 'DELETE', { match_count: 3 })).status, status);
  }
});

test('edição e exclusão validam a entrada antes de acessar o banco', async () => {
  const handler = createHandler({ env, fetchImpl: offline });
  for (const field of Object.keys(teamEdit)) {
    assert.equal((await manageTeam(handler, 'PATCH', { ...teamEdit, [field]: '' })).status, 400);
  }
  for (const match_count of [null, undefined, -1, 0.5, '0']) {
    assert.equal((await manageTeam(handler, 'DELETE', { match_count })).status, 400);
  }
});

test('cadastro de jogador e clube do catálogo normaliza o nome e valida os campos', () => {
  const registered = { ...club, catalog_id: 'real-madrid', player_name: 'Ana Silva' };
  assert.deepEqual(validateRecord('teams', { ...registered, player_name: ' Ana  Silva  ' }), registered);
  assert.deepEqual(validateRecord('teams', { ...club, player_name: ' ' }), { ...club, player_name: null });
  for (const field of [{ catalog_id: 'Real Madrid' }, { player_name: 2 }, { player_name: 'x'.repeat(61) }]) {
    assert.throws(() => validateRecord('teams', { ...club, ...field }), { status: 400 });
  }
});

test('edição protege também a associação de jogador e catálogo a partir de valores nulos', async () => {
  const handler = createHandler({ env, fetchImpl: async (url, options) => {
    const query = new URL(url).searchParams;
    assert.equal(query.get('catalog_id'), 'is.null');
    assert.equal(query.get('player_name'), 'eq.Ana Silva');
    const { catalog_id, player_name } = JSON.parse(options.body);
    assert.equal(catalog_id, 'arsenal-w');
    assert.equal(player_name, null);
    return Response.json([{ ...club, catalog_id, player_name }]);
  } });
  const input = { ...teamEdit, catalog_id: 'arsenal-w', player_name: null, previous_player_name: ' Ana Silva ' };
  assert.equal((await manageTeam(handler, 'PATCH', input)).status, 400);
  assert.equal((await manageTeam(handler, 'PATCH', { ...input, previous_catalog_id: null })).status, 200);
});

test('sorteia todos ou só os participantes selecionados em uma única chamada autenticada', async () => {
  const result = { draw: { id: fixture.id, number: 1 }, matches: [{ ...fixture, played_on: null, home_score: null, away_score: null }] };
  for (const selection of [{}, { team_ids: [club.id, fixture.away_id] }]) {
    const handler = createHandler({ env, fetchImpl: async (target, options) => {
      assert.equal(new URL(target).pathname, '/rest/v1/rpc/futtable_draw');
      assert.equal(options.headers.Authorization, headers.authorization);
      assert.deepEqual(JSON.parse(options.body), { request_id: fixture.id, ...selection });
      return Response.json(result);
    } });
    const response = await call(handler, '/api/draws', { method: 'POST', body: JSON.stringify({ id: fixture.id, ...selection }) });
    assert.equal(response.status, 201);
    assert.deepEqual(response.body, result);
  }

  const handler = createHandler({ env, fetchImpl: offline });
  for (const input of [{ id: 'x' }, { id: fixture.id, team_ids: [club.id] }, { id: fixture.id, team_ids: [club.id, club.id] }, { id: fixture.id, team_ids: [null, club.id] }]) {
    assert.equal((await call(handler, '/api/draws', { method: 'POST', body: JSON.stringify(input) })).status, 400);
  }
});

test('registra resultado em jogo pendente validando a data, os gols e o id', async () => {
  const { home_score, away_score, played_on } = fixture;
  const result = data => ({ method: 'POST', body: JSON.stringify(data) });
  const handler = createHandler({ env, fetchImpl: async (target, options) => {
    assert.equal(new URL(target).pathname, '/rest/v1/rpc/futtable_finish_match');
    assert.deepEqual(JSON.parse(options.body), { match_id: fixture.id, goals_home: 0, goals_away: 2, game_date: played_on });
    return Response.json(fixture);
  } });
  const path = '/api/matches/' + fixture.id + '/result';
  assert.deepEqual((await call(handler, path, result({ home_score, away_score, played_on }))).body, fixture);
  assert.equal((await call(handler, path, result({ home_score, away_score, played_on: '2027-02-29' }))).status, 400);
  assert.equal((await call(handler, path, result({ home_score: null, away_score, played_on }))).status, 400);
});

test('preserva conflitos de participantes e rodadas devolvidos pelo banco', async () => {
  const message = 'Atualize a seleção de jogadores.';
  const handler = createHandler({ env, fetchImpl: async () => Response.json({ code: 'PT409', message }, { status: 409 }) });
  const response = await call(handler, '/api/draws', { method: 'POST', body: JSON.stringify({ id: fixture.id }) });
  assert.equal(response.status, 409);
  assert.equal(response.body.error, message);
});

test('sorteia os clubes no banco em uma única operação autenticada para até 50 jogadores', async () => {
  const catalog_ids = clubCatalog.map(club => club.id);
  const player_names = catalog_ids.map((_, index) => 'Jogador ' + (index + 1));
  const result = { teams: [{ ...club, catalog_id: 'real-madrid', player_name: 'Jogador 1' }] };
  const handler = createHandler({ env, fetchImpl: async (url, options) => {
    assert.equal(new URL(url).pathname, '/rest/v1/rpc/futtable_club_draw');
    assert.equal(options.headers.Authorization, headers.authorization);
    assert.deepEqual(JSON.parse(options.body), { request_id: fixture.id, player_names, catalog_ids });
    return Response.json(result);
  } });
  const body = { id: fixture.id, player_names: player_names.map(name => '  ' + name.replace(' ', '  ')), catalog_ids, owner_id: 'outro' };
  const response = await call(handler, '/api/club-draws', { method: 'POST', body: JSON.stringify(body) });
  assert.equal(response.status, 201);
  assert.deepEqual(response.body, result);
});

test('sorteio de clubes valida a quantidade, os nomes e o catálogo antes da RPC', async () => {
  const handler = createHandler({ env, fetchImpl: offline });
  const valid = { id: fixture.id, player_names: ['Ana', 'Bia'], catalog_ids: ['real-madrid', 'arsenal'] };
  for (const invalid of [
    { id: null }, { player_names: ['Ana'] }, { player_names: ['Ana', ' aNA '] }, { player_names: ['Ana', '  '] },
    { player_names: ['Ana', 1] }, { player_names: ['Ana', 'x'.repeat(61)] }, { player_names: null },
    { catalog_ids: ['real-madrid'] }, { catalog_ids: ['arsenal', 'arsenal'] }, { catalog_ids: ['real-madrid', 'desconhecido'] },
    { player_names: Array(51).fill('Ana'), catalog_ids: Array(51).fill('arsenal') },
  ]) {
    const response = await call(handler, '/api/club-draws', { method: 'POST', body: JSON.stringify({ ...valid, ...invalid }) });
    assert.equal(response.status, 400, JSON.stringify(invalid));
  }
  const conflict = createHandler({ env, fetchImpl: async () => Response.json({ code: 'PT409', message: 'Confira o vínculo.' }, { status: 409 }) });
  const response = await call(conflict, '/api/club-draws', { method: 'POST', body: JSON.stringify(valid) });
  assert.equal(response.status, 409);
  assert.equal(response.body.error, 'Confira o vínculo.');
});
