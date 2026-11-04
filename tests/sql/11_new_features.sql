-- Testes da migração 4 (objetivos, refeições salvas, fotos, Storage) com DUAS contas de teste distintas, num Postgres 16 real.
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
insert into auth.users (id, email) values ('aaaaaaaa-0000-4000-8000-00000000000a', 'a@teste.invalid'), ('bbbbbbbb-0000-4000-8000-00000000000b', 'b@teste.invalid');

-- ===== migração aditiva: colunas novas com padrão seguro =====
select t.login('aaaaaaaa-0000-4000-8000-00000000000a');
select t.eq($$select count(*) from (select 1 where (public.get_my_data() #>> '{profile,goalType}') = 'maintain' and (public.get_my_data() #>> '{profile,calorieAdjust}') = '0' and jsonb_typeof(public.get_my_data() #> '{profile,goalPresets}') = 'object') x$$, 1, 'N1a conta existente: objetivo = manutenção, ajuste 0, sem presets (nada alterado)');

-- ===== objetivo e metas por objetivo (gravação parcial) =====
select public.apply_changeset($j${"ops":[{"k":"profile","a":"put","v":{"calorieGoal":3000,"proteinGoal":150}}]}$j$::jsonb);
select public.apply_changeset($j${"ops":[{"k":"profile","a":"put","v":{"goalType":"gain","targetWeight":80.5,"calorieAdjust":300,"goalPresets":{"gain":{"cal":3300,"prot":170,"carb":420,"fat":90},"lose":{"cal":2400}}}}]}$j$::jsonb);
select t.eq($$select (public.get_my_data() #>> '{profile,calorieGoal}')::int$$, 3000, 'N1b alterar objetivo NÃO mexe nas metas ativas já cadastradas');
select t.eq($$select count(*) from (select 1 where public.get_my_data() #>> '{profile,goalType}' = 'gain' and (public.get_my_data() #>> '{profile,targetWeight}')::numeric = 80.5 and (public.get_my_data() #>> '{profile,calorieAdjust}')::int = 300 and (public.get_my_data() #>> '{profile,goalPresets,gain,prot}')::int = 170) x$$, 1, 'N1c objetivo, peso desejado, ajuste e presets voltam no formato do app');
select public.apply_changeset($j${"ops":[{"k":"profile","a":"put","v":{"targetWeight":null}}]}$j$::jsonb);
select t.eq($$select count(*) from public.profiles where target_weight is null$$, 1, 'N1d peso desejado pode ser limpo');
select t.fails($$select public.apply_changeset('{"ops":[{"k":"profile","a":"put","v":{"goalType":"hack"}}]}')$$, 'N1e objetivo inválido recusado');
select t.fails($$select public.apply_changeset('{"ops":[{"k":"profile","a":"put","v":{"calorieAdjust":99999}}]}')$$, 'N1f ajuste calórico absurdo recusado');

-- ===== exercício: descrição e grupo muscular =====
select public.apply_changeset($j${"ops":[
 {"k":"workout","a":"put","v":{"id":"11111111-1111-4111-8111-111111111111","name":"Treino A","days":[1]}},
 {"k":"wex","a":"put","v":{"id":"11111111-1111-4111-8111-1111111111e1","workoutId":"11111111-1111-4111-8111-111111111111","name":"Supino","sets":4,"description":"Pegada média","muscleGroup":"Peito"}},
 {"k":"session","a":"put","v":{"id":"33333333-3333-4333-8333-333333333333","date":"2026-10-01","workoutId":"11111111-1111-4111-8111-111111111111","workoutName":"Treino A","notes":"",
    "exercises":[{"exerciseId":"11111111-1111-4111-8111-1111111111e1","exerciseName":"Supino","sets":[{"setNumber":1,"load":70,"reps":8,"completed":true}]}]}}
]}$j$::jsonb);
select t.eq($$select count(*) from (select 1 where public.get_my_data() #>> '{workouts,0,exercises,0,muscleGroup}' = 'Peito' and public.get_my_data() #>> '{workouts,0,exercises,0,description}' = 'Pegada média') x$$, 1, 'N2a descrição e grupo muscular do exercício voltam');
-- renomear o exercício + atualizar o histórico na MESMA operação (o app envia as duas); o histórico fica ligado e com o nome novo
select public.apply_changeset($j${"ops":[
 {"k":"wex","a":"put","v":{"id":"11111111-1111-4111-8111-1111111111e1","workoutId":"11111111-1111-4111-8111-111111111111","name":"Supino reto","sets":4,"description":"Pegada média","muscleGroup":"Peito"}},
 {"k":"session","a":"put","v":{"id":"33333333-3333-4333-8333-333333333333","date":"2026-10-01","workoutId":"11111111-1111-4111-8111-111111111111","workoutName":"Treino A","notes":"",
    "exercises":[{"exerciseId":"11111111-1111-4111-8111-1111111111e1","exerciseName":"Supino reto","sets":[{"setNumber":1,"load":70,"reps":8,"completed":true}]}]}}
]}$j$::jsonb);
select t.eq($$select count(*) from public.session_exercises x join public.workout_exercises e on e.id = x.exercise_id and e.user_id = x.user_id where x.exercise_name = 'Supino reto' and e.name = 'Supino reto'$$, 1, 'N2b renomear exercício preserva o histórico (mesma sessão, séries e vínculo)');
select t.eq($$select count(*) from public.session_sets where load = 70 and reps = 8$$, 1, 'N2c cargas e repetições antigas intactas');

-- ===== alimento da biblioteca + refeições salvas =====
select public.apply_changeset($j${"ops":[
 {"k":"food","a":"put","v":{"id":"22222222-2222-4222-8222-222222222222","name":"Frango","portion":100,"unit":"g","calories":165,"protein":31,"carbs":0,"fat":3.6}},
 {"k":"smeal","a":"put","v":{"id":"44444444-4444-4444-8444-444444444444","name":"Almoço padrão","category":"almoco","favorite":true}},
 {"k":"sitem","a":"put","v":{"id":"55555555-5555-4555-8555-555555555555","savedMealId":"44444444-4444-4444-8444-444444444444","foodId":"22222222-2222-4222-8222-222222222222","name":"Frango","amount":150,"unit":"g","calories":247.5,"protein":46.5,"carbs":0,"fat":5.4}}
]}$j$::jsonb);
select t.eq($$select count(*) from (select 1 where public.get_my_data() #>> '{savedMeals,0,name}' = 'Almoço padrão' and (public.get_my_data() #>> '{savedMeals,0,favorite}')::boolean and (public.get_my_data() #>> '{savedMeals,0,items,0,amount}')::numeric = 150) x$$, 1, 'N3a refeição salva volta com itens, quantidade e favorita');
select public.apply_changeset($j${"ops":[{"k":"food","a":"del","id":"22222222-2222-4222-8222-222222222222"}]}$j$::jsonb);
select t.eq($$select count(*) from public.saved_meal_items where name='Frango' and food_id is null and calories = 247.5$$, 1, 'N3b apagar o alimento da biblioteca preserva a refeição salva (valores copiados)');
select t.fails($$select public.apply_changeset('{"ops":[{"k":"smeal","a":"put","v":{"id":"44444444-4444-4444-8444-444444444441","name":"x","category":"sobremesa"}}]}')$$, 'N3c categoria inválida recusada');
select t.fails($$select public.apply_changeset('{"ops":[{"k":"sitem","a":"put","v":{"id":"55555555-5555-4555-8555-555555555551","savedMealId":"44444444-4444-4444-8444-444444444444","name":"x","amount":0}}]}')$$, 'N3d quantidade zero recusada');
select public.apply_changeset($j${"ops":[{"k":"sitem","a":"del","id":"55555555-5555-4555-8555-555555555555"}]}$j$::jsonb);
select t.eq($$select count(*) from public.saved_meals$$, 1, 'N3e remover o último item não apaga o modelo (só o diário remove refeição vazia)');

-- ===== fotos: caminho próprio aceito, alheio descartado =====
select public.apply_changeset($j${"ops":[
 {"k":"food","a":"put","v":{"id":"22222222-2222-4222-8222-222222222223","name":"Ovo","portion":50,"unit":"g","calories":78,"protein":6,"carbs":0.6,"fat":5,"photo":"aaaaaaaa-0000-4000-8000-00000000000a/aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa.jpg"}},
 {"k":"smeal","a":"put","v":{"id":"44444444-4444-4444-8444-444444444445","name":"Com foto","category":"cafe","photo":"bbbbbbbb-0000-4000-8000-00000000000b/bbbbbbbb-1111-4111-8111-bbbbbbbbbbbb.jpg"}}
]}$j$::jsonb);
select t.eq($$select count(*) from public.foods where photo_path = 'aaaaaaaa-0000-4000-8000-00000000000a/aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa.jpg'$$, 1, 'N4a foto do próprio usuário é gravada');
select t.eq($$select count(*) from public.saved_meals where name = 'Com foto' and photo_path is null$$, 1, 'N4b caminho de foto de OUTRO usuário é descartado pela função');
select t.fails($$update public.foods set photo_path = 'bbbbbbbb-0000-4000-8000-00000000000b/bbbbbbbb-1111-4111-8111-bbbbbbbbbbbb.jpg'$$, 'N4c UPDATE direto com pasta de outro usuário viola a restrição');
select t.fails($$update public.foods set photo_path = '../etc/passwd'$$, 'N4d caminho fora do formato recusado');
select t.eq($$select count(*) from public.meals where photo_path is not null$$, 0, 'N4e (sanidade) sem fotos em refeições ainda');

-- ===== Storage: cada pessoa só mexe na própria pasta =====
insert into storage.buckets (id, name, public) values ('outro-bucket', 'outro-bucket', false);
select t.eq($$with i as (insert into storage.objects (bucket_id, name) values ('food-photos', 'aaaaaaaa-0000-4000-8000-00000000000a/aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa.jpg') returning 1) select count(*) from i$$, 1, 'N5a A grava na própria pasta do bucket');
select t.fails($$insert into storage.objects (bucket_id, name) values ('food-photos', 'bbbbbbbb-0000-4000-8000-00000000000b/bbbbbbbb-1111-4111-8111-bbbbbbbbbbbb.jpg')$$, 'N5b A não grava na pasta de B');
select t.fails($$insert into storage.objects (bucket_id, name) values ('outro-bucket', 'aaaaaaaa-0000-4000-8000-00000000000a/aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa.jpg')$$, 'N5c A não grava em outro bucket sem política');
select t.eq($$select count(*) from storage.objects where bucket_id = 'food-photos'$$, 1, 'N5d A lê a própria foto');
select t.login('bbbbbbbb-0000-4000-8000-00000000000b');
select t.eq($$select count(*) from storage.objects$$, 0, 'N5e B não enxerga a foto de A');
select t.eq($$with d as (delete from storage.objects returning 1) select count(*) from d$$, 0, 'N5f B não apaga a foto de A');
select t.eq($$with u as (update storage.objects set name = 'bbbbbbbb-0000-4000-8000-00000000000b/bbbbbbbb-1111-4111-8111-bbbbbbbbbbbb.jpg' returning 1) select count(*) from u$$, 0, 'N5g B não renomeia/move a foto de A');
select t.eq($$select count(*) from public.saved_meals$$, 0, 'N6a B não vê refeições salvas de A');
select t.eq($$select count(*) from public.saved_meal_items$$, 0, 'N6b B não vê itens de refeições salvas de A');
select t.fails($$insert into public.saved_meal_items (saved_meal_id, name, amount) values ('44444444-4444-4444-8444-444444444444', 'invasor', 10)$$, 'N6c B não pendura item na refeição salva de A (FK composta)');
select t.fails($$insert into public.saved_meals (user_id, name) values ('aaaaaaaa-0000-4000-8000-00000000000a', 'x')$$, 'N6d B não cria refeição salva em nome de A');
select t.eq($$with d as (delete from public.saved_meals returning 1) select count(*) from d$$, 0, 'N6e B não apaga refeições salvas de A');
select t.visitor();
select t.fails($$select * from public.saved_meals$$, 'N7a anon não lê saved_meals');
select t.fails($$select * from public.saved_meal_items$$, 'N7b anon não lê saved_meal_items');
select t.fails($$insert into storage.objects (bucket_id, name) values ('food-photos', 'aaaaaaaa-0000-4000-8000-00000000000a/aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa.jpg')$$, 'N7c anon não grava no bucket');
select t.fails($$select count(*) from storage.objects$$, 'N7d anon não lista fotos (sem acesso)');

select t.login('bbbbbbbb-0000-4000-8000-00000000000b');
select t.fails($$select public.apply_changeset('{"ops":[{"k":"sitem","a":"put","v":{"id":"55555555-5555-4555-8555-555555555598","savedMealId":"44444444-4444-4444-8444-444444444444","name":"invasor","amount":10}}]}')$$, 'N6g (confirmação) a FK composta barra o item mesmo via função') ;

-- ===== importação de backup com os campos novos (conta B) =====
select public.import_backup($j${
 "profile":{"weight":70,"calorieGoal":2500,"proteinGoal":140,"goalType":"lose","targetWeight":65,"calorieAdjust":-400,"goalPresets":{"lose":{"cal":2100,"prot":150,"carb":200,"fat":65}}},
 "workouts":[{"id":"w1","name":"Push","days":[1],"exercises":[{"id":"e1","name":"Supino","sets":3,"description":"Controle a descida","muscleGroup":"Peito"}]}],
 "workoutHistory":[],
 "foods":[{"id":"f1","name":"Arroz","portion":100,"unit":"g","calories":130,"protein":2.5,"carbs":28,"fat":0.3,"photo":"bbbbbbbb-0000-4000-8000-00000000000b/bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb.jpg"},{"id":"f2","name":"Roubado","portion":1,"unit":"un","calories":1,"protein":1,"carbs":1,"fat":1,"photo":"aaaaaaaa-0000-4000-8000-00000000000a/aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa.jpg"}],
 "meals":[{"id":"m1","date":"2026-10-02","mealType":"almoco","calories":130,"protein":2.5,"photo":"bbbbbbbb-0000-4000-8000-00000000000b/bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb.jpg","foods":[{"id":"i1","name":"Arroz","quantity":"100 g","calories":130,"protein":2.5,"carbs":28,"fat":0.3,"foodId":"f1","photo":"bbbbbbbb-0000-4000-8000-00000000000b/bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb.jpg"}]}],
 "weightHistory":[],
 "savedMeals":[{"id":"s1","name":"Marmita","category":"pos","favorite":true,"items":[{"id":"si1","foodId":"f1","name":"Arroz","amount":200,"unit":"g","calories":260,"protein":5,"carbs":56,"fat":0.6}]}]
}$j$::jsonb, 'merge');
select t.eq($$select count(*) from public.profiles where goal_type = 'lose' and target_weight = 65 and calorie_adjust = -400 and goal_presets #>> '{lose,cal}' = '2100'$$, 1, 'N8a importação em conta em branco aplica objetivo, peso desejado, ajuste e presets');
select t.eq($$select count(*) from public.foods where name = 'Arroz' and photo_path = 'bbbbbbbb-0000-4000-8000-00000000000b/bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb.jpg'$$, 1, 'N8b foto própria do backup é mantida');
select t.eq($$select count(*) from public.foods where name = 'Roubado' and photo_path is null$$, 1, 'N8c foto apontando para a pasta de outra conta é descartada na importação');
select t.eq($$select count(*) from public.meal_items where photo_path = 'bbbbbbbb-0000-4000-8000-00000000000b/bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb.jpg'$$, 1, 'N8d foto do item da refeição importada');
select t.eq($$select count(*) from public.saved_meals s join public.saved_meal_items i on i.saved_meal_id = s.id and i.user_id = s.user_id where s.name = 'Marmita' and s.category = 'pos' and i.amount = 200 and i.food_id is not null$$, 1, 'N8e refeição salva importada com item e vínculo à biblioteca');
select t.eq($$select count(*) from public.workout_exercises where muscle_group = 'Peito' and description = 'Controle a descida'$$, 1, 'N8f descrição/grupo muscular importados');
select public.import_backup(('{"profile":{"weight":1,"calorieGoal":1,"proteinGoal":1},"workouts":[],"workoutHistory":[],"foods":[],"meals":[],"weightHistory":[],"savedMeals":[]}')::jsonb, 'merge');
select t.eq($$select count(*) from public.saved_meals$$, 1, 'N8g repetir/mesclar não duplica nem apaga refeições salvas');
select t.fails($$select public.import_backup('{"workouts":[],"workoutHistory":[],"foods":[],"meals":[],"weightHistory":[],"savedMeals":{}}'::jsonb, 'merge')$$, 'N8h savedMeals que não é lista é recusado');
-- substituir: apaga o que existe e grava o arquivo (inclui refeições salvas)
select public.import_backup('{"profile":{"weight":71,"calorieGoal":2000,"proteinGoal":100},"workouts":[],"workoutHistory":[],"foods":[],"meals":[],"weightHistory":[],"savedMeals":[{"id":"s9","name":"Nova","category":"jantar","items":[]}]}'::jsonb, 'replace');
select t.eq($$select count(*) from public.saved_meals where name = 'Nova'$$, 1, 'N9a substituir troca as refeições salvas pelas do arquivo');
select t.eq($$select count(*) from public.saved_meals where name = 'Marmita'$$, 0, 'N9b … e remove as antigas');
select public.delete_all_my_data();
select t.eq($$select count(*) from public.saved_meals$$, 0, 'N9c apagar dados remove refeições salvas');
select t.eq($$select count(*) from public.profiles where goal_type = 'maintain' and target_weight is null and calorie_adjust = 0 and goal_presets = '{}'::jsonb$$, 1, 'N9d … e volta o objetivo ao padrão');
select t.login('aaaaaaaa-0000-4000-8000-00000000000a');
select t.eq($$select count(*) from public.saved_meals where name = 'Almoço padrão'$$, 1, 'N9e dados de A intactos após tudo o que B fez');
select t.eq($$select count(*) from storage.objects where bucket_id = 'food-photos'$$, 1, 'N9f foto de A intacta');
select t.admin();
select t.eq($$select count(*) from pg_tables where schemaname = 'public' and not rowsecurity$$, 0, 'N10a todas as tabelas (inclusive as novas) com RLS');
select t.eq($$select count(*) from pg_tables tt where schemaname = 'public' and (select count(distinct cmd) from pg_policies p where p.schemaname = 'public' and p.tablename = tt.tablename) < 4$$, 0, 'N10b todas com políticas de SELECT/INSERT/UPDATE/DELETE');
select t.eq($$select count(*) from information_schema.role_table_grants where table_schema = 'public' and grantee in ('anon','PUBLIC')$$, 0, 'N10c anon/PUBLIC sem permissão em tabelas');
select t.eq($$select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like 'food_photos_%'$$, 4, 'N10d 4 políticas do bucket de fotos');
select t.eq($$select count(*) from storage.buckets where id = 'food-photos' and not public and file_size_limit = 1048576$$, 1, 'N10e bucket privado com limite de 1 MB');
rollback;
