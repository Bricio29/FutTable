begin;

-- O ID da liga original coincide com o antigo owner_id. Os registros e todas as
-- referências compostas existentes são reaproveitados sem regravar o histórico.
create table public.leagues (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (
    char_length(name) between 1 and 60 and name !~ '[[:cntrl:]]' and
    name = btrim(regexp_replace(name, '[[:space:]]+', ' ', 'g'))
  ),
  created_at timestamptz not null default now(),
  request_id uuid,
  requested_name text,
  unique (owner_id, request_id),
  check ((request_id is null) = (requested_name is null))
);

alter table public.leagues enable row level security;
revoke all on public.leagues from public, anon, authenticated;
grant select (id, name, owner_id, created_at) on public.leagues to authenticated;
create policy leagues_read on public.leagues for select to authenticated using (owner_id = (select auth.uid()));

create function public.futtable_default_league()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.leagues(id, owner_id, name) values (new.id, new.id, 'Minha liga');
  return new;
end;
$$;
revoke all on function public.futtable_default_league() from public, anon, authenticated;
create trigger futtable_new_user_league after insert on auth.users
  for each row execute function public.futtable_default_league();
insert into public.leagues(id, owner_id, name) select id, id, 'Minha liga' from auth.users;

create function public.futtable_active_league()
returns uuid language plpgsql stable security definer set search_path = ''
as $$
declare
  account_id uuid := auth.uid();
  headers jsonb := nullif(current_setting('request.headers', true), '')::jsonb;
  supplied_id text;
  scope_id uuid := account_id;
begin
  if account_id is null then
    raise exception 'Entre na sua conta para acessar a liga.' using errcode = 'PT401';
  end if;
  if headers ? 'x-futtable-league' then
    supplied_id := headers->>'x-futtable-league';
    if supplied_id is null or supplied_id !~* '^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$' then
      raise exception 'Identificador de liga inválido.' using errcode = 'PT400';
    end if;
    scope_id := supplied_id::uuid;
  end if;
  if not exists (select 1 from public.leagues l where l.id = scope_id and l.owner_id = account_id) then
    raise exception 'Liga não encontrada.' using errcode = 'PT404';
  end if;
  return scope_id;
end;
$$;
revoke all on function public.futtable_active_league() from public, anon, authenticated;
grant execute on function public.futtable_active_league() to authenticated;

alter table public.teams rename column owner_id to league_id;
alter table public.matches rename column owner_id to league_id;
alter table public.draws rename column owner_id to league_id;
alter table public.club_draw_requests rename column owner_id to league_id;

alter table public.teams drop constraint teams_owner_id_fkey,
  add foreign key (league_id) references public.leagues(id) on delete cascade,
  alter column league_id set default public.futtable_active_league();
alter table public.matches drop constraint matches_owner_id_fkey,
  add foreign key (league_id) references public.leagues(id) on delete cascade,
  alter column league_id set default public.futtable_active_league();
alter table public.draws drop constraint draws_owner_id_fkey,
  add foreign key (league_id) references public.leagues(id) on delete cascade;
alter table public.club_draw_requests drop constraint club_draw_requests_owner_id_fkey,
  add foreign key (league_id) references public.leagues(id) on delete cascade;

-- O PostgREST aplica o mesmo escopo nas leituras e nas alterações diretas.
-- As chaves (league_id, id) também impedem referências a um clube de outra liga.
alter policy teams_read on public.teams using (league_id = (select public.futtable_active_league()));
alter policy teams_add on public.teams with check (league_id = (select public.futtable_active_league()));
alter policy teams_edit on public.teams using (league_id = (select public.futtable_active_league()))
  with check (league_id = (select public.futtable_active_league()));
alter policy teams_remove on public.teams using (league_id = (select public.futtable_active_league()));
alter policy matches_read on public.matches using (league_id = (select public.futtable_active_league()));
alter policy matches_add on public.matches with check (league_id = (select public.futtable_active_league()));
alter policy matches_correct on public.matches using (league_id = (select public.futtable_active_league()))
  with check (league_id = (select public.futtable_active_league()));
alter policy matches_remove on public.matches using (league_id = (select public.futtable_active_league()));
alter policy draws_read on public.draws using (league_id = (select public.futtable_active_league()));

create function public.futtable_list_leagues()
returns jsonb language sql stable security invoker set search_path = ''
as $$
  select jsonb_build_object('leagues', coalesce(jsonb_agg(
    jsonb_build_object('id', l.id, 'name', l.name, 'created_at', l.created_at)
    order by (l.id = auth.uid()) desc, l.created_at, l.id), '[]'::jsonb))
  from public.leagues l where l.owner_id = auth.uid();
