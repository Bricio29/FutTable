begin;

-- A RPC também pode ser chamada diretamente pelo Supabase. Somente estes clubes
-- podem entrar no sorteio e os dados usados na criação são os do catálogo.
create table public.club_draw_catalog (
  id text primary key,
  name text not null unique,
  code text not null,
  color text not null
);
revoke all on public.club_draw_catalog from public, anon, authenticated;
alter table public.club_draw_catalog enable row level security;
insert into public.club_draw_catalog (id, name, code, color) values
  ('real-madrid', 'Real Madrid', 'RMA', '#59499E'),
  ('barcelona', 'FC Barcelona', 'BAR', '#A50044'),
  ('arsenal', 'Arsenal', 'ARS', '#B91C35'),
  ('psg', 'Paris Saint-Germain', 'PSG', '#12376D'),
  ('bayern-munchen', 'Bayern München', 'FCB', '#B71936'),
  ('manchester-city', 'Manchester City', 'MCI', '#377BA3'),
  ('arsenal-w', 'Arsenal (W)', 'ARSW', '#B91C35'),
  ('chelsea-w', 'Chelsea (W)', 'CHEW', '#124294'),
  ('ol-lyonnes-w', 'OL Lyonnes (W)', 'OLW', '#23478A'),
  ('atletico-madrid', 'Atlético de Madrid', 'ATM', '#AF233B'),
  ('liverpool', 'Liverpool', 'LIV', '#AE132E'),
  ('barcelona-w', 'FC Barcelona (W)', 'BARW', '#A50044'),
  ('manchester-city-w', 'Manchester City (W)', 'MCIW', '#377BA3'),
  ('bayern-munchen-w', 'Bayern München (W)', 'FCBW', '#B71936'),
  ('manchester-united', 'Manchester United', 'MUN', '#AE1D2A'),
  ('inter', 'Inter', 'INT', '#2048A0'),
  ('borussia-dortmund', 'Borussia Dortmund', 'BVB', '#806600'),
  ('napoli', 'Napoli', 'NAP', '#197B9B'),
  ('manchester-united-w', 'Manchester United (W)', 'MUNW', '#AE1D2A'),
  ('chelsea', 'Chelsea', 'CHE', '#124294'),
  ('london-city-lionesses-w', 'London City Lionesses (W)', 'LCL', '#336D82'),
  ('real-madrid-w', 'Real Madrid (W)', 'RMAW', '#59499E'),
  ('tottenham', 'Tottenham Hotspur', 'TOT', '#253254'),
  ('milano-fc', 'Milano FC', 'MIL', '#9C243D'),
  ('gotham-fc-w', 'Gotham FC (W)', 'GFC', '#397690'),
  ('roma', 'Roma', 'ROM', '#882839'),
  ('juventus', 'Juventus', 'JUV', '#333542'),
  ('psg-w', 'Paris Saint-Germain (W)', 'PSGW', '#12376D'),
  ('bayer-leverkusen', 'Bayer 04 Leverkusen', 'B04', '#AF1D34'),
  ('fenerbahce', 'Fenerbahçe', 'FEN', '#203F6B'),
  ('atletico-madrid-w', 'Atlético de Madrid (W)', 'ATMW', '#AF233B'),
  ('galatasaray', 'Galatasaray', 'GAL', '#9E293B'),
  ('athletic-bilbao', 'Athletic Club de Bilbao', 'ATH', '#A42D40'),
  ('villarreal', 'Villarreal CF', 'VIL', '#80641F'),
  ('porto', 'FC Porto', 'FCP', '#28518B'),
  ('kansas-city-current-w', 'Kansas City Current (W)', 'KCC', '#13716F'),
  ('real-betis', 'Real Betis Balompié', 'BET', '#147247'),
  ('newcastle', 'Newcastle United', 'NEW', '#343C48'),
  ('rb-leipzig', 'RB Leipzig', 'RBL', '#AA2845'),
  ('sunderland', 'Sunderland', 'SUN', '#A6283B'),
  ('crystal-palace', 'Crystal Palace', 'CRY', '#244C8F'),
  ('washington-spirit-w', 'Washington Spirit (W)', 'WAS', '#363943'),
  ('nottingham-forest', 'Nottingham Forest', 'NFO', '#AC273D'),
  ('aston-villa', 'Aston Villa', 'AVL', '#752B4D'),
  ('atalanta', 'Atalanta', 'ATA', '#255192'),
  ('wolfsburg-w', 'VfL Wolfsburg (W)', 'WOBW', '#397A35'),
  ('real-sociedad', 'Real Sociedad', 'RSO', '#275F96'),
  ('portland-thorns-w', 'Portland Thorns FC (W)', 'PTFC', '#9C2937'),
  ('benfica', 'Benfica', 'SLB', '#A82539'),
  ('san-diego-wave-w', 'San Diego Wave FC (W)', 'SDW', '#8F3B70');

