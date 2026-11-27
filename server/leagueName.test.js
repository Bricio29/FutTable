import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { createHandler } from './index.js';
import { leagueClient } from './league.js';

const config = { url: 'https://liga.example', key: 'sb_publishable_teste' };
const id = '44d3991b-a1bd-460f-a21b-7e4ca7dce7ca';

async function call(handler, method, url, body, leagueId) {
  const request = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))]);
  Object.assign(request, {
    method, url, headers: {
      authorization: 'Bearer jogador', 'content-type': 'application/json',
      ...(leagueId === undefined ? {} : { 'x-futtable-league': leagueId }),
    },
  });
  const response = {
    setHeader() {},
    writeHead(status) { this.status = status; },
    end(body) { this.body = JSON.parse(body); },
  };
  await handler(request, response);
  return { status: response.status, body: response.body };
}

const env = { SUPABASE_URL: config.url, SUPABASE_PUBLISHABLE_KEY: config.key };

test('PATCH /api/league salva o nome da liga selecionada com a sessão e o nome anterior', async () => {
  const handler = createHandler({ env, fetchImpl: async (url, init) => {
    assert.equal(url, config.url + '/rest/v1/rpc/futtable_rename_league');
    assert.equal(init.headers.Authorization, 'Bearer jogador');
    assert.equal(init.headers['X-FutTable-League'], id);
    assert.deepEqual(JSON.parse(init.body), { league_name: 'Copa da Praça', expected_name: 'Minha liga' });
    return Response.json({ name: 'Copa da Praça' });
  } });
  assert.deepEqual(await call(handler, 'PATCH', '/api/league', { name: ' Copa   da Praça ', previous_name: 'Minha liga' }, id),
    { status: 200, body: { name: 'Copa da Praça' } });
});

test('lista ligas e cria liga com o mesmo identificador a cada repetição', async () => {
  const league = { id, name: 'Copa', created_at: '2026-11-27T12:00:00Z' };
  const handler = createHandler({ env, fetchImpl: async (url, init) => {
    assert.equal(init.method, 'POST');
    assert.equal(init.headers.Authorization, 'Bearer jogador');
    assert.equal(init.headers['X-FutTable-League'], undefined);
    if (url.endsWith('/rpc/futtable_list_leagues')) return Response.json({ leagues: [league] });
    assert.equal(url, config.url + '/rest/v1/rpc/futtable_create_league');
    assert.deepEqual(JSON.parse(init.body), { request_id: id, league_name: 'Copa' });
    return Response.json(league);
  } });
  const draft = { id, name: ' Copa ' };
  for (let attempt = 0; attempt < 2; attempt++) {
    assert.deepEqual(await call(handler, 'POST', '/api/leagues', draft), { status: 201, body: league });
  }
  assert.deepEqual(await call(handler, 'GET', '/api/leagues'), { status: 200, body: { leagues: [league] } });
});

test('valida o cabeçalho de liga e o encaminha também nas rotas de dados existentes', async () => {
  let calls = 0;
  const handler = createHandler({ env, fetchImpl: async (_url, init) => {
    calls++;
    assert.equal(init.headers['X-FutTable-League'], id);
    return Response.json({ teams: [], matches: [], draws: [] });
  } });
  for (const leagueId of ['', 'abc', [id, id]]) {
    assert.equal((await call(handler, 'GET', '/api/league', undefined, leagueId)).status, 400);
  }
  assert.equal((await call(handler, 'GET', '/api/league', undefined, id.toUpperCase())).status, 200);
  assert.equal(calls, 1);
});

test('rejeita nomes inválidos e exige o nome anteriormente lido', () => {
  const client = leagueClient(config, 'Bearer jogador', () => assert.fail('Pedido inválido enviado ao banco'));
  for (const draft of [null, { name: 'Copa' }, { name: null }, { name: ' ', previous_name: null },
    { name: '⚽'.repeat(61), previous_name: null }, { name: 'Copa', previous_name: 42 }]) {
    assert.throws(() => client.renameLeague(draft), { status: 400 });
  }
});

test('preserva o status de conflito quando outra sessão altera a liga', async () => {
  const client = leagueClient(config, 'Bearer jogador', async () =>
    Response.json({ code: 'PT409', message: 'A liga mudou.' }, { status: 409 }));
  await assert.rejects(client.renameLeague({ name: 'Copa', previous_name: 'Liga' }), { status: 409 });
});
