-- Executar após as três migrações no banco de teste. Rollback inclui as duas contas.
begin;
select set_config('draw_test.a', gen_random_uuid()::text, true),
       set_config('draw_test.b', gen_random_uuid()::text, true),
       set_config('draw_test.round', gen_random_uuid()::text, true);
insert into auth.users (id) values (current_setting('draw_test.a')::uuid), (current_setting('draw_test.b')::uuid);
set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('draw_test.a'), true);
insert into public.teams (name, code, color, catalog_id, player_name)
  values ('Azul', 'AZ', '#112255', 'azul', 'João'),
         ('Amarelo', 'AM', '#FFFF00', 'amarelo', 'Ana'),
         ('Verde', 'VE', '#009900', 'verde', 'Gil'),
         ('Reserva', 'RS', '#222222', null, null);

do $$
declare
  round_id uuid := current_setting('draw_test.round')::uuid;
  first_round jsonb;
  first_game jsonb;
  game_id uuid;
  home_team uuid;
  away_team uuid;
  bye_team uuid;
  selected uuid[];
  result jsonb;
  next_round uuid := gen_random_uuid();
  second_round jsonb;
begin
  begin
    update public.teams set player_name = 'ana' where name = 'Reserva';
    raise exception 'Jogador repetido foi cadastrado na mesma conta';
  exception when unique_violation then null;
  end;
  begin
    update public.teams set catalog_id = 'azul' where name = 'Reserva';
    raise exception 'Clube repetido foi cadastrado na mesma conta';
  exception when unique_violation then null;
  end;
  first_round := public.futtable_draw(round_id);
  if jsonb_array_length(first_round->'matches') <> 1 or (first_round#>>'{draw,number}')::integer <> 1
     or first_round#>>'{draw,bye_player_name}' is null then raise exception 'Sorteio ímpar inválido'; end if;
  first_game := first_round#>'{matches,0}';
  game_id := (first_game->>'id')::uuid;
  home_team := (first_game->>'home_id')::uuid;
  away_team := (first_game->>'away_id')::uuid;
  bye_team := (first_round#>>'{draw,bye_team_id}')::uuid;
  if (select count(*) from public.teams where id = any(array[home_team, away_team, bye_team]) and player_name is not null) <> 3
     or first_game->>'home_score' is not null or first_game->>'away_score' is not null or first_game->>'played_on' is not null
     or not (first_game ?& array['home_team_name', 'away_team_name', 'home_player_name', 'away_player_name', 'home_catalog_id', 'away_catalog_id'])
    then raise exception 'Composição de participantes ou estado pendente incorreto'; end if;
  if not exists (select 1 from public.teams where id = home_team and name = first_game->>'home_team_name'
                 and player_name = first_game->>'home_player_name' and catalog_id = first_game->>'home_catalog_id')
     or not exists (select 1 from public.teams where id = away_team and name = first_game->>'away_team_name'
                 and player_name = first_game->>'away_player_name' and catalog_id = first_game->>'away_catalog_id') then
    raise exception 'A partida não guardou os clubes e jogadores da rodada';
  end if;
  perform set_config('draw_test.game', game_id::text, true);
  perform set_config('draw_test.team', home_team::text, true);
  if first_round <> public.futtable_draw(round_id) then raise exception 'Rodada duplicada no reenvio'; end if;
  selected := array[home_team, away_team];
  second_round := public.futtable_draw(next_round, selected);
  if second_round#>>'{draw,number}' <> '2' or (select count(distinct draw_id) from public.matches where played_on is null) <> 2
     or first_round is distinct from public.futtable_draw(round_id) then
    raise exception 'Criar nova rodada alterou a rodada pendente anterior';
  end if;
  begin
    update public.matches set home_score = 2, away_score = 0 where id = game_id;
    raise exception 'Uma correção lançou resultado em partida pendente';
  exception when check_violation then null;
  end;

  update public.teams set player_name = 'Novo Jogador', name = 'Clube Novo', catalog_id = 'novo' where id = home_team;
  if first_round <> public.futtable_draw(round_id) then raise exception 'Edição retroativa do sorteio'; end if;
  if public.futtable_remove_team(bye_team, 0) <> 'removed'
     then raise exception 'Erro ao excluir quem folgou'; end if;
  if (select bye_team_name is distinct from (first_round#>>'{draw,bye_team_name}') or bye_team_id is not null from public.draws where id = round_id)
     then raise exception 'Exclusão perdeu o histórico de folga'; end if;
  result := public.futtable_finish_match(game_id, 0, 0, current_date);
  if result->>'home_score' <> '0' or result->>'played_on' <> current_date::text
     or result is distinct from public.futtable_finish_match(game_id, 0, 0, current_date)
     or (select count(*) from public.matches) <> 2 then raise exception 'Falha ao concluir e repetir o resultado'; end if;
  begin
    perform public.futtable_finish_match(game_id, 2, 1, current_date);
    raise exception 'Reenvio conflitante sobrescreveu o placar';
  exception when sqlstate 'PT409' then null;
  end;
  begin
    perform public.futtable_finish_match(game_id, 100, 1, current_date);
    raise exception 'Banco aceitou placar inválido';
  exception when sqlstate 'PT400' then null;
  end;
  -- O reenvio deve recuperar a seleção original mesmo após mudar a escalação.
  update public.teams set player_name = 'Participante extra' where name = 'Reserva';
  begin
    perform public.futtable_draw(next_round, array[home_team, home_team]);
    raise exception 'Jogador foi selecionado duas vezes';
  exception when sqlstate 'PT400' then null;
  end;
  result := public.futtable_draw(next_round, selected);
  if result is distinct from second_round or result#>>'{draw,bye_team_name}' is not null or jsonb_array_length(result->'matches') <> 1
     or (result#>>'{matches,0,home_id}')::uuid <> all(selected) or (result#>>'{matches,0,away_id}')::uuid <> all(selected)
     or result is distinct from public.futtable_draw(next_round, array[away_team, home_team]) then raise exception 'Sorteio de seleção inválido'; end if;
  begin
    perform public.futtable_draw(next_round);
    raise exception 'Chave de repetição reutilizada com outra seleção';
  exception when sqlstate 'PT409' then null;
  end;
  if public.futtable_remove_team(away_team, 1) <> 'conflict' then raise exception 'Exclusão ignorou jogos pendentes'; end if;
  if public.futtable_remove_team(away_team, 2) <> 'removed' then raise exception 'Exclusão com contagem exata falhou'; end if;
  if (select count(*) from public.matches) <> 0 or (select count(*) from public.draws) <> 2 then
    raise exception 'Exclusão afetou os dados errados'; end if;
  result := public.futtable_draw(gen_random_uuid());
  perform set_config('draw_test.game', result#>>'{matches,0,id}', true);
  begin
    insert into public.draws (id, number) values (gen_random_uuid(), 9);
    raise exception 'Inserção direta de rodada permitida';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.matches (draw_id, home_id, away_id) values (next_round, home_team, away_team);
    raise exception 'Inserção direta de sorteio permitida';
  exception when insufficient_privilege then null;
  end;
end;
$$;

select set_config('request.jwt.claim.sub', current_setting('draw_test.b'), true);
do $$
declare
  round_id uuid := current_setting('draw_test.round')::uuid;
  player_club uuid;
begin
  if public.futtable_league() <> '{"teams":[],"matches":[],"draws":[]}'::jsonb then raise exception 'Rodada de outra conta visível'; end if;
  begin
    perform public.futtable_draw(round_id);
    raise exception 'Recuperou sorteio de outra conta ou criou rodada vazia';
  exception when sqlstate 'PT400' then null;
  end;
  -- O mesmo nome é válido em outra conta, mas o ID de clube da primeira não participa aqui.
  insert into public.teams (name, code, color, player_name, catalog_id) values ('Clube Novo', 'CN', '#123456', 'Novo Jogador', 'novo') returning id into player_club;
  begin
    perform public.futtable_draw(round_id, array[player_club, current_setting('draw_test.team')::uuid]);
    raise exception 'Seleção incluiu clube de outra liga';
  exception when sqlstate 'PT409' then null;
  end;
  begin
    perform public.futtable_finish_match(current_setting('draw_test.game')::uuid, 0, 0, current_date);
    raise exception 'Segunda conta lançou resultado da primeira';
  exception when sqlstate 'PT404' then null;
  end;
  if (select count(*) from public.draws) <> 0 then raise exception 'Sorteio falhou deixando rodada parcial'; end if;
  insert into public.teams (name, code, color, player_name)
    select 'Clube ' || n, 'FC', '#FFFFFF', 'Jogador ' || n from generate_series(1, 5) as n;
  perform public.futtable_draw(round_id);
  if (select count(*) from public.matches) <> 3 or
     (select count(distinct id) from (select home_id as id from public.matches union all select away_id from public.matches) as sides) <> 6
     or (select bye_team_id from public.draws where id = round_id) is not null then
    raise exception 'Rodada com seis jogadores perdeu ou repetiu participantes';
  end if;
end;
$$;
set local role anon;
do $$
begin
  begin
    perform public.futtable_draw(gen_random_uuid());
    raise exception 'Rodada criada sem conta';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.futtable_finish_match(gen_random_uuid(), 1, 0, current_date);
    raise exception 'Resultado aceito sem conta';
  exception when insufficient_privilege then null;
  end;
end;
$$;
rollback;