$$;

create function public.futtable_create_league(request_id uuid, league_name text)
returns jsonb language plpgsql volatile security definer set search_path = ''
as $$
declare
  account_id uuid := auth.uid();
  clean_name text := btrim(regexp_replace(league_name, '[[:space:]]+', ' ', 'g'));
  saved public.leagues;
begin
  if account_id is null then raise exception 'Sessão inválida.' using errcode = 'PT401'; end if;
  if request_id is null or clean_name is null or char_length(clean_name) not between 1 and 60 or clean_name ~ '[[:cntrl:]]' then
    raise exception 'Confira o identificador e o nome da liga (1 a 60 caracteres).' using errcode = 'PT400';
  end if;
  insert into public.leagues(owner_id, name, request_id, requested_name)
    values (account_id, clean_name, request_id, clean_name)
    on conflict on constraint leagues_owner_id_request_id_key do nothing returning * into saved;
  if not found then
    select l.* into strict saved from public.leagues l
      where l.owner_id = account_id and l.request_id = futtable_create_league.request_id;
    if saved.requested_name <> clean_name then
      raise exception 'Esta operação já criou uma liga com outro nome.' using errcode = 'PT409';
    end if;
  end if;
  return jsonb_build_object('id', saved.id, 'name', saved.name, 'created_at', saved.created_at);
end;
$$;

create function public.futtable_rename_league(league_name text, expected_name text)
returns jsonb language plpgsql volatile security definer set search_path = ''
as $$
declare
  scope_id uuid := public.futtable_active_league();
  clean_name text := btrim(regexp_replace(league_name, '[[:space:]]+', ' ', 'g'));
  actual_name text;
begin
  if clean_name is null or char_length(clean_name) not between 1 and 60 or clean_name ~ '[[:cntrl:]]' then
    raise exception 'Use de 1 a 60 caracteres no nome da liga.' using errcode = 'PT400';
  end if;
  select l.name into strict actual_name from public.leagues l where l.id = scope_id for update;
  if actual_name is distinct from clean_name then
    if actual_name is distinct from coalesce(expected_name, 'Minha liga') then
      raise exception 'O nome da liga mudou. Confira o nome atual.' using errcode = 'PT409';
    end if;
    update public.leagues set name = clean_name where id = scope_id;
  end if;
  return jsonb_build_object('name', clean_name);
end;
$$;

revoke all on function public.futtable_list_leagues(), public.futtable_create_league(uuid,text),
  public.futtable_rename_league(text,text) from public, anon, authenticated;
grant execute on function public.futtable_list_leagues(), public.futtable_create_league(uuid,text),
  public.futtable_rename_league(text,text) to authenticated;

create or replace function public.futtable_league()
returns jsonb language plpgsql stable security invoker set search_path = ''
as $$
declare
  scope_id uuid := public.futtable_active_league();
begin
  return jsonb_build_object(
    'league_id', scope_id,
    'league_name', (select l.name from public.leagues l where l.id = scope_id),
    'teams', coalesce((select jsonb_agg(to_jsonb(t) - 'league_id' order by t.name, t.id)
                       from public.teams t where t.league_id = scope_id), '[]'::jsonb),
    'matches', coalesce((select jsonb_agg(to_jsonb(m) - 'league_id' order by m.played_on desc nulls last, m.id)
                         from public.matches m where m.league_id = scope_id), '[]'::jsonb),
    'draws', coalesce((select jsonb_agg(to_jsonb(d) - 'league_id' - 'requested_team_ids' order by d.number desc)
                       from public.draws d where d.league_id = scope_id), '[]'::jsonb)
  );
end;
$$;

create or replace function public.futtable_remove_team(team_id uuid, expected_matches bigint)
returns text
language plpgsql volatile security invoker
set search_path = ''
as $$
declare
  scope_id uuid := public.futtable_active_league();
  actual_matches bigint;
begin
  -- Novas partidas que referenciem o clube aguardam esta transação.
  perform 1 from public.teams as t
    where t.league_id = scope_id and t.id = team_id for update;
  if not found then
    return 'absent';
  end if;

  select count(*) into actual_matches from public.matches as m
    where m.league_id = scope_id and (m.home_id = team_id or m.away_id = team_id);
  if actual_matches is distinct from expected_matches then
    return 'conflict';
  end if;

  delete from public.teams as t where t.league_id = scope_id and t.id = team_id;
  return 'removed';
end;
$$;

create or replace function public.futtable_draw(request_id uuid, team_ids uuid[] default null)
returns jsonb
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  scope_id uuid := public.futtable_active_league();
  selected_ids uuid[];
  roster uuid[];
  count_teams integer;
  new_number integer;
  bye public.teams;
  round_row public.draws;
