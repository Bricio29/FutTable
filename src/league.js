function countResult(row, scored, conceded) {
  row.played++;
  row.gf += scored;
  row.ga += conceded;
  row.gd += scored - conceded;
  if (scored > conceded) {
    row.wins++;
    row.points += 3;
    row.form.push('V');
  } else if (scored === conceded) {
    row.draws++;
    row.points++;
    row.form.push('E');
  } else {
    row.losses++;
    row.form.push('D');
  }
  if (row.form.length > 5) row.form.shift();
}

export function isPlayed(match) {
  return Number.isInteger(match.home_score) && Number.isInteger(match.away_score) && Boolean(match.played_on);
}

export function matchTeam(match, side, teamsById) {
  const team = teamsById.get(match[side + '_id']);
  if (!team || !match.draw_id) return team;
  return {
    ...team,
    name: match[side + '_team_name'] ?? team.name,
    player_name: match[side + '_player_name'] ?? team.player_name,
    catalog_id: match[side + '_team_name'] ? match[side + '_catalog_id'] : team.catalog_id,
  };
}

export function standings(league) {
  const rows = new Map(league.teams.map(team => [team.id, {
    team, points: 0, played: 0, wins: 0, draws: 0, losses: 0, gf: 0, ga: 0, gd: 0, form: [],
  }]));
  const byDate = league.matches.filter(isPlayed).sort((a, b) => a.played_on.localeCompare(b.played_on) || a.id.localeCompare(b.id));
  for (const match of byDate) {
    const home = rows.get(match.home_id);
    const away = rows.get(match.away_id);
    if (!home || !away) continue;
    countResult(home, match.home_score, match.away_score);
    countResult(away, match.away_score, match.home_score);
  }
  return [...rows.values()].sort((a, b) =>
    b.points - a.points || b.gd - a.gd || b.gf - a.gf ||
    a.team.name.localeCompare(b.team.name, 'pt-BR') || a.team.id.localeCompare(b.team.id)
  );
}

export function recordId(id) {
  if (id === undefined) {
    if (crypto.randomUUID) return crypto.randomUUID();
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 15) | 64;
    bytes[8] = (bytes[8] & 63) | 128;
    const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
    return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join('-');
  }
  if (typeof id !== 'string' || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(id)) {
    throw new Error('Identificador inválido.');
  }
  return id.toLowerCase();
}

export function prepareTeam(input) {
  const name = typeof input.name === 'string' ? input.name.trim().replace(/\s+/g, ' ') : '';
  const code = typeof input.code === 'string' ? input.code.trim().toUpperCase() : '';
  if ([...name].length < 2 || [...name].length > 60) throw new Error('Use entre 2 e 60 caracteres no nome do clube.');
  if (!/^[A-Z0-9]{2,4}$/.test(code)) throw new Error('Use de 2 a 4 letras ou números na sigla.');
  if (typeof input.color !== 'string' || !/^#[\da-f]{6}$/i.test(input.color)) throw new Error('Escolha uma cor válida para o clube.');
  if (input.player_name != null && typeof input.player_name !== 'string') throw new Error('Informe um nome de jogador válido.');
  const player = input.player_name?.trim().replace(/\s+/gu, ' ') || null;
  if (player && ([...player].length > 60 || /[\u0000-\u001f\u007f]/u.test(player))) {
    throw new Error('Use até 60 caracteres no nome do jogador.');
  }
  return { id: recordId(input.id), name, code, color: input.color, player_name: player, catalog_id: input.catalog_id || null };
}

export function replaceTeam(league, team) {
  return { ...league, teams: league.teams.map(row => row.id === team.id ? team : row) };
}

export function withoutTeam(league, id) {
  if (!league.teams.some(team => team.id === id)) return league;
  const matches = league.matches.filter(match => match.home_id !== id && match.away_id !== id);
  return {
    ...league,
    teams: league.teams.filter(team => team.id !== id),
    matches,
    draws: (league.draws ?? []).map(draw => draw.bye_team_id === id ? { ...draw, bye_team_id: null } : draw),
  };
}

export function today() {
  const date = new Date();
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
}

function score(value) {
  if (typeof value === 'string' && /^\d+$/.test(value.trim())) value = Number(value);
  if (!Number.isInteger(value) || value < 0 || value > 99) throw new Error('Informe de 0 a 99 gols para cada clube.');
  return value;
}

export function prepareMatch(input) {
  if (!input.home_id || !input.away_id) {
    throw new Error('Selecione dois clubes diferentes.');
  }
  const home_id = recordId(input.home_id);
  const away_id = recordId(input.away_id);
  if (home_id === away_id) throw new Error('Selecione dois clubes diferentes.');
  const played_on = input.played_on;
  const day = new Date(played_on + 'T12:00:00Z');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(played_on) || played_on.startsWith('0000') ||
      !Number.isFinite(day.getTime()) || day.toISOString().slice(0, 10) !== played_on) {
    throw new Error('Informe uma data válida para a partida.');
  }
  return {
    id: recordId(input.id), home_id, away_id,
    home_score: score(input.home_score), away_score: score(input.away_score), played_on,
  };
}
