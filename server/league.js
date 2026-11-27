const UUID = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;
const columns = {
  teams: 'id,name,code,color,catalog_id,player_name',
  matches: 'id,home_id,away_id,home_score,away_score,played_on,draw_id,home_team_name,away_team_name,home_player_name,away_player_name,home_catalog_id,away_catalog_id',
};

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function uuid(value) {
  if (typeof value !== 'string' || !UUID.test(value)) {
    throw new HttpError(400, 'Identificador inválido.');
  }
  return value.toLowerCase();
}

function validateScores(...scores) {
  if (!scores.every(n => Number.isInteger(n) && n >= 0 && n <= 99)) {
    throw new HttpError(400, 'Informe gols inteiros entre 0 e 99.');
  }
}

function teamFields(name, code, color) {
  name = typeof name === 'string' ? name.trim().replace(/\s+/gu, ' ') : '';
  code = typeof code === 'string' ? code.trim().toUpperCase() : '';
  if ([...name].length < 2 || [...name].length > 60 || /[\u0000-\u001f\u007f]/u.test(name)) {
    throw new HttpError(400, 'O nome do clube precisa ter entre 2 e 60 caracteres.');
  }
  if (!/^[A-Z0-9]{2,4}$/.test(code)) {
    throw new HttpError(400, 'Use de 2 a 4 letras ou números para a sigla.');
  }
  if (typeof color !== 'string' || !/^#[a-f\d]{6}$/i.test(color)) {
    throw new HttpError(400, 'Escolha uma cor válida para o clube.');
  }
  return { name, code, color };
}

// Campos opcionais omitidos por clientes antigos permanecem inalterados no PATCH.
function rosterField(field, value) {
  if (value === null) return null;
  if (field === 'catalog_id') {
    if (typeof value !== 'string' || value.length > 80 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)) {
      throw new HttpError(400, 'Escolha um clube válido no catálogo.');
    }
    return value;
  }
  if (typeof value !== 'string') throw new HttpError(400, 'Informe um nome de jogador válido.');
  const name = value.trim().replace(/\s+/gu, ' ');
  if ([...name].length > 60 || /[\u0000-\u001f\u007f]/u.test(name)) {
    throw new HttpError(400, 'O nome do jogador pode ter até 60 caracteres.');
  }
  return name || null;
}

function resultFields(data) {
  const { home_score, away_score, played_on } = data ?? {};
  validateScores(home_score, away_score);
  if (typeof played_on !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(played_on) || played_on.startsWith('0000')) {
    throw new HttpError(400, 'Informe uma data válida.');
  }
  const date = new Date(played_on + 'T00:00:00Z');
  if (Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== played_on) {
    throw new HttpError(400, 'Informe uma data válida.');
  }
  return { home_score, away_score, played_on };
}

export function validateRecord(table, data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new HttpError(400, 'Envie os dados em um objeto JSON.');
  }
  const id = uuid(data.id);
  if (table === 'teams') {
    const record = { id, ...teamFields(data.name, data.code, data.color) };
    for (const field of ['catalog_id', 'player_name']) {
      if (Object.hasOwn(data, field)) record[field] = rosterField(field, data[field]);
    }
    return record;
  }
  const home_id = uuid(data.home_id);
  const away_id = uuid(data.away_id);
  if (home_id === away_id) throw new HttpError(400, 'Escolha dois clubes diferentes.');
  return { id, home_id, away_id, ...resultFields(data) };
}

function isLegacyAnonKey(key) {
  if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(key)) return false;
  try {
    // Decide se a chave configurada pode ser enviada ao navegador. O gateway verifica a assinatura.
    const payload = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString('utf8'));
    return payload.role === 'anon' && !payload.sub;
  } catch {
    return false;
  }
}

export function publicConfig(env) {
  const rawUrl = env.SUPABASE_URL?.trim() || env.SUPABASE_PUBLIC_URL?.trim();
  const key = env.SUPABASE_PUBLISHABLE_KEY?.trim() || env.SUPABASE_ANON_KEY?.trim() || env.ANON_KEY?.trim();
  if (!rawUrl && !key) return { url: null, key: null };
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error('Configure SUPABASE_URL ou SUPABASE_PUBLIC_URL com a URL pública da API do Supabase.');
  }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/' ||
      (url.protocol !== 'https:' && !(local && url.protocol === 'http:'))) {
    throw new Error('SUPABASE_URL precisa apontar para a origem HTTPS do projeto ou para o Supabase local.');
  }
  if (!key || !(key.startsWith('sb_publishable_') || isLegacyAnonKey(key))) {
    throw new Error('Use a chave publicável do Supabase ou a ANON_KEY legada com papel anon.');
  }
  return { url: url.origin, key };
}

