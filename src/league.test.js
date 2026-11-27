import test from 'node:test';
import assert from 'node:assert/strict';
import { demoLeague, standings, prepareTeam, prepareMatch } from './league.js';

const [a, b, c, d] = demoLeague.teams;

function fixture(home, away, hs, as, order = 1) {
  return {
    id: String(order),
    home_id: home.id, away_id: away.id, home_score: hs, away_score: as,
    played_on: '2026-11-' + String(order).padStart(2, '0'),
  };
}

test('vitória, empate e derrota nos dois mandos e clube estreante', () => {
  const league = { teams: [a, b, c, d], matches: [fixture(a, b, 2, 0), fixture(c, a, 1, 1, 2)] };
  const [leader, second, third, last] = standings(league);
  assert.deepEqual(leader, { team: a, points: 4, played: 2, wins: 1, draws: 1, losses: 0, gf: 3, ga: 1, gd: 2, form: ['V', 'E'] });
  assert.equal(second.team.id, c.id);
  assert.equal(third.team.id, d.id);
  assert.equal(last.losses, 1);
});

test('desempata por saldo, gols pró e depois nome', () => {
  const matches = [fixture(a, b, 2, 1), fixture(c, d, 1, 0, 2)];
  assert.deepEqual(standings({ teams: [d, c, b, a], matches }).map(row => row.team), [a, c, b, d]);
  assert.deepEqual(standings({ teams: [a, b], matches: [] }).map(row => row.team), [b, a]);
  matches[1] = fixture(c, d, 2, 0, 2);
  assert.equal(standings({ teams: [a, b, c, d], matches })[0].team, c);
});

test('forma respeita a data da partida e mantém apenas as últimas cinco', () => {
  const matches = [3, 6, 1, 4, 2, 5].map(day => fixture(a, b, 1, day % 3, day));
  const rows = standings({ teams: [a, b], matches });
  assert.deepEqual(rows.find(row => row.team === a).form, ['D', 'V', 'E', 'D', 'V']);
  assert.equal(matches[0].id, '3');
});

test('demonstração tem quatro partidas por clube e confrontos únicos', () => {
  assert.equal(demoLeague.teams.length, 8);
  const pairs = new Set(demoLeague.matches.map(match => [match.home_id, match.away_id].sort().join('/')));
  assert.equal(pairs.size, 16);
  assert.ok(standings(demoLeague).every(row => row.played === 4));
  for (const match of demoLeague.matches) assert.deepEqual(prepareMatch(match), match);
});

test('normaliza cadastro e valida data e placar inclusive zero', () => {
  assert.deepEqual(prepareTeam({ ...a, name: ' Aurora   FC ', code: 'aur' }), a);
  assert.throws(() => prepareTeam({ ...a, code: 'inválida' }));
  const match = demoLeague.matches[0];
  assert.throws(() => prepareMatch({ ...match, home_id: match.away_id }));
  for (const home_score of [NaN, 100, -1, 1.5, '', null]) assert.throws(() => prepareMatch({ ...match, home_score }));
  assert.throws(() => prepareMatch({ ...match, played_on: '2026-02-29' }));
  assert.equal(prepareMatch({ ...match, home_score: '0', played_on: '2024-02-29' }).home_score, 0);
});
