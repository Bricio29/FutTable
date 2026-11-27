-- Executar no banco de teste com as migrações aplicadas.
begin;
select set_config('club_test.first', gen_random_uuid()::text, true),
       set_config('club_test.second', gen_random_uuid()::text, true),
       set_config('club_test.request', gen_random_uuid()::text, true);
insert into auth.users(id) values (current_setting('club_test.first')::uuid), (current_setting('club_test.second')::uuid);
set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('club_test.first'), true);
do $$
declare
  request_id uuid := current_setting('club_test.request')::uuid;
  clubs text[] := array['real-madrid','barcelona','arsenal'];
  players text[] := array['Bia','Leo','Ana Maria'];
  first_result jsonb;
  before_conflict jsonb;
  first_round jsonb;
  round_id uuid := gen_random_uuid();
  old_team uuid;
begin
  insert into public.teams (name, code, color, player_name)
    values ('Real madrid', 'RM', '#123456', 'Bia') returning id into old_team;
  insert into public.teams (name, code, color, player_name, catalog_id)
    values ('Barça', 'BA', '#aabbcc', 'Ana Maria', 'barcelona'), ('Meu clube', 'MC', '#111111', 'Lia', null);
  first_result := public.futtable_club_draw(request_id, array['Bia','Leo','  Ana  Maria '], clubs);
  if jsonb_array_length(first_result->'teams') <> 3 or (select count(*) from public.teams) <> 4 or
     not exists (select 1 from public.teams where id = old_team and catalog_id = 'real-madrid' and code = 'RM' and name = 'Real madrid') or
     not exists (select 1 from public.teams where catalog_id = 'barcelona' and name = 'Barça') or
     not exists (select 1 from public.teams where name = 'Arsenal' and catalog_id = 'arsenal' and code = 'ARS') or
     (select count(*) from public.teams where player_name = any(players) and catalog_id = any(clubs)) <> 3 then
    raise exception 'Clubes ausentes, duplicados ou alterados durante o sorteio';
  end if;
  if exists (
    select 1 from jsonb_array_elements(first_result->'teams') r
    where r ?| array['owner_id', 'league_id'] or not exists (select 1 from public.teams t where to_jsonb(t) - 'owner_id' - 'league_id' = r)
  ) then raise exception 'Resposta não corresponde aos dados gravados'; end if;
  if public.futtable_club_draw(request_id, array['ana maria','leo','Bia'], array['arsenal','real-madrid','barcelona']) <> first_result then
    raise exception 'Repetir o conjunto original gerou outro resultado';
  end if;
  before_conflict := public.futtable_league();
  begin
    perform public.futtable_club_draw(request_id, array['Bia','Gil','Leo'], clubs);
    raise exception 'Mesmo pedido com participantes diferentes foi aceito';
  exception when sqlstate 'PT409' then null; end;
  begin
    perform public.futtable_club_draw(gen_random_uuid(), array['Lia','Nova'], array['napoli','benfica']);
    raise exception 'O sorteio transferiu jogador de clube externo à seleção';
  exception when sqlstate 'PT409' then null; end;
  begin
    perform public.futtable_club_draw(gen_random_uuid(), array['Nova','Visitante'], array['arsenal','benfica']);
    raise exception 'O sorteio tomou um clube do jogador externo à seleção';
  exception when sqlstate 'PT409' then null; end;
  if public.futtable_league() <> before_conflict then raise exception 'Um conflito deixou um vínculo ou clube parcial'; end if;
  begin
    perform public.futtable_club_draw(gen_random_uuid(), array['a','b'], array['arsenal','inexistente']);
    raise exception 'RPC aceitou clube fora do catálogo';
  exception when sqlstate 'PT400' then null; end;
  begin
    perform public.futtable_club_draw(gen_random_uuid(), array['  A   B ','a b'], array['arsenal','napoli']);
    raise exception 'RPC aceitou jogador duplicado';
  exception when sqlstate 'PT400' then null; end;
  begin
    perform public.futtable_club_draw(gen_random_uuid(), array['A','B'], array['arsenal','arsenal']);
    raise exception 'RPC aceitou clube duplicado';
  exception when sqlstate 'PT400' then null; end;
  first_round := public.futtable_draw(round_id, array(select id from public.teams where catalog_id = any(clubs)));
  perform public.futtable_club_draw(gen_random_uuid(), players, clubs);
  if (select count(*) from public.teams) <> 4 or first_round <> public.futtable_draw(round_id, array(select id from public.teams where catalog_id = any(clubs))) then
    raise exception 'Novo sorteio alterou o histórico de partidas ou duplicou clubes';
  end if;
  update public.teams set player_name = 'Reserva' where id = old_team;
  if public.futtable_club_draw(request_id, players, clubs) <> first_result or
     (select player_name from public.teams where id = old_team) <> 'Reserva' then
    raise exception 'Repetição alterou um vínculo editado depois do primeiro sorteio';
  end if;
  begin
    perform result from public.club_draw_requests;
    raise exception 'Acesso direto ao registro de sorteios';
  exception when insufficient_privilege then null; end;
  begin
    update public.club_draw_catalog set name = 'Outro' where id = 'arsenal';
    raise exception 'Edição direta do catálogo pelo usuário';
  exception when insufficient_privilege then null; end;
end;
$$;
select set_config('request.jwt.claim.sub', current_setting('club_test.second'), true);
do $$
declare
  response jsonb;
begin
  response := public.futtable_club_draw(current_setting('club_test.request')::uuid, array['Bia','Gil'], array['arsenal','benfica']);
  if jsonb_array_length(response->'teams') <> 2 or (select count(*) from public.teams) <> 2 or
     not exists(select 1 from public.teams where player_name = 'Gil') then raise exception 'Conflito entre contas'; end if;
end;
$$;
set local role anon;
do $$
begin
  begin
    perform public.futtable_club_draw(gen_random_uuid(), array['A','B'], array['arsenal','napoli']);
    raise exception 'Sorteio anônimo permitido';
  exception when insufficient_privilege then null; end;
end;
$$;
rollback;
