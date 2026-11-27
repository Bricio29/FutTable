begin;

alter table public.teams
  add column catalog_id text check (char_length(catalog_id) <= 80 and catalog_id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  add column player_name text check (
    char_length(player_name) between 1 and 60 and
    player_name = btrim(regexp_replace(player_name, '[[:space:]]+', ' ', 'g')) and
    player_name !~ '[[:cntrl:]]'
  );

create unique index teams_player_per_owner on public.teams(owner_id, lower(player_name)) where player_name is not null;
create unique index teams_catalog_per_owner on public.teams(owner_id, catalog_id) where catalog_id is not null;
grant insert (catalog_id, player_name), update (catalog_id, player_name) on public.teams to authenticated;

create table public.draws (
  owner_id uuid not null references auth.users(id) on delete cascade,
  id uuid not null,
  number integer not null check (number >= 1),
  created_at timestamptz not null default now(),
  requested_team_ids uuid[],
  bye_team_id uuid,
  bye_team_name text,
  bye_player_name text,
  bye_catalog_id text,
  primary key (owner_id, id),
  unique (owner_id, number),
  foreign key (owner_id, bye_team_id) references public.teams(owner_id, id) on delete set null (bye_team_id)
);

alter table public.draws enable row level security;
revoke all on public.draws from public, anon, authenticated;
grant select on public.draws to authenticated;
create policy draws_read on public.draws for select to authenticated using (owner_id = (select auth.uid()));

alter table public.matches
  add column draw_id uuid,
  add column home_player_name text,
  add column away_player_name text,
  add column home_team_name text,
  add column away_team_name text,
  add column home_catalog_id text,
  add column away_catalog_id text,
  alter column played_on drop not null,
  alter column home_score drop not null,
  alter column away_score drop not null,
  add foreign key (owner_id, draw_id) references public.draws(owner_id, id) on delete cascade,
  add constraint matches_result_complete check (
    (played_on is not null and home_score is not null and away_score is not null)
    or (draw_id is not null and played_on is null and home_score is null and away_score is null)
  );
create index matches_draw on public.matches(owner_id, draw_id) where draw_id is not null;

create or replace function public.futtable_league()
returns jsonb
language sql stable security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'teams', coalesce((select jsonb_agg(to_jsonb(t) - 'owner_id' order by t.name, t.id) from public.teams as t), '[]'::jsonb),
    'matches', coalesce((select jsonb_agg(to_jsonb(m) - 'owner_id' order by m.played_on desc nulls last, m.id) from public.matches as m), '[]'::jsonb),
    'draws', coalesce((select jsonb_agg(to_jsonb(d) - 'owner_id' - 'requested_team_ids' order by d.number desc) from public.draws as d), '[]'::jsonb)
  );
$$;

-- Somente estas duas funções podem criar jogos pendentes ou dar baixa no seu resultado.
-- Usam a conta da sessão em cada acesso, inclusive nas leituras feitas após uma repetição.
create function public.futtable_draw(request_id uuid, team_ids uuid[] default null)
returns jsonb
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  selected_ids uuid[];
  roster uuid[];
  count_teams integer;
  new_number integer;
  bye public.teams;
  round_row public.draws;
