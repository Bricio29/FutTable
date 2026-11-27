import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { prepareMatch, prepareTeam, recordId, replaceTeam, withoutTeam } from './league.js';

const empty = { teams: [], matches: [], draws: [] };

async function request(token, path, method = 'GET', body) {
  let response;
  try {
    response = await fetch('/api/' + path, {
      method,
      headers: { Authorization: 'Bearer ' + token, ...(body && { 'Content-Type': 'application/json' }) },
      body: body && JSON.stringify(body),
    });
  } catch {
    throw new Error('Falha de conexão. Verifique sua internet e tente novamente.');
  }
  if (response.status === 204) return;
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const message = typeof data?.error === 'string' ? data.error : 'O servidor não conseguiu concluir a operação.';
    throw Object.assign(new Error(message), { status: response.status });
  }
  if (!data) throw new Error('A resposta do servidor está incompleta. Tente novamente.');
  return data;
}

function createLeagueStore(token) {
  const listeners = new Set();
  let state = { league: empty, loading: true, error: null };
  let tail = Promise.resolve();
  let active = false;
  const pending = new Map();

  function update(changes) {
    state = { ...state, ...changes };
    for (const notify of listeners) notify();
  }

  function enqueue(action) {
    const operation = tail.then(() => {
      if (!active || !token) throw new Error('A sessão mudou. Tente novamente.');
      return action();
    });
    tail = operation.catch(() => {});
    return operation;
  }

  async function refresh(showLoading = true) {
    if (showLoading) update({ loading: true, error: null });
    try {
      const league = await request(token, 'league');
      if (!Array.isArray(league.teams) || !Array.isArray(league.matches)) {
        throw new Error('O servidor retornou dados da liga incompletos.');
      }
      update({ league: { ...league, draws: league.draws ?? [] }, loading: false, error: null });
    } catch (error) {
      update({ loading: false, error: error.message });
    }
  }

  function reload() {
    if (!token || !active) return Promise.resolve();
    return enqueue(refresh).catch(cause => update({ loading: false, error: cause.message }));
  }

  function add(key, draft) {
    return enqueue(async () => {
      const record = key === 'teams' ? prepareTeam(draft) : prepareMatch(draft);
      // Reutiliza o UUID quando o servidor pode ter gravado antes de a resposta se perder.
      const fingerprint = JSON.stringify({ ...record, id: draft.id });
      if (pending.get(key)?.fingerprint === fingerprint) record.id = pending.get(key).id;
      pending.set(key, { fingerprint, id: record.id });
      const saved = await request(token, key, 'POST', record);
      pending.delete(key);
      const rows = state.league[key].filter(row => row.id !== saved.id);
      update({ league: { ...state.league, [key]: [...rows, saved] } });
      return saved;
    });
  }

  function removeMatch(id) {
    return enqueue(async () => {
      await request(token, 'matches/' + encodeURIComponent(id), 'DELETE');
      const matches = state.league.matches.filter(match => match.id !== id);
      update({ league: { ...state.league, matches } });
    });
  }

  function editAndRefreshOnConflict(action) {
    return enqueue(async () => {
      try {
        return await action();
      } catch (error) {
        if (error.status === 404 || error.status === 409) await refresh(false);
        throw error;
      }
    });
  }

  function updateTeam(snapshot, draft) {
    return editAndRefreshOnConflict(async () => {
      const previous = prepareTeam(snapshot);
      const next = prepareTeam({ ...draft, id: previous.id });
      const saved = await request(token, 'teams/' + previous.id, 'PATCH', {
        name: next.name, code: next.code, color: next.color,
        catalog_id: next.catalog_id, player_name: next.player_name,
        previous_name: previous.name, previous_code: previous.code, previous_color: previous.color,
        previous_catalog_id: previous.catalog_id, previous_player_name: previous.player_name,
      });
      update({ league: replaceTeam(state.league, saved) });
      return saved;
    });
  }

  function removeTeam(snapshot, matchCount) {
    return editAndRefreshOnConflict(async () => {
      const { id } = prepareTeam(snapshot);
      if (!Number.isSafeInteger(matchCount) || matchCount < 0) throw new Error('Confira as partidas antes de excluir o clube.');
      await request(token, 'teams/' + id, 'DELETE', { match_count: matchCount });
      update({ league: withoutTeam(state.league, id) });
    });
  }

  function updateScore(snapshot, home_score, away_score) {
    return editAndRefreshOnConflict(async () => {
      const previous = prepareMatch(snapshot);
      const next = prepareMatch({ ...previous, home_score, away_score });
      const saved = await request(token, 'matches/' + next.id, 'PATCH', {
        home_score: next.home_score, away_score: next.away_score,
        previous_home_score: previous.home_score, previous_away_score: previous.away_score,
      });
      const matches = state.league.matches.map(match => match.id === saved.id ? saved : match);
      update({ league: { ...state.league, matches } });
      return saved;
    });
  }

  function drawRound(teamIds) {
    return editAndRefreshOnConflict(async () => {
      const ids = [...teamIds].sort();
      const fingerprint = ids.join(',');
      const attempt = pending.get('draw');
      const id = attempt?.fingerprint === fingerprint ? attempt.id : recordId();
      pending.set('draw', { id, fingerprint });
      // Se a resposta se perder, repetir o mesmo pedido recupera a rodada já salva.
      const { draw, matches } = await request(token, 'draws', 'POST', { id, team_ids: ids });
      pending.delete('draw');
      const league = state.league;
      update({ league: {
        ...league,
        draws: [...league.draws.filter(row => row.id !== draw.id), draw],
        matches: [...league.matches.filter(match => match.draw_id !== draw.id), ...matches],
      } });
      return draw;
    });
  }

  function finishMatch(match, fields) {
    return editAndRefreshOnConflict(async () => {
      const { home_score, away_score, played_on } = prepareMatch({ ...match, ...fields });
      const saved = await request(token, 'matches/' + match.id + '/result', 'POST', { home_score, away_score, played_on });
      const matches = state.league.matches.map(row => row.id === saved.id ? saved : row);
      update({ league: { ...state.league, matches } });
      return saved;
    });
  }

  return {
    snapshot: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    start() {
      active = true;
      reload();
      return () => {
        active = false;
      };
    },
    reload,
    addTeam: draft => add('teams', draft),
    updateTeam,
    removeTeam,
    addMatch: draft => add('matches', draft),
    updateScore,
    drawRound,
    finishMatch,
    removeMatch,
  };
}

export function useLeague(accessToken) {
  const store = useMemo(() => createLeagueStore(accessToken), [accessToken]);
  const state = useSyncExternalStore(store.subscribe, store.snapshot, store.snapshot);
  useEffect(() => store.start(), [store]);
  return {
    ...state, reload: store.reload, addTeam: store.addTeam, updateTeam: store.updateTeam, removeTeam: store.removeTeam, addMatch: store.addMatch,
    updateScore: store.updateScore, removeMatch: store.removeMatch, drawRound: store.drawRound, finishMatch: store.finishMatch,
  };
}
