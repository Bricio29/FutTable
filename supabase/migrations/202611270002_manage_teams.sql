begin;

grant update (name, code, color), delete on public.teams to authenticated;
create policy teams_edit on public.teams for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy teams_remove on public.teams for delete to authenticated
  using (owner_id = (select auth.uid()));

alter table public.matches
  drop constraint matches_owner_id_home_id_fkey,
  drop constraint matches_owner_id_away_id_fkey,
  add constraint matches_owner_id_home_id_fkey foreign key (owner_id, home_id)
    references public.teams(owner_id, id) on delete cascade,
  add constraint matches_owner_id_away_id_fkey foreign key (owner_id, away_id)
    references public.teams(owner_id, id) on delete cascade;

create function public.futtable_remove_team(team_id uuid, expected_matches bigint)
returns text
language plpgsql volatile security invoker
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  actual_matches bigint;
begin
  -- Novas partidas que referenciem o clube aguardam esta transação.
  perform 1 from public.teams as t
    where t.owner_id = caller and t.id = team_id for update;
  if not found then
    return 'absent';
  end if;

  select count(*) into actual_matches from public.matches as m
    where m.owner_id = caller and (m.home_id = team_id or m.away_id = team_id);
  if actual_matches is distinct from expected_matches then
    return 'conflict';
  end if;

  delete from public.teams as t where t.owner_id = caller and t.id = team_id;
  return 'removed';
end;
$$;

revoke all on function public.futtable_remove_team(uuid, bigint) from public, anon, authenticated;
grant execute on function public.futtable_remove_team(uuid, bigint) to authenticated;
notify pgrst, 'reload schema';

commit;