create table public.club_draw_requests (
  owner_id uuid not null references auth.users(id) on delete cascade,
  id uuid not null,
  player_keys text[] not null,
  catalog_ids text[] not null,
  result jsonb not null,
  primary key (owner_id, id)
);
alter table public.club_draw_requests enable row level security;
revoke all on public.club_draw_requests from public, anon, authenticated;

create function public.futtable_club_draw(request_id uuid, player_names text[], catalog_ids text[])
returns jsonb
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  selected_ids text[];
  selected_teams uuid[];
  names text[];
  name_keys text[];
  previous public.club_draw_requests;
  conflict_team public.teams;
  result jsonb;
begin
  if caller is null or request_id is null then
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
  perform pg_advisory_xact_lock(hashtextextended(caller::text, 0));
  select r.* into previous from public.club_draw_requests r where r.owner_id = caller and r.id = request_id;
  if found then
    if previous.player_keys <> name_keys or previous.catalog_ids <> selected_ids then
      raise exception 'Este sorteio já foi salvo com outros jogadores ou clubes.' using errcode = 'PT409';
    end if;
    return previous.result;
  end if;

  -- Atribuir a chave de catálogo ao clube antigo mantém seu ID, aparência e partidas.
  update public.teams t set catalog_id = c.id
    from public.club_draw_catalog c where t.owner_id = caller and t.catalog_id is null
      and c.id = any(selected_ids) and lower(t.name) = lower(c.name)
      and not exists (select 1 from public.teams saved where saved.owner_id = caller and saved.catalog_id = c.id);

  insert into public.teams (owner_id, name, code, color, catalog_id)
    select caller, c.name, c.code, c.color, c.id from public.club_draw_catalog c
    where c.id = any(selected_ids) and not exists (
      select 1 from public.teams t where t.owner_id = caller and t.catalog_id = c.id
    ) order by c.id;

  select array_agg(s.id) into selected_teams from (
    select t.id from public.teams t where t.owner_id = caller and t.catalog_id = any(selected_ids)
    order by t.id for update
  ) s;
  if cardinality(selected_teams) is distinct from cardinality(selected_ids) then
    raise exception 'Os clubes mudaram durante o sorteio. Confira a seleção e tente novamente.' using errcode = 'PT409';
  end if;
  select t.* into conflict_team from public.teams t where t.owner_id = caller and t.player_name is not null
    and ((t.id = any(selected_teams)) <> (lower(t.player_name) = any(name_keys)))
    order by t.id limit 1;
  if found then
    raise exception '% já joga com %. Inclua os dois no sorteio ou edite o vínculo em Clubes.',
      conflict_team.player_name, conflict_team.name using errcode = 'PT409';
  end if;

  -- Libera apenas os pares selecionados antes das trocas para respeitar o índice único de jogador.
  update public.teams t set player_name = null where t.owner_id = caller and t.id = any(selected_teams) and t.player_name is not null;
  with shuffled as (
    select t.id, row_number() over (order by random(), t.id) as position
    from public.teams t where t.owner_id = caller and t.id = any(selected_teams)
  ), assigned as (
    update public.teams t set player_name = names[s.position]
    from shuffled s where t.owner_id = caller and t.id = s.id
    returning t.id, t.name, t.code, t.color, t.catalog_id, t.player_name
  )
  select jsonb_build_object('teams', jsonb_agg(to_jsonb(a) order by lower(a.player_name))) into result from assigned a;
  insert into public.club_draw_requests (owner_id, id, player_keys, catalog_ids, result)
    values (caller, request_id, name_keys, selected_ids, result);
  return result;
exception when unique_violation then
  raise exception 'Um jogador ou clube já está vinculado. Confira os cadastros e tente novamente.' using errcode = 'PT409';
end;
$$;

revoke all on function public.futtable_club_draw(uuid, text[], text[]) from public, anon, authenticated;
grant execute on function public.futtable_club_draw(uuid, text[], text[]) to authenticated;
notify pgrst, 'reload schema';
commit;
