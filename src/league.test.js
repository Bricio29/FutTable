import test from 'node:test';
import assert from 'node:assert/strict';
import { standings, prepareTeam, prepareMatch, replaceTeam, withoutTeam } from './league.js';

const clubs = [
  ['Aurora FC', 'AUR', '#166D54'],
  ['Atlético Serrano', 'SER', '#475CB0'],
  ['Estrela do Norte', 'EST', '#AB3F53'],
  ['União do Vale', 'UDV', '#9058AF'],
  ['Real Litoral', 'LIT', '#167DA1'],
  ['Vila Operária', 'VOP', '#C36427'],
  ['Ferroviário Sul', 'FER', '#394757'],
  ['Porto Verde', 'PTV', '#69833C'],
];

function fixtureId(group, index) {
  return `00000000-0000-4000-800${group}-${String(index + 1).padStart(12, '0')}`;
}

const teams = clubs.map(([name, code, color], index) => ({ id: fixtureId(1, index), name, code, color }));

const rounds = [
  ['2026-11-01', [[0, 7, 3, 0], [1, 6, 2, 0], [2, 5, 1, 1], [3, 4, 2, 1]]],
  ['2026-11-08', [[6, 0, 1, 2], [5, 7, 2, 0], [4, 1, 1, 1], [3, 2, 0, 2]]],
  ['2026-11-15', [[0, 5, 1, 1], [6, 4, 2, 3], [7, 3, 1, 2], [1, 2, 2, 1]]],
  ['2026-11-22', [[4, 0, 0, 3], [3, 5, 1, 1], [2, 6, 2, 0], [1, 7, 3, 1]]],
];

const matches = rounds.flatMap(([played_on, fixtures], roundIndex) =>
  fixtures.map(([home, away, home_score, away_score], index) => ({
    id: fixtureId(2, roundIndex * 4 + index),
    home_id: teams[home].id,
    away_id: teams[away].id,
    home_score,
    away_score,
    played_on,
  })),
);

const sampleLeague = { teams, matches };

const [a, b, c, d] = sampleLeague.teams;

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

test('classificação de quatro rodadas preserva todos os confrontos', () => {
  assert.equal(sampleLeague.teams.length, 8);
  const pairs = new Set(sampleLeague.matches.map(match => [match.home_id, match.away_id].sort().join('/')));
  assert.equal(pairs.size, 16);
  assert.ok(standings(sampleLeague).every(row => row.played === 4));
  for (const match of sampleLeague.matches) assert.deepEqual(prepareMatch(match), match);
});

test('normaliza cadastro e valida data e placar inclusive zero', () => {
  assert.deepEqual(prepareTeam({ ...a, name: ' Aurora   FC ', code: 'aur' }), a);
  assert.throws(() => prepareTeam({ ...a, code: 'inválida' }));
  const match = sampleLeague.matches[0];
  assert.throws(() => prepareMatch({ ...match, home_id: match.away_id }));
  for (const home_score of [NaN, 100, -1, 1.5, '', null]) assert.throws(() => prepareMatch({ ...match, home_score }));
  assert.throws(() => prepareMatch({ ...match, played_on: '2026-02-29' }));
  assert.equal(prepareMatch({ ...match, home_score: '0', played_on: '2024-02-29' }).home_score, 0);
});

test('editar um clube atualiza o nome na classificação e preserva o histórico', () => {
  const next = prepareTeam({ ...a, name: 'Aurora do Vale', code: 'ADV', color: '#FFBB33' });
  const edited = replaceTeam(sampleLeague, next);
  assert.equal(edited.matches, sampleLeague.matches);
  const row = standings(edited).find(row => row.team.id === a.id);
  assert.deepEqual(row.team, next);
  assert.equal(row.played, 4);
});

test('exclusão de clube preserva os confrontos dos demais participantes', () => {
  const remaining = withoutTeam(sampleLeague, a.id);
  assert.equal(remaining.teams.length, 7);
  assert.equal(remaining.matches.length, 12);
  assert.ok(remaining.matches.every(match => match.home_id !== a.id && match.away_id !== a.id));
  assert.equal(standings(remaining).reduce((total, row) => total + row.played, 0), 24);
  assert.equal(withoutTeam(remaining, a.id), remaining);
});
