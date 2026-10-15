-- Testes de banco (RLS, restrições, funções) com DUAS contas de teste distintas, num Postgres 16 real.
-- Roda numa transação que termina em ROLLBACK: nada persiste. Cada "PASS" é uma verificação que passou; qualquer falha aborta.
\set ON_ERROR_STOP on
begin;

create schema t;
grant usage on schema t to anon, authenticated;
create function t.login(u uuid) returns void language plpgsql as $$
begin execute 'reset role'; perform set_config('request.jwt.claim.sub', u::text, true); execute 'set local role authenticated'; end $$;
create function t.visitor() returns void language plpgsql as $$
begin execute 'reset role'; perform set_config('request.jwt.claim.sub', '', true); execute 'set local role anon'; end $$;
create function t.admin() returns void language plpgsql as $$ begin execute 'reset role'; end $$;
-- exige que o SQL FALHE (e mostra o motivo)
create function t.fails(q text, label text) returns void language plpgsql as $$
declare ok boolean := false;
begin
  begin execute q; exception when others then ok := true; raise notice 'PASS  % → bloqueado: %', label, left(sqlerrm, 90); end;
  if not ok then raise exception 'FALHOU: % (deveria ser bloqueado)', label; end if;
end $$;
-- exige que o SQL devolva exatamente n (um número)
create function t.eq(q text, want bigint, label text) returns void language plpgsql as $$
declare got bigint;
begin execute q into got;
  if got is distinct from want then raise exception 'FALHOU: % (esperado %, veio %)', label, want, got; end if;
  raise notice 'PASS  % (= %)', label, got; end $$;
grant execute on all functions in schema t to anon, authenticated;

-- ===== contas de teste (fictícias) =====
insert into auth.users (id, email) values
  ('aaaaaaaa-0000-4000-8000-00000000000a', 'a@teste.invalid'),
  ('bbbbbbbb-0000-4000-8000-00000000000b', 'b@teste.invalid');

select t.eq($$select count(*) from public.profiles$$, 2, 'T1  gatilho criou o perfil das 2 contas após o cadastro');

-- ===== visitante (anon / demonstração) =====
select t.visitor();
select t.fails($$select * from public.profiles$$,          'T2a anon não lê profiles');
select t.fails($$select * from public.workouts$$,          'T2b anon não lê workouts');
select t.fails($$select * from public.meals$$,             'T2c anon não lê meals');
select t.fails($$select * from public.hydration$$,         'T2d anon não lê hydration');
select t.fails($$select * from public.legacy_imports$$,    'T2e anon não lê legacy_imports');
select t.fails($$insert into public.weight_history(user_id,entry_date,weight) values ('aaaaaaaa-0000-4000-8000-00000000000a','2026-01-01',80)$$, 'T2f anon não insere');
select t.fails($$select public.get_my_data()$$,            'T2g anon não executa get_my_data');
select t.fails($$select public.apply_changeset('{"ops":[]}')$$, 'T2h anon não executa apply_changeset');
select t.fails($$select public.import_backup('{}')$$,      'T2i anon não executa import_backup');
select t.fails($$select public.delete_all_my_data()$$,      'T2j anon não executa delete_all_my_data');
select t.fails($$select public.mark_legacy_import(repeat('a',64))$$, 'T2k anon não executa mark_legacy_import');