begin
  if request_id is null then raise exception 'Sessão ou sorteio inválido.' using errcode = 'PT400'; end if;
  if team_ids is not null then
    select array_agg(distinct id order by id) into selected_ids from unnest(team_ids) as s(id) where id is not null;
    if array_ndims(team_ids) <> 1 or cardinality(team_ids) < 2 or cardinality(selected_ids) is distinct from cardinality(team_ids) then
      raise exception 'Selecione pelo menos dois clubes distintos com jogador.' using errcode = 'PT400';
    end if;
  end if;
  perform pg_advisory_xact_lock(hashtextextended(scope_id::text, 0));
  select * into round_row from public.draws where league_id = scope_id and id = request_id;
  if found then
    if round_row.requested_team_ids is distinct from selected_ids then
      raise exception 'Este sorteio já foi feito com outra seleção de participantes.' using errcode = 'PT409';
    end if;
  else
    -- Bloqueia os clubes em uma ordem estável antes de sortear, preservando a escalação.
    select array_agg(t.id order by random()) into roster
      from (select id from public.teams where league_id = scope_id and player_name is not null
            and (selected_ids is null or id = any(selected_ids)) order by id for share) as t;
    count_teams := coalesce(cardinality(roster), 0);
    if selected_ids is not null and count_teams <> cardinality(selected_ids) then
      raise exception 'A seleção de jogadores mudou. Atualize a liga e confira os participantes.' using errcode = 'PT409';
    end if;
    if count_teams < 2 then raise exception 'Vincule pelo menos dois jogadores aos clubes para sortear.' using errcode = 'PT400'; end if;
    select coalesce(max(number), 0) + 1 into new_number from public.draws where league_id = scope_id;
    if count_teams % 2 = 1 then
      select * into bye from public.teams where league_id = scope_id and id = roster[count_teams];
    end if;

    insert into public.draws (league_id, id, number, requested_team_ids, bye_team_id, bye_team_name, bye_player_name, bye_catalog_id)
      values (scope_id, request_id, new_number, selected_ids, bye.id, bye.name, bye.player_name, bye.catalog_id)
      returning * into round_row;
    insert into public.matches (league_id, draw_id, home_id, away_id, home_team_name, away_team_name,
                                home_player_name, away_player_name, home_catalog_id, away_catalog_id)
      select scope_id, request_id, h.id, a.id, h.name, a.name, h.player_name, a.player_name, h.catalog_id, a.catalog_id
      from generate_series(1, count_teams - 1, 2) as p(i)
      join public.teams h on h.league_id = scope_id and h.id = roster[p.i]
      join public.teams a on a.league_id = scope_id and a.id = roster[p.i + 1];
  end if;
  return jsonb_build_object(
    'draw', to_jsonb(round_row) - 'league_id' - 'requested_team_ids',
    'matches', coalesce((select jsonb_agg(to_jsonb(m) - 'league_id' order by m.id) from public.matches m
                         where m.league_id = scope_id and m.draw_id = request_id), '[]'::jsonb)
  );
end;
$$;

create or replace function public.futtable_finish_match(match_id uuid, goals_home integer, goals_away integer, game_date date)
returns jsonb
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  scope_id uuid := public.futtable_active_league();
  game public.matches;
begin
  if match_id is null or goals_home is null or goals_away is null or game_date is null or
     goals_home not between 0 and 99 or goals_away not between 0 and 99 or
     game_date not between date '0001-01-01' and date '9999-12-31' then
    raise exception 'Confira os gols e a data da partida.' using errcode = 'PT400';
  end if;
  select * into game from public.matches where league_id = scope_id and id = match_id for update;
  if not found then raise exception 'Partida não encontrada.' using errcode = 'PT404'; end if;
  if game.draw_id is null then raise exception 'Esta partida não pertence a um sorteio.' using errcode = 'PT409'; end if;
  if game.home_score is null then
    update public.matches set home_score = goals_home, away_score = goals_away, played_on = game_date
      where league_id = scope_id and id = match_id returning * into game;
  elsif game.home_score <> goals_home or game.away_score <> goals_away or game.played_on <> game_date then
    raise exception 'A partida já tem outro resultado. Confira o placar atual.' using errcode = 'PT409';
  end if;
  return to_jsonb(game) - 'league_id';
end;
$$;

create or replace function public.futtable_club_draw(request_id uuid, player_names text[], catalog_ids text[])
returns jsonb
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  scope_id uuid := public.futtable_active_league();
  selected_ids text[];
  selected_teams uuid[];
  names text[];
  name_keys text[];
  previous public.club_draw_requests;
  conflict_team public.teams;
  result jsonb;
