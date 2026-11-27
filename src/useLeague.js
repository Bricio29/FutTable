import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { demoLeague, prepareMatch, prepareTeam } from './league.js';

const storageKey = 'futtable.demo.v1';
const empty = { teams: [], matches: [] };

function readDemo() {
  let raw;
  try {
    raw = window.localStorage.getItem(storageKey);
  } catch {
    throw new Error('O navegador bloqueou o acesso aos dados da demonstração.');
  }
  if (raw === null) return demoLeague;
  try {
    const data = JSON.parse(raw);
    if (!Array.isArray(data.teams) || !Array.isArray(data.matches)) throw new Error();
    if (data.teams.some(team => !team?.id) || data.matches.some(match => !match?.id)) throw new Error();
    const teams = data.teams.map(prepareTeam);
    const matches = data.matches.map(prepareMatch);
    const ids = new Set(teams.map(team => team.id));
    if (ids.size !== teams.length) throw new Error();
    const matchIds = new Set();
    for (const match of matches) {
      if (matchIds.has(match.id) || !ids.has(match.home_id) || !ids.has(match.away_id)) throw new Error();
      matchIds.add(match.id);
    }
    return { teams, matches };
  } catch {
    throw new Error('Os dados da demonstração neste navegador estão inválidos.');
  }
}

function saveDemo(change) {
  const apply = () => {
    const next = change(readDemo());
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      throw new Error('Não foi possível salvar a demonstração neste navegador.');
    }
    return next;
  };
  return navigator.locks ? navigator.locks.request(storageKey, apply) : apply();
}

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

function insert(league, key, record) {
  const existing = league[key].find(row => row.id === record.id);
  if (existing) {
    if (Object.keys(record).every(field => existing[field] === record[field])) return league;
    throw new Error('O identificador deste registro já está em uso.');
  }
  if (key === 'teams') {
    if (league.teams.some(team => team.name.toLowerCase() === record.name.toLowerCase())) {
      throw new Error('Já existe um clube com esse nome.');
    }
  } else if (![record.home_id, record.away_id].every(id => league.teams.some(team => team.id === id))) {
    throw new Error('Um dos clubes selecionados não pertence a esta liga.');
  }
  return { ...league, [key]: [...league[key], record] };
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
      if (!active || token === undefined) throw new Error('A sessão mudou. Tente novamente.');
      return action();
    });
    tail = operation.catch(() => {});
    return operation;
  }

  async function refresh() {
    update({ loading: true, error: null });
    try {
      const league = token ? await request(token, 'league') : readDemo();
      if (!Array.isArray(league.teams) || !Array.isArray(league.matches)) {
        throw new Error('O servidor retornou dados da liga incompletos.');
      }
      update({ league, loading: false });
    } catch (error) {
      update({ loading: false, error: error.message });
    }
  }

  function reload() {
    if (token === undefined || !active) return Promise.resolve();
    return enqueue(refresh).catch(cause => update({ loading: false, error: cause.message }));
  }

  function add(key, draft) {
    return enqueue(async () => {
      const record = key === 'teams' ? prepareTeam(draft) : prepareMatch(draft);
      if (!token) {
        const league = await saveDemo(current => insert(current, key, record));
        update({ league, error: null });
        return record;
      }

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
      const withoutMatch = league => ({ ...league, matches: league.matches.filter(match => match.id !== id) });
      if (token) {
        await request(token, 'matches/' + encodeURIComponent(id), 'DELETE');
        update({ league: withoutMatch(state.league) });
      } else {
        const league = await saveDemo(withoutMatch);
        update({ league, error: null });
      }
    });
  }

  function updateScore(snapshot, home_score, away_score) {
    return enqueue(async () => {
      const previous = prepareMatch(snapshot);
      const next = prepareMatch({ ...previous, home_score, away_score });
      try {
        if (token) {
          const saved = await request(token, 'matches/' + next.id, 'PATCH', {
            home_score: next.home_score, away_score: next.away_score,
            previous_home_score: previous.home_score, previous_away_score: previous.away_score,
          });
          const matches = state.league.matches.map(match => match.id === saved.id ? saved : match);
          update({ league: { ...state.league, matches } });
          return saved;
        }
        const league = await saveDemo(current => {
          const match = current.matches.find(row => row.id === next.id);
          if (!match) throw Object.assign(new Error('Esta partida já foi excluída.'), { status: 404 });
          if (match.home_score === next.home_score && match.away_score === next.away_score) return current;
          if (match.home_score !== previous.home_score || match.away_score !== previous.away_score) {
            throw Object.assign(new Error('O placar mudou. Confira o resultado atual antes de corrigir.'), { status: 409 });
          }
          return { ...current, matches: current.matches.map(row => row.id === next.id ? next : row) };
        });
        update({ league, error: null });
        return league.matches.find(row => row.id === next.id);
      } catch (error) {
        if (error.status === 404 || error.status === 409) await refresh();
        throw error;
      }
    });
  }

  const onStorage = event => {
    if (event.storageArea === window.localStorage && (event.key === null || event.key === storageKey)) reload();
  };

  return {
    snapshot: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    start() {
      active = true;
      reload();
      if (token === null) window.addEventListener('storage', onStorage);
      return () => {
        active = false;
        window.removeEventListener('storage', onStorage);
      };
    },
    reload,
    addTeam: draft => add('teams', draft),
    addMatch: draft => add('matches', draft),
    updateScore,
    removeMatch,
  };
}

export function useLeague(accessToken) {
  const store = useMemo(() => createLeagueStore(accessToken), [accessToken]);
  const state = useSyncExternalStore(store.subscribe, store.snapshot, store.snapshot);
  useEffect(() => store.start(), [store]);
  return {
    ...state, reload: store.reload, addTeam: store.addTeam, addMatch: store.addMatch,
    updateScore: store.updateScore, removeMatch: store.removeMatch,
  };
}