-- ===== conta A grava dados pelo RPC =====
select t.login('aaaaaaaa-0000-4000-8000-00000000000a');
select public.apply_changeset($j$
{"ops":[
 {"k":"profile","a":"put","v":{"weight":78.4,"calorieGoal":2900,"proteinGoal":160,"fatGoal":80,"carbGoal":380,"waterGoalMl":3000,"appearance":{"theme":"light","accent":"blue"}}},
 {"k":"workout","a":"put","v":{"id":"11111111-1111-4111-8111-111111111111","name":"Treino A","days":[1,4]}},
 {"k":"wex","a":"put","v":{"id":"11111111-1111-4111-8111-1111111111e1","workoutId":"11111111-1111-4111-8111-111111111111","name":"Supino","sets":4}},
 {"k":"wex","a":"put","v":{"id":"11111111-1111-4111-8111-1111111111e2","workoutId":"11111111-1111-4111-8111-111111111111","name":"Crucifixo","sets":3}},
 {"k":"food","a":"put","v":{"id":"22222222-2222-4222-8222-222222222222","name":"Frango","portion":150,"unit":"g","calories":248,"protein":46,"carbs":0,"fat":5}},
 {"k":"session","a":"put","v":{"id":"33333333-3333-4333-8333-333333333333","date":"2026-10-01","workoutId":"11111111-1111-4111-8111-111111111111","workoutName":"Treino A","notes":"ok",
   "exercises":[{"exerciseId":"11111111-1111-4111-8111-1111111111e1","exerciseName":"Supino","note":"pesado","sets":[{"setNumber":1,"load":70,"reps":8,"completed":true},{"setNumber":2,"load":70,"reps":7,"completed":true}]}]}},
 {"k":"meal","a":"put","v":{"id":"44444444-4444-4444-8444-444444444444","date":"2026-10-01","mealType":"almoco"}},
 {"k":"item","a":"put","v":{"id":"55555555-5555-4555-8555-555555555555","mealId":"44444444-4444-4444-8444-444444444444","name":"Frango","quantity":"150 g","calories":248,"protein":46,"carbs":0,"fat":5,"foodId":"22222222-2222-4222-8222-222222222222"}},
 {"k":"weight","a":"put","v":{"id":"66666666-6666-4666-8666-666666666666","date":"2026-10-01","weight":78.4}},
 {"k":"water","a":"put","v":{"id":"77777777-7777-4777-8777-777777777777","date":"2026-10-01","time":"09:30","amount":500}}
]}$j$::jsonb);