export function leagueClient(config, authorization, fetchImpl = fetch) {
  if (!/^Bearer [^\s,]+$/i.test(authorization || '')) {
    throw new HttpError(401, 'Entre na sua conta para acessar o campeonato.');
  }
  if (!config.url) throw new HttpError(503, 'Configure o Supabase para usar sua conta.');

  async function request(path, method = 'GET', body) {
    let response;
    let data;
    try {
      response = await fetchImpl(config.url + '/rest/v1/' + path, {
        method,
        headers: {
          apikey: config.key,
          Authorization: authorization,
          'Content-Type': 'application/json',
          Prefer: 'return=representation',
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        redirect: 'error',
        signal: AbortSignal.timeout(12000),
      });
      data = response.status === 204 ? null : await response.json();
    } catch {
      throw new HttpError(502, 'Não foi possível consultar o Supabase. Tente novamente.');
    }
    if (response.ok) return data;
    if (response.status === 401 || response.status === 403) {
      throw new HttpError(response.status, 'Sua sessão não permite esta ação. Entre novamente.');
    }
    if (response.status === 429) throw new HttpError(429, 'Muitas solicitações. Aguarde um instante.');
    if (['PT400', 'PT404', 'PT409'].includes(data?.code)) {
      throw new HttpError(Number(data.code.slice(2)), data.message);
    }
    if (data?.code === '23505') {
      if (data.message?.includes('teams_player_per_owner')) throw new HttpError(409, 'Este jogador já está vinculado a um clube.');
      if (data.message?.includes('teams_catalog_per_owner')) throw new HttpError(409, 'Este clube do catálogo já está na liga.');
      throw new HttpError(409, 'Já existe um registro com este nome ou identificador.');
    }
    if (data?.code === '23503') throw new HttpError(400, 'Selecione clubes do seu campeonato.');
    if (data?.code === '23514') throw new HttpError(400, 'Confira os dados informados.');
    throw new HttpError(502, 'O Supabase não conseguiu concluir a operação. Verifique a configuração da liga.');
  }

  // A condição no PATCH protege contra alterações simultâneas. A leitura extra
  // distingue uma tentativa repetida de um registro removido ou já modificado.
  async function update(table, id, previous, fields) {
    const path = table + '?select=' + columns[table] + '&id=eq.' + uuid(id);
    const conditions = new URLSearchParams();
    for (const [name, value] of Object.entries(previous)) conditions.set(name, value === null ? 'is.null' : 'eq.' + value);
    const [updated] = await request(path + '&' + conditions, 'PATCH', fields);
    if (updated) return updated;

    const [current] = await request(path);
    if (!current) throw new HttpError(404, table === 'teams' ? 'Clube não encontrado.' : 'Partida não encontrada.');
    if (Object.keys(fields).every(field => current[field] === fields[field])) return current;
    throw new HttpError(409, table === 'teams'
      ? 'O clube mudou. Confira os dados atuais antes de editar.'
      : 'O placar mudou. Atualize a partida antes de corrigir o resultado.');
  }

  return {
    getLeague: () => request('rpc/futtable_league', 'POST', {}),
    async add(table, data) {
      const record = validateRecord(table, data);
      const path = table + '?select=' + columns[table];
      try {
        const [inserted] = await request(path, 'POST', record);
        return inserted;
      } catch (error) {
        if (error.status !== 409) throw error;
        // A resposta da primeira tentativa pode ter se perdido após o commit.
        const [existing] = await request(path + '&id=eq.' + record.id);
        if (existing && Object.keys(record).every(field => existing[field] === record[field])) {
          return existing;
        }
        throw error;
      }
    },
    createDraw(data) {
      const args = { request_id: uuid(data?.id) };
      if (Object.hasOwn(data, 'team_ids')) {
        if (!Array.isArray(data.team_ids) || data.team_ids.length < 2) {
          throw new HttpError(400, 'Selecione pelo menos dois clubes com jogador.');
        }
        args.team_ids = data.team_ids.map(uuid);
        if (new Set(args.team_ids).size !== args.team_ids.length) {
          throw new HttpError(400, 'Cada clube só pode participar uma vez por rodada.');
        }
      }
      return request('rpc/futtable_draw', 'POST', args);
    },
    finishMatch(id, data) {
      const { home_score, away_score, played_on } = resultFields(data);
      return request('rpc/futtable_finish_match', 'POST', {
        match_id: uuid(id), goals_home: home_score, goals_away: away_score, game_date: played_on,
      });
    },
    updateScore(id, data) {
      const { home_score, away_score, previous_home_score, previous_away_score } = data ?? {};
      validateScores(home_score, away_score, previous_home_score, previous_away_score);
      return update('matches', id, { home_score: previous_home_score, away_score: previous_away_score }, { home_score, away_score });
    },
    updateTeam(id, data) {
      const { name, code, color, previous_name, previous_code, previous_color } = data ?? {};
      const previous = teamFields(previous_name, previous_code, previous_color);
      const next = teamFields(name, code, color);
      for (const field of ['catalog_id', 'player_name']) {
        if (!Object.hasOwn(data, field)) continue;
        if (!Object.hasOwn(data, 'previous_' + field)) throw new HttpError(400, 'Confira os dados anteriores do clube.');
        previous[field] = rosterField(field, data['previous_' + field]);
        next[field] = rosterField(field, data[field]);
      }
      return update('teams', id, previous, next);
    },
    async removeTeam(id, data) {
      const matchCount = data?.match_count;
      if (!Number.isSafeInteger(matchCount) || matchCount < 0) {
        throw new HttpError(400, 'Confirme a quantidade de partidas vinculadas ao clube.');
      }
      const result = await request('rpc/futtable_remove_team', 'POST', { team_id: uuid(id), expected_matches: matchCount });
      if (result === 'conflict') throw new HttpError(409, 'As partidas deste clube mudaram. Confira a quantidade antes de excluir.');
      if (result !== 'removed' && result !== 'absent') throw new HttpError(502, 'Não foi possível confirmar a exclusão do clube.');
    },
    removeMatch: id => request('matches?select=id&id=eq.' + uuid(id), 'DELETE'),
  };
}
