-- Executar no SQL Editor de um projeto de teste após aplicar a migration.
-- A transação usa contas temporárias, geradas a cada execução.
begin;

select set_config('futtable_test.account_a', gen_random_uuid()::text, true);
select set_config('futtable_test.account_b', gen_random_uuid()::text, true);

insert into auth.users (id) values
  (current_setting('futtable_test.account_a')::uuid),
  (current_setting('futtable_test.account_b')::uuid);

set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('futtable_test.account_a'), true);

insert into public.teams (id, name, code, color) values
  ('00000000-0000-4000-8000-000000000001', 'Azul', 'AZ', '#112255'),
  ('00000000-0000-4000-8000-000000000002', 'Verde', 'VE', '#116622');

insert into public.matches (id, home_id, away_id, home_score, away_score, played_on) values
  ('00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000001',
   '00000000-0000-4000-8000-000000000002', 1, 0, current_date);

select set_config('request.jwt.claim.sub', current_setting('futtable_test.account_b'), true);

do $$
declare
  removed integer;
begin
  if public.futtable_league() <> '{"teams":[],"matches":[]}'::jsonb then
    raise exception 'A segunda conta conseguiu ler dados da primeira';
  end if;

  update public.matches set home_score = 4;
  if found then
    raise exception 'A segunda conta conseguiu corrigir partidas da primeira';
  end if;

  delete from public.matches;
  get diagnostics removed = row_count;
  if removed <> 0 then
    raise exception 'A segunda conta conseguiu apagar partidas da primeira';
  end if;

  begin
    insert into public.teams (owner_id, name, code, color) values
      (current_setting('futtable_test.account_a')::uuid, 'Intruso', 'IN', '#666666');
    raise exception 'O chamador forjou o proprietário do clube';
  exception when insufficient_privilege then
    null;
  end;

  -- O mesmo nome de time pode existir em campeonatos diferentes.
  insert into public.teams (id, name, code, color) values
    ('00000000-0000-4000-8000-000000000004', 'Azul', 'AZ', '#112255');
  begin
    insert into public.matches (home_id, away_id, home_score, away_score, played_on) values
      ('00000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000001', 0, 0, current_date);
    raise exception 'O banco aceitou uma partida entre contas diferentes';
  exception when foreign_key_violation then
    null;
  end;
end;
$$;

select set_config('request.jwt.claim.sub', current_setting('futtable_test.account_a'), true);
do $$
begin
  if jsonb_array_length(public.futtable_league()->'matches') <> 1 then
    raise exception 'A primeira conta perdeu sua partida';
  end if;

  update public.matches set home_score = 2, away_score = 1
    where id = '00000000-0000-4000-8000-000000000003' and home_score = 1 and away_score = 0;
  if not found then
    raise exception 'O proprietário não conseguiu corrigir o placar';
  end if;
  update public.matches set home_score = 3
    where id = '00000000-0000-4000-8000-000000000003' and home_score = 1 and away_score = 0;
  if found then
    raise exception 'Uma correção concorrente substituiu o placar atualizado';
  end if;
  begin
    update public.matches set played_on = current_date;
    raise exception 'O chamador alterou dados fora do placar';
  exception when insufficient_privilege then
    null;
  end;
end;
$$;

set local role anon;
do $$
begin
  begin
    perform public.futtable_league();
    raise exception 'O papel público conseguiu consultar o campeonato';
  exception when insufficient_privilege then
    null;
  end;
end;
$$;

rollback;