select t.eq($$select count(*) from public.workout_exercises$$, 2, 'T3a A: exercícios gravados');
select t.eq($$select count(*) from public.session_sets$$, 2, 'T3b A: séries gravadas');
select t.eq($$select jsonb_array_length(public.get_my_data() -> 'workouts' -> 0 -> 'exercises')$$, 2, 'T3c get_my_data devolve os exercícios do treino');
select t.eq($$select (public.get_my_data() #>> '{profile,carbGoal}')::int$$, 380, 'T3d perfil: meta única de carboidratos');
select t.eq($$select (public.get_my_data() #>> '{hydration,0,amount}')::int$$, 500, 'T3e hidratação volta no formato do app');
select t.eq($$select count(*) from public.get_my_data() d where d #>> '{hydration,0,time}' = '09:30'$$, 1, 'T3f horário HH:MM preservado');
select t.eq($$select count(*) from public.get_my_data() d where d #>> '{profile,appearance,accent}' = 'blue'$$, 1, 'T3g tema/cor guardados no perfil');

-- ===== conta B: isolamento =====
select t.login('bbbbbbbb-0000-4000-8000-00000000000b');
select t.eq($$select count(*) from public.workouts$$, 0, 'T4a B não vê treinos de A');
select t.eq($$select count(*) from public.foods$$, 0, 'T4b B não vê alimentos de A');
select t.eq($$select count(*) from public.meal_items$$, 0, 'T4c B não vê itens de refeição de A');
select t.eq($$select count(*) from public.session_sets$$, 0, 'T4d B não vê séries de A');
select t.eq($$select count(*) from public.profiles$$, 1, 'T4e B vê só o próprio perfil');
select t.eq($$select jsonb_array_length(public.get_my_data() -> 'workouts')$$, 0, 'T4f get_my_data de B vem sem dados de A');
select t.eq($$select (public.get_my_data() #>> '{profile,calorieGoal}')::int$$, 0, 'T4g perfil de B não herda metas de A');
select t.eq($$with u as (update public.workouts set name='HACK' returning 1) select count(*) from u$$, 0, 'T5b B não altera treinos de A (0 linhas)');
select t.eq($$with d as (delete from public.meals returning 1) select count(*) from d$$, 0, 'T5c B não apaga refeições de A (0 linhas)');
select t.eq($$with d as (delete from public.profiles returning 1) select count(*) from d$$, 1, 'T5d B só alcança o próprio perfil');
select t.fails($$insert into public.weight_history(user_id,entry_date,weight) values ('aaaaaaaa-0000-4000-8000-00000000000a','2026-01-01',99)$$, 'T6a B não insere com user_id de A');
select t.fails($$insert into public.workouts(user_id,name) values ('aaaaaaaa-0000-4000-8000-00000000000a','x')$$, 'T6b B não cria treino em nome de A');
select t.fails($$insert into public.profiles(user_id) values ('aaaaaaaa-0000-4000-8000-00000000000a')$$, 'T6c B não cria perfil de A');
insert into public.workouts (id, name) values ('bbbbbbbb-1111-4111-8111-111111111111', 'Treino de B');   -- sem user_id → vira B
select t.eq($$select count(*) from public.workouts where user_id = 'bbbbbbbb-0000-4000-8000-00000000000b'$$, 1, 'T6d user_id vem do banco (auth.uid), não do cliente');
select t.fails($$update public.workouts set user_id = 'aaaaaaaa-0000-4000-8000-00000000000a' where id = 'bbbbbbbb-1111-4111-8111-111111111111'$$, 'T6e B não transfere linha própria para A');
-- relações entre contas
select t.fails($$insert into public.workout_exercises(workout_id,name,sets) values ('11111111-1111-4111-8111-111111111111','invasor',3)$$, 'T7a B não pendura exercício no treino de A (FK composta)');
select t.fails($$insert into public.workout_sessions(workout_id,workout_name,session_date) values ('11111111-1111-4111-8111-111111111111','x','2026-10-02')$$, 'T7b B não liga sessão ao treino de A');
select t.fails($$insert into public.meal_items(meal_id,name) values ('44444444-4444-4444-8444-444444444444','x')$$, 'T7c B não adiciona item na refeição de A');
select t.fails($$insert into public.session_sets(session_exercise_id,set_number) select id,1 from public.session_exercises$$ || ' union all select gen_random_uuid(),1', 'T7d B não cria série em exercício inexistente/alheio');
select t.fails($$insert into public.meal_items(meal_id,food_id,name) values ('bbbbbbbb-2222-4222-8222-222222222222','22222222-2222-4222-8222-222222222222','x')$$, 'T7e item de B com food_id de A não passa');
-- via RPC: referência alheia vira "sem vínculo", nunca associação
select public.apply_changeset($j$
{"ops":[
 {"k":"session","a":"put","v":{"id":"bbbbbbbb-3333-4333-8333-333333333333","date":"2026-10-03","workoutId":"11111111-1111-4111-8111-111111111111","workoutName":"Tentativa","notes":"","exercises":[{"exerciseId":"11111111-1111-4111-8111-1111111111e1","exerciseName":"Supino","sets":[{"setNumber":1,"load":1,"reps":1,"completed":true}]}]}},
 {"k":"meal","a":"put","v":{"id":"bbbbbbbb-4444-4444-8444-444444444444","date":"2026-10-03","mealType":"cafe"}},
 {"k":"item","a":"put","v":{"id":"bbbbbbbb-5555-4555-8555-555555555555","mealId":"bbbbbbbb-4444-4444-8444-444444444444","name":"Pão","quantity":"1","calories":10,"protein":1,"carbs":1,"fat":0,"foodId":"22222222-2222-4222-8222-222222222222"}}
]}$j$::jsonb);
select t.eq($$select count(*) from public.workout_sessions where workout_id is null and id='bbbbbbbb-3333-4333-8333-333333333333'$$, 1, 'T7f RPC: workoutId de A é descartado (NULL)');
select t.eq($$select count(*) from public.session_exercises where exercise_id is not null$$, 0, 'T7g RPC: exerciseId de A é descartado');
select t.eq($$select count(*) from public.meal_items where food_id is not null$$, 0, 'T7h RPC: foodId de A é descartado');
-- B "regrava" o mesmo id do treino de A pelo RPC: cria uma linha NOVA de B; a de A não muda
select public.apply_changeset('{"ops":[{"k":"workout","a":"put","v":{"id":"11111111-1111-4111-8111-111111111111","name":"SEQUESTRO","days":[]}}]}'::jsonb);
select public.apply_changeset('{"ops":[{"k":"workout","a":"del","id":"11111111-1111-4111-8111-111111111111"},{"k":"food","a":"del","id":"22222222-2222-4222-8222-222222222222"}]}'::jsonb);
select t.login('aaaaaaaa-0000-4000-8000-00000000000a');
select t.eq($$select count(*) from public.workouts where name = 'Treino A'$$, 1, 'T8a treino de A intacto após B usar o mesmo id e apagar');
select t.eq($$select count(*) from public.foods$$, 1, 'T8b alimento de A intacto após B tentar apagar por id');
select t.eq($$select count(*) from public.workout_sessions$$, 1, 'T8c A ainda tem 1 sessão (a de B não aparece)');
select t.eq($$select count(*) from public.workout_exercises where workout_id='11111111-1111-4111-8111-111111111111'$$, 2, 'T8d exercícios de A intactos');

-- ===== cópias de refeição e vínculos =====
select public.apply_changeset('{"ops":[{"k":"food","a":"put","v":{"id":"22222222-2222-4222-8222-222222222222","name":"Frango EDITADO","portion":100,"unit":"g","calories":999,"protein":99,"carbs":9,"fat":9}}]}'::jsonb);
select t.eq($$select calories::int from public.meal_items where id='55555555-5555-4555-8555-555555555555'$$, 248, 'T9a editar a biblioteca NÃO altera refeição antiga (valores copiados)');
select t.eq($$select count(*) from public.meal_items where name='Frango' and food_id is not null$$, 1, 'T9b vínculo informativo mantido');
select public.apply_changeset('{"ops":[{"k":"food","a":"del","id":"22222222-2222-4222-8222-222222222222"}]}'::jsonb);
select t.eq($$select count(*) from public.meal_items where name='Frango' and food_id is null and calories=248$$, 1, 'T9c apagar alimento da biblioteca preserva a refeição');
select public.apply_changeset('{"ops":[{"k":"workout","a":"del","id":"11111111-1111-4111-8111-111111111111"}]}'::jsonb);
select t.eq($$select count(*) from public.workout_sessions where id='33333333-3333-4333-8333-333333333333' and workout_id is null$$, 1, 'T9d apagar treino preserva o histórico');
select t.eq($$select count(*) from public.session_sets$$, 2, 'T9e séries do histórico preservadas');
-- reescrever a sessão duas vezes não duplica
select public.apply_changeset('{"ops":[{"k":"session","a":"put","v":{"id":"33333333-3333-4333-8333-333333333333","date":"2026-10-01","workoutName":"Treino A","notes":"x","exercises":[{"exerciseName":"Supino","sets":[{"setNumber":1,"load":72.5,"reps":8,"completed":true}]}]}}]}'::jsonb);
select public.apply_changeset('{"ops":[{"k":"session","a":"put","v":{"id":"33333333-3333-4333-8333-333333333333","date":"2026-10-01","workoutName":"Treino A","notes":"x","exercises":[{"exerciseName":"Supino","sets":[{"setNumber":1,"load":72.5,"reps":8,"completed":true}]}]}}]}'::jsonb);
select t.eq($$select count(*) from public.session_sets$$, 1, 'T9f editar sessão substitui (não duplica) as séries');

-- ===== restrições de dados =====
select t.fails($$select public.apply_changeset('{"ops":[{"k":"weight","a":"put","v":{"id":"99999999-9999-4999-8999-999999999991","date":"2026-10-01","weight":-5}}]}')$$, 'T10a peso negativo recusado');
select t.fails($$select public.apply_changeset('{"ops":[{"k":"meal","a":"put","v":{"id":"99999999-9999-4999-8999-999999999992","date":"2026-10-01","mealType":"ceia"}}]}')$$, 'T10b tipo de refeição inválido recusado');
select t.fails($$select public.apply_changeset('{"ops":[{"k":"workout","a":"put","v":{"id":"99999999-9999-4999-8999-999999999993","name":"x","days":[9]}}]}')$$, 'T10c dia da semana inválido recusado');
select t.fails($$select public.apply_changeset('{"ops":[{"k":"water","a":"put","v":{"id":"99999999-9999-4999-8999-999999999994","date":"2026-10-01","time":"25:00","amount":300}}]}')$$, 'T10d horário inválido recusado');
select t.fails($$select public.apply_changeset('{"ops":[{"k":"hack","a":"put","v":{}}]}')$$, 'T10e operação desconhecida recusada');
select t.fails($$select public.apply_changeset('{"ops":[{"k":"weight","a":"put","v":{"id":"nao-e-uuid","date":"2026-10-01","weight":80}}]}')$$, 'T10f id que não é UUID recusado');
select t.eq($$select count(*) from public.weight_history$$, 1, 'T10g falhas não deixaram registros pela metade');
-- uma operação ruim derruba o conjunto inteiro (atomicidade do changeset)
select t.fails($$select public.apply_changeset('{"ops":[{"k":"weight","a":"put","v":{"id":"99999999-9999-4999-8999-999999999995","date":"2026-10-02","weight":80}},{"k":"weight","a":"put","v":{"id":"99999999-9999-4999-8999-999999999996","date":"2026-10-03","weight":-1}}]}')$$, 'T10h changeset com 1 item inválido é rejeitado inteiro');
select t.eq($$select count(*) from public.weight_history$$, 1, 'T10i … e o item válido do mesmo lote não foi gravado');

-- ===== importação =====
select t.login('bbbbbbbb-0000-4000-8000-00000000000b');
create temp table imp as select $j$
{"schemaVersion":2,"profile":{"weight":72,"calorieGoal":3000,"proteinGoal":150,"fatGoal":80,"carbGoal":400,"waterGoalMl":3000,"appearance":{"theme":"dark","accent":"green"},"user_id":"aaaaaaaa-0000-4000-8000-00000000000a"},
 "workouts":[{"id":"w_1","name":"Push","days":[1],"user_id":"aaaaaaaa-0000-4000-8000-00000000000a","exercises":[{"id":"e_1","name":"Supino","sets":3},{"id":"e_2","name":"Tríceps","sets":3}]}],
 "workoutHistory":[{"id":"h_1","date":"2026-09-20","workoutId":"w_1","workoutName":"Push","notes":"","exercises":[{"exerciseId":"e_1","exerciseName":"Supino","sets":[{"setNumber":1,"load":60,"reps":8,"completed":true},{"setNumber":2,"load":60,"reps":7,"completed":true}]},{"exerciseId":"e_gone","exerciseName":"Removido","sets":[{"setNumber":1,"load":10,"reps":10,"completed":false}]}]}],
 "foods":[{"id":"f_1","name":"Arroz","portion":150,"unit":"g","calories":195,"protein":4,"carbs":42,"fat":0}],
 "meals":[{"id":"m_1","date":"2026-09-20","mealType":"almoco","calories":195,"protein":4,"foods":[{"id":"mf_1","name":"Arroz","quantity":"150 g","calories":195,"protein":4,"carbs":42,"fat":0,"foodId":"f_1"}]}],
 "weightHistory":[{"id":"p_1","date":"2026-09-20","weight":72}],
 "hydration":[{"id":"y_1","date":"2026-09-20","time":"08:00","amount":300},{"id":"y_2","date":"2026-09-20","time":"10:00","amount":500}]}
$j$::jsonb as j;
grant all on imp to authenticated;
select t.eq($$select (r->>'workouts')::int + (r->>'exercises')::int + (r->>'sessions')::int + (r->>'sets')::int + (r->>'foods')::int + (r->>'meals')::int + (r->>'items')::int + (r->>'weights')::int + (r->>'water')::int from (select public.import_backup((select j from imp), 'merge') r) q$$, 1+2+1+3+1+1+1+1+2, 'T11a migração (merge) grava tudo e devolve contagens conferíveis');
select t.eq($$select (public.get_my_data() #>> '{profile,calorieGoal}')::int$$, 3000, 'T11b perfil em branco recebe as metas do arquivo');
select t.eq($$select count(*) from public.workouts where user_id = (select auth.uid())$$, 2, 'T11c B tem Push + o treino manual anterior');
select t.eq($$select count(*) from public.session_exercises where exercise_id is null$$, 2, 'T11d vínculo com exercício inexistente fica NULL (sem erro)');
select public.mark_legacy_import(repeat('a',64), '{"x":1}');
select public.mark_legacy_import(repeat('a',64), '{"x":2}');
select t.eq($$select count(*) from public.legacy_imports$$, 1, 'T12a marcar a migração duas vezes registra uma só');
select t.eq($$select jsonb_array_length(public.get_my_data() -> 'legacyImported')$$, 1, 'T12a2 get_my_data informa as migrações concluídas');
select t.fails($$select public.mark_legacy_import('curta')$$, 'T12a3 chave inválida recusada');
select t.eq($$select (public.import_backup((select j from imp), 'merge') ->> 'workouts')::int$$, 1, 'T12b merge sem chave: mesmos IDs determinísticos (conta o mesmo treino)');
select t.eq($$select count(*) from public.workouts$$, 2, 'T12c … e não duplicou treinos');
select t.eq($$select count(*) from public.hydration$$, 2, 'T12d … nem registros de água');
select t.eq($$select count(*) from public.session_sets$$, 4, 'T12e … nem séries');
select t.eq($$select count(*) from public.meal_items where name = 'Arroz'$$, 1, 'T12f … nem itens de refeição');
select t.eq($$select count(*) from public.profiles where user_id = 'aaaaaaaa-0000-4000-8000-00000000000a'$$, 0, 'T13a arquivo com user_id de A não vira dados de A (B não enxerga perfil de A)');
select t.login('aaaaaaaa-0000-4000-8000-00000000000a');
select t.eq($$select count(*) from public.workouts where name = 'Push'$$, 0, 'T13b … e A não recebeu nada do arquivo importado por B');
select t.eq($$select (public.get_my_data() #>> '{profile,calorieGoal}')::int$$, 2900, 'T13c perfil de A intacto');
-- merge não sobrescreve perfil já configurado
select t.eq($$select (public.import_backup((select j from imp), 'merge') ->> 'profile')::boolean::int$$, 0, 'T14a merge em conta com perfil configurado não troca o perfil');
select t.eq($$select (public.get_my_data() #>> '{profile,calorieGoal}')::int$$, 2900, 'T14b metas de A preservadas');
-- importação atômica: item ruim no meio desfaz tudo
select t.eq($$select count(*) from public.foods$$, 1, 'T15a (A tem 1 alimento, vindo do merge anterior)');
select t.fails($$select public.import_backup('{"workouts":[],"workoutHistory":[],"foods":[{"id":"ok","name":"Bom","portion":10,"unit":"g","calories":1,"protein":1},{"id":"ruim","name":"Ruim","portion":10,"unit":"g","calories":-5,"protein":1}],"meals":[],"weightHistory":[]}', 'replace')$$, 'T15b importação com item inválido falha');
select t.eq($$select count(*) from public.foods$$, 1, 'T15c … sem gravar o item válido');
select t.eq($$select count(*) from public.workout_sessions$$, 2, 'T15d … e sem apagar os dados atuais (replace desfeito junto)');
-- replace
select t.eq($$select (public.import_backup((select j from imp), 'replace') ->> 'sessions')::int$$, 1, 'T16a replace importa o arquivo');
select t.eq($$select count(*) from public.workout_sessions$$, 1, 'T16b … e removeu a sessão antiga');
select t.eq($$select count(*) from public.workouts where name='Push'$$, 1, 'T16c … dados de A agora refletem o arquivo');
select t.eq($$select (public.get_my_data() #>> '{profile,calorieGoal}')::int$$, 3000, 'T16d replace aplica o perfil do arquivo');
select t.fails($$select public.import_backup('[]'::jsonb)$$, 'T16e backup que não é objeto é recusado');
select t.fails($$select public.import_backup('{"workouts":[]}'::jsonb)$$, 'T16f backup sem listas obrigatórias é recusado');
select t.fails($$select public.import_backup((select j from imp), 'sobrescrever')$$, 'T16g modo inválido recusado');
-- ids antigos de A (aleatórios) em backup: dois usuários importando o MESMO arquivo ficam independentes
select t.login('bbbbbbbb-0000-4000-8000-00000000000b');
select t.eq($$select count(*) from public.workouts where name='Push'$$, 1, 'T17a B continua com o próprio Push (ids recodificados por conta)');

-- ===== apagar dados =====
select public.delete_all_my_data();
select t.eq($$select count(*) from public.workouts$$ , 0, 'T18a B apagou os próprios treinos');
select t.eq($$select count(*) from public.legacy_imports$$ , 0, 'T18b marcadores de migração removidos');
select t.eq($$select (public.get_my_data() #>> '{profile,calorieGoal}')::int$$, 0, 'T18c metas zeradas');
select t.login('aaaaaaaa-0000-4000-8000-00000000000a');
select t.eq($$select count(*) from public.workouts$$ , 1, 'T18d dados de A não foram afetados pelo apagar de B');

-- ===== imutabilidade do dono =====
select t.admin();
select t.fails($$update public.workouts set user_id = 'bbbbbbbb-0000-4000-8000-00000000000b'$$, 'T19  nem o administrador troca o dono de uma linha (gatilho)');

-- ===== exclusão da conta apaga tudo em cascata =====
delete from auth.users where id = 'aaaaaaaa-0000-4000-8000-00000000000a';
select t.eq($$select count(*) from public.workouts where user_id='aaaaaaaa-0000-4000-8000-00000000000a'$$, 0, 'T20a excluir a conta remove dados em cascata');
select t.eq($$select count(*) from public.profiles where user_id='aaaaaaaa-0000-4000-8000-00000000000a'$$, 0, 'T20b … e o perfil');

-- ===== auditoria: RLS ligado em todas as tabelas e 4 políticas explícitas em cada =====
select t.admin();
select t.eq($$select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and not c.relrowsecurity$$, 0, 'T21a nenhuma tabela pública sem RLS');
select t.eq($$select count(*) from (select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r') x where (select count(distinct cmd) from pg_policies p where p.schemaname='public' and p.tablename=x.relname) <> 4$$, 0, 'T21b toda tabela tem políticas de SELECT/INSERT/UPDATE/DELETE');
select t.eq($$select count(*) from pg_policies where schemaname='public' and (roles <> '{authenticated}' or (cmd in ('UPDATE') and with_check is null) or (cmd='INSERT' and with_check is null))$$, 0, 'T21c políticas só para authenticated; INSERT/UPDATE com WITH CHECK');
select t.eq($$select count(*) from information_schema.role_table_grants where table_schema='public' and grantee in ('anon','PUBLIC')$$, 0, 'T21d anon/PUBLIC sem nenhuma permissão em tabelas');

rollback;
