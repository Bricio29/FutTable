-- Executar no projeto de teste após a migração de múltiplas ligas.
begin;
select set_config('league_test.a', gen_random_uuid()::text, true),
       set_config('league_test.b', gen_random_uuid()::text, true);
insert into auth.users(id) values
  (current_setting('league_test.a')::uuid), (current_setting('league_test.b')::uuid);
set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('league_test.a'), true);
select set_config('request.headers', '{}', true);

do $$
declare
  account_id uuid := auth.uid();
  key_id uuid := gen_random_uuid();
  draw_id uuid := gen_random_uuid();
  round_id uuid := gen_random_uuid();
  new_league jsonb;
  original jsonb;
  other jsonb;
  info jsonb;
  original_roster jsonb;
  other_roster jsonb;
  match_id uuid;
  first_team uuid;
begin
  info := public.futtable_list_leagues();
  if jsonb_array_length(info->'leagues') <> 1 or (info#>>'{leagues,0,id}')::uuid <> account_id or
     info#>>'{leagues,0,name}' <> 'Minha liga' or info#>>'{leagues,0,created_at}' is null then
    raise exception 'A liga original deve existir para a conta nova';
  end if;
  begin
    perform public.futtable_create_league(key_id, '   ');
    raise exception 'Criação sem nome';
  exception when sqlstate 'PT400' then null;
  end;
  new_league := public.futtable_create_league(key_id, ' Copa  da  Rua ');
  if new_league->>'name' <> 'Copa da Rua' or new_league->>'created_at' is null or
     new_league->>'id' = account_id::text or new_league <> public.futtable_create_league(key_id, 'Copa da Rua') then
    raise exception 'Criação, normalização ou repetição de pedido incorreta';
  end if;
  begin
    perform public.futtable_create_league(key_id, 'Outra');
    raise exception 'Chave de criação reutilizada para outro nome';
  exception when sqlstate 'PT409' then null;
  end;
  original_roster := public.futtable_club_draw(draw_id,array['Ana','Luiz'],array['arsenal','real-madrid']);
  match_id := (public.futtable_draw(round_id)#>>'{matches,0,id}')::uuid;
  first_team := (original_roster#>>'{teams,0,id}')::uuid;
  original := public.futtable_league();

  perform set_config('request.headers', jsonb_build_object('x-futtable-league',new_league->>'id')::text, true);
  other := public.futtable_league();
  if other <> jsonb_build_object('league_name', 'Copa da Rua', 'league_id', new_league->>'id',
       'teams','[]'::jsonb,'matches','[]'::jsonb,'draws','[]'::jsonb) then
    raise exception 'Uma liga nova precisa estar vazia';
  end if;
  begin
    perform public.futtable_finish_match(match_id,1,0,current_date);
    raise exception 'Um resultado foi gravado em outra liga';
  exception when sqlstate 'PT404' then null;
  end;
  if public.futtable_remove_team(first_team,1) <> 'absent' then raise exception 'Clube de outra liga removido'; end if;
  update public.teams set name='Incorreto' where id=first_team;
  if found then raise exception 'Clube de outra liga editado'; end if;
  delete from public.matches where id=match_id;
  if found then raise exception 'Partida de outra liga excluída'; end if;
  begin
    insert into public.matches(home_id,away_id,home_score,away_score,played_on)
    values ((original#>>'{teams,0,id}')::uuid,(original#>>'{teams,1,id}')::uuid,1,0,current_date);
    raise exception 'Foi possível escalar clubes fora da liga';
  exception when foreign_key_violation then null;
  end;
  other_roster := public.futtable_club_draw(draw_id,array['Ana','Luiz'],array['arsenal','real-madrid']);
  if other_roster = original_roster or other_roster <> public.futtable_club_draw(draw_id,array['Luiz','Ana'],array['real-madrid','arsenal']) then
    raise exception 'Vínculos de jogadores e repetição do sorteio não são locais à liga';
  end if;
  info := public.futtable_draw(round_id);
  if info#>>'{draw,number}' <> '1' or info#>>'{matches,0,id}' = match_id::text then
    raise exception 'A rodada não foi sorteada independentemente';
  end if;
  perform public.futtable_finish_match((info#>>'{matches,0,id}')::uuid,0,0,current_date);
  info := public.futtable_rename_league(' Copa do Bairro ','Copa da Rua');
  if info <> '{"name":"Copa do Bairro"}'::jsonb or info <> public.futtable_rename_league('Copa do Bairro','Copa da Rua') then
    raise exception 'Renomeação ou repetição incorreta';
  end if;
  begin
    perform public.futtable_rename_league('Nome concorrente','Copa da Rua');
    raise exception 'Renomeação concorrente sobrescreveu o nome';
  exception when sqlstate 'PT409' then null;
  end;
  info := public.futtable_league();
  if info->>'league_name' <> 'Copa do Bairro' or info#>>'{matches,0,home_score}' <> '0' or
     (info#>'{teams,0}') ?| array['owner_id','league_id'] or (info#>'{matches,0}') ?| array['owner_id','league_id'] or
     (info#>'{draws,0}') ?| array['owner_id','league_id','requested_team_ids'] then
    raise exception 'Nome, placar ou formato do snapshot incorreto';
  end if;
  if public.futtable_create_league(key_id,'Copa da Rua')->>'name' <> 'Copa do Bairro' then
    raise exception 'Repetir criação após renomear não encontrou a mesma liga';
  end if;
  perform set_config('request.headers','{}',true);
  if public.futtable_league() <> original or jsonb_array_length(public.futtable_list_leagues()->'leagues') <> 2 then
    raise exception 'A segunda liga alterou o campeonato original';
  end if;

  perform set_config('request.jwt.claim.sub',current_setting('league_test.b'),true);
  if jsonb_array_length(public.futtable_list_leagues()->'leagues') <> 1 or exists (select 1 from public.leagues where id=account_id) then
    raise exception 'Outra conta enxerga ligas privadas';
  end if;
  info := public.futtable_create_league(key_id,'Copa da Rua');
  if info->>'id' = new_league->>'id' then raise exception 'Colisão de criação entre contas'; end if;
  perform set_config('request.headers',jsonb_build_object('x-futtable-league',new_league->>'id')::text,true);
  begin
    perform public.futtable_league();
    raise exception 'Snapshot com liga alheia';
  exception when sqlstate 'PT404' then null;
  end;
  begin
    insert into public.teams(name,code,color) values ('Intruso','IN','#000000');
    raise exception 'Clube inserido em liga alheia';
  exception when sqlstate 'PT404' then null;
  end;
  begin
    perform public.futtable_rename_league('Invasor','Copa do Bairro');
    raise exception 'Outra conta renomeou a liga';
  exception when sqlstate 'PT404' then null;
  end;
  begin
    perform public.futtable_club_draw(draw_id,array['Ana','Luiz'],array['arsenal','real-madrid']);
    raise exception 'A repetição de outra conta escapou do escopo';
  exception when sqlstate 'PT404' then null;
  end;
  perform set_config('request.headers','{"x-futtable-league":"inválido"}',true);
  begin
    perform public.futtable_league();
    raise exception 'Header inválido aceito como liga padrão';
  exception when sqlstate 'PT400' then null;
  end;
end;
$$;

set local role anon;
do $$
begin
  begin
    perform public.futtable_list_leagues();
    raise exception 'Conta pública leu as ligas';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.futtable_create_league(gen_random_uuid(),'Anônima');
    raise exception 'Conta pública criou uma liga';
  exception when insufficient_privilege then null;
  end;
end;
$$;
rollback;