begin
  if caller is null or request_id is null then raise exception 'Sessão ou sorteio inválido.' using errcode = 'PT400'; end if;
  if team_ids is not null then
    select array_agg(distinct id order by id) into selected_ids from unnest(team_ids) as s(id) where id is not null;
    if array_ndims(team_ids) <> 1 or cardinality(team_ids) < 2 or cardinality(selected_ids) is distinct from cardinality(team_ids) then
      raise exception 'Selecione pelo menos dois clubes distintos com jogador.' using errcode = 'PT400';
    end if;
  end if;
  perform pg_advisory_xact_lock(hashtextextended(caller::text, 0));
  select * into round_row from public.draws where owner_id = caller and id = request_id;
  if found then
    if round_row.requested_team_ids is distinct from selected_ids then
      raise exception 'Este sorteio já foi feito com outra seleção de participantes.' using errcode = 'PT409';
    end if;
  else
    -- Bloqueia os clubes em uma ordem estável antes de sortear, preservando a escalação.
    select array_agg(t.id order by random()) into roster
      from (select id from public.teams where owner_id = caller and player_name is not null
            and (selected_ids is null or id = any(selected_ids)) order by id for share) as t;
    count_teams := coalesce(cardinality(roster), 0);
    if selected_ids is not null and count_teams <> cardinality(selected_ids) then
      raise exception 'A seleção de jogadores mudou. Atualize a liga e confira os participantes.' using errcode = 'PT409';
    end if;
    if count_teams < 2 then raise exception 'Vincule pelo menos dois jogadores aos clubes para sortear.' using errcode = 'PT400'; end if;
    select coalesce(max(number), 0) + 1 into new_number from public.draws where owner_id = caller;
    if count_teams % 2 = 1 then
      select * into bye from public.teams where owner_id = caller and id = roster[count_teams];
    end if;

    insert into public.draws (owner_id, id, number, requested_team_ids, bye_team_id, bye_team_name, bye_player_name, bye_catalog_id)
      values (caller, request_id, new_number, selected_ids, bye.id, bye.name, bye.player_name, bye.catalog_id)
      returning * into round_row;
    insert into public.matches (owner_id, draw_id, home_id, away_id, home_team_name, away_team_name,
                                home_player_name, away_player_name, home_catalog_id, away_catalog_id)
      select caller, request_id, h.id, a.id, h.name, a.name, h.player_name, a.player_name, h.catalog_id, a.catalog_id
      from generate_series(1, count_teams - 1, 2) as p(i)
      join public.teams h on h.owner_id = caller and h.id = roster[p.i]
      join public.teams a on a.owner_id = caller and a.id = roster[p.i + 1];
  end if;
  return jsonb_build_object(
    'draw', to_jsonb(round_row) - 'owner_id' - 'requested_team_ids',
    'matches', coalesce((select jsonb_agg(to_jsonb(m) - 'owner_id' order by m.id) from public.matches m
                         where m.owner_id = caller and m.draw_id = request_id), '[]'::jsonb)
  );
end;
$$;

create function public.futtable_finish_match(match_id uuid, goals_home integer, goals_away integer, game_date date)
returns jsonb
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  game public.matches;
begin
  if caller is null or match_id is null or goals_home is null or goals_away is null or game_date is null or
     goals_home not between 0 and 99 or goals_away not between 0 and 99 or
     game_date not between date '0001-01-01' and date '9999-12-31' then
    raise exception 'Confira os gols e a data da partida.' using errcode = 'PT400';
  end if;
  select * into game from public.matches where owner_id = caller and id = match_id for update;
  if not found then raise exception 'Partida não encontrada.' using errcode = 'PT404'; end if;
  if game.draw_id is null then raise exception 'Esta partida não pertence a um sorteio.' using errcode = 'PT409'; end if;
  if game.home_score is null then
    update public.matches set home_score = goals_home, away_score = goals_away, played_on = game_date
      where owner_id = caller and id = match_id returning * into game;
  elsif game.home_score <> goals_home or game.away_score <> goals_away or game.played_on <> game_date then
    raise exception 'A partida já tem outro resultado. Confira o placar atual.' using errcode = 'PT409';
  end if;
  return to_jsonb(game) - 'owner_id';
end;
$$;

revoke all on function public.futtable_draw(uuid, uuid[]), public.futtable_finish_match(uuid, integer, integer, date) from public, anon, authenticated;
grant execute on function public.futtable_draw(uuid, uuid[]), public.futtable_finish_match(uuid, integer, integer, date) to authenticated;
notify pgrst, 'reload schema';

commit;