begin
  if request_id is null then
    raise exception 'Sessão ou sorteio inválido.' using errcode = 'PT400';
  end if;
  if array_ndims(player_names) is distinct from 1 or array_ndims(catalog_ids) is distinct from 1
     or cardinality(player_names) not between 2 and 50 or cardinality(catalog_ids) <> cardinality(player_names) then
    raise exception 'Selecione de 2 a 50 jogadores e um clube para cada jogador.' using errcode = 'PT400';
  end if;
  select array_agg(name order by lower(name)), array_agg(distinct lower(name) order by lower(name))
    into names, name_keys
    from (select btrim(regexp_replace(value, '[[:space:]]+', ' ', 'g')) as name from unnest(player_names) as p(value)) p;
  if cardinality(names) <> cardinality(name_keys) or exists (
    select 1 from unnest(names) as p(name) where name is null or char_length(name) not between 1 and 60 or name ~ '[[:cntrl:]]'
  ) then
    raise exception 'Informe um nome diferente e válido para cada jogador.' using errcode = 'PT400';
  end if;
  select array_agg(c.id order by c.id) into selected_ids from public.club_draw_catalog c where c.id = any(catalog_ids);
  if cardinality(selected_ids) is distinct from cardinality(catalog_ids) then
    raise exception 'Escolha clubes distintos do catálogo.' using errcode = 'PT400';
  end if;

  -- O sorteio das partidas usa a mesma trava e sempre enxerga os vínculos completos.
  perform pg_advisory_xact_lock(hashtextextended(scope_id::text, 0));
  select r.* into previous from public.club_draw_requests r where r.league_id = scope_id and r.id = request_id;
  if found then
    if previous.player_keys <> name_keys or previous.catalog_ids <> selected_ids then
      raise exception 'Este sorteio já foi salvo com outros jogadores ou clubes.' using errcode = 'PT409';
    end if;
    return previous.result;
  end if;

  -- Atribuir a chave de catálogo ao clube antigo mantém seu ID, aparência e partidas.
  update public.teams t set catalog_id = c.id
    from public.club_draw_catalog c where t.league_id = scope_id and t.catalog_id is null
      and c.id = any(selected_ids) and lower(t.name) = lower(c.name)
      and not exists (select 1 from public.teams saved where saved.league_id = scope_id and saved.catalog_id = c.id);

  insert into public.teams (league_id, name, code, color, catalog_id)
    select scope_id, c.name, c.code, c.color, c.id from public.club_draw_catalog c
    where c.id = any(selected_ids) and not exists (
      select 1 from public.teams t where t.league_id = scope_id and t.catalog_id = c.id
    ) order by c.id;

  select array_agg(s.id) into selected_teams from (
    select t.id from public.teams t where t.league_id = scope_id and t.catalog_id = any(selected_ids)
    order by t.id for update
  ) s;
  if cardinality(selected_teams) is distinct from cardinality(selected_ids) then
    raise exception 'Os clubes mudaram durante o sorteio. Confira a seleção e tente novamente.' using errcode = 'PT409';
  end if;
  select t.* into conflict_team from public.teams t where t.league_id = scope_id and t.player_name is not null
    and ((t.id = any(selected_teams)) <> (lower(t.player_name) = any(name_keys)))
    order by t.id limit 1;
  if found then
    raise exception '% já joga com %. Inclua os dois no sorteio ou edite o vínculo em Clubes.',
      conflict_team.player_name, conflict_team.name using errcode = 'PT409';
  end if;

  -- Libera apenas os pares selecionados antes das trocas para respeitar o índice único de jogador.
  update public.teams t set player_name = null where t.league_id = scope_id and t.id = any(selected_teams) and t.player_name is not null;
  with shuffled as (
    select t.id, row_number() over (order by random(), t.id) as position
    from public.teams t where t.league_id = scope_id and t.id = any(selected_teams)
  ), assigned as (
    update public.teams t set player_name = names[s.position]
    from shuffled s where t.league_id = scope_id and t.id = s.id
    returning t.id, t.name, t.code, t.color, t.catalog_id, t.player_name
  )
  select jsonb_build_object('teams', jsonb_agg(to_jsonb(a) order by lower(a.player_name))) into result from assigned a;
  insert into public.club_draw_requests (league_id, id, player_keys, catalog_ids, result)
    values (scope_id, request_id, name_keys, selected_ids, result);
  return result;
exception when unique_violation then
  raise exception 'Um jogador ou clube já está vinculado. Confira os cadastros e tente novamente.' using errcode = 'PT409';
end;
$$;

notify pgrst, 'reload schema';
commit;
