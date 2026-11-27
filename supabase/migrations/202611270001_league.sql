begin;

create table public.teams (
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  name text not null check (
    char_length(name) between 2 and 60 and
    name = btrim(regexp_replace(name, '[[:space:]]+', ' ', 'g')) and
    name !~ '[[:cntrl:]]'
  ),
  code text not null check (code ~ '^[A-Z0-9]{2,4}$'),
  color text not null check (color ~ '^#[[:xdigit:]]{6}$'),
  primary key (owner_id, id)
);

create unique index teams_name_per_owner on public.teams (owner_id, lower(name));

create table public.matches (
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  home_id uuid not null,
  away_id uuid not null,
  home_score smallint not null check (home_score between 0 and 99),
  away_score smallint not null check (away_score between 0 and 99),
  played_on date not null check (played_on between date '0001-01-01' and date '9999-12-31'),
  primary key (owner_id, id),
  check (home_id <> away_id),
  foreign key (owner_id, home_id) references public.teams(owner_id, id),
  foreign key (owner_id, away_id) references public.teams(owner_id, id)
);

alter table public.teams enable row level security;
alter table public.matches enable row level security;

revoke all on public.teams, public.matches from public, anon, authenticated;
grant select, insert (id, name, code, color) on public.teams to authenticated;
grant select, delete, update (home_score, away_score), insert (id, home_id, away_id, home_score, away_score, played_on)
  on public.matches to authenticated;

create policy teams_read on public.teams for select to authenticated using (owner_id = (select auth.uid()));
create policy teams_add on public.teams for insert to authenticated with check (owner_id = (select auth.uid()));
create policy matches_read on public.matches for select to authenticated using (owner_id = (select auth.uid()));
create policy matches_add on public.matches for insert to authenticated with check (owner_id = (select auth.uid()));
create policy matches_correct on public.matches for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy matches_remove on public.matches for delete to authenticated using (owner_id = (select auth.uid()));

-- Uma leitura consistente do campeonato. O banco aplica as políticas da conta
-- que chamou a função, inclusive quando ela é chamada diretamente pela Data API.
create function public.futtable_league()
returns jsonb
language sql stable security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'teams', coalesce((
      select jsonb_agg(to_jsonb(t) - 'owner_id' order by t.name, t.id)
      from public.teams as t
    ), '[]'::jsonb),
    'matches', coalesce((
      select jsonb_agg(to_jsonb(m) - 'owner_id' order by m.played_on desc, m.id)
      from public.matches as m
    ), '[]'::jsonb)
  );
$$;

revoke all on function public.futtable_league() from public, anon, authenticated;
grant execute on function public.futtable_league() to authenticated;

commit;
