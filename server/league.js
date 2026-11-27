const UUID = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;
const columns = {
  teams: 'id,name,code,color',
  matches: 'id,home_id,away_id,home_score,away_score,played_on',
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

export function validateRecord(table, data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new HttpError(400, 'Envie os dados em um objeto JSON.');
  }
  const id = uuid(data.id);
  if (table === 'teams') return { id, ...teamFields(data.name, data.code, data.color) };
  const home_id = uuid(data.home_id);
  const away_id = uuid(data.away_id);
  if (home_id === away_id) throw new HttpError(400, 'Escolha dois clubes diferentes.');
  validateScores(data.home_score, data.away_score);
  const day = data.played_on;
  if (typeof day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day) || day.startsWith('0000')) {
    throw new HttpError(400, 'Informe uma data válida.');
  }
  const date = new Date(day + 'T00:00:00Z');
  if (Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== day) {
    throw new HttpError(400, 'Informe uma data válida.');
  }
  return { id, home_id, away_id, home_score: data.home_score, away_score: data.away_score, played_on: day };
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
    if (data?.code === '23505') {
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
    for (const [name, value] of Object.entries(previous)) conditions.set(name, 'eq.' + value);
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
    updateScore(id, data) {
      const { home_score, away_score, previous_home_score, previous_away_score } = data ?? {};
      validateScores(home_score, away_score, previous_home_score, previous_away_score);
      return update('matches', id, { home_score: previous_home_score, away_score: previous_away_score }, { home_score, away_score });
    },
    updateTeam(id, data) {
      const { name, code, color, previous_name, previous_code, previous_color } = data ?? {};
      return update('teams', id, teamFields(previous_name, previous_code, previous_color), teamFields(name, code, color));
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
