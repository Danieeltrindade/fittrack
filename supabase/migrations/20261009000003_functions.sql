-- FitTrack · migração 3/3 · FUNÇÕES (RPC) usadas pelo site
-- Todas são SECURITY INVOKER: rodam com as permissões do usuário logado, portanto o RLS continua valendo.
-- Cada função é UMA transação (tudo ou nada). Nenhuma recebe user_id do cliente: o dono é sempre auth.uid().
-- search_path vazio + nomes qualificados (boa prática contra sequestro de search_path).

-- ---------------------------------------------------------------- auxiliares puros (sem acesso a tabelas)
-- ID determinístico para importações: o mesmo ID antigo, na mesma conta, sempre gera o mesmo UUID → importar de novo não duplica.
create function public.rekey(p_uid uuid, p_kind text, p_legacy text) returns uuid
language sql immutable strict set search_path = ''
as $$ select md5(p_uid::text || ':' || p_kind || ':' || p_legacy)::uuid $$;

-- Converte texto em uuid ou devolve NULL (referências inválidas viram "sem vínculo").
create function public.try_uuid(p text) returns uuid
language plpgsql immutable set search_path = ''
as $$ begin return p::uuid; exception when others then return null; end $$;

-- ---------------------------------------------------------------- leitura: todos os dados da conta no formato do app
create function public.get_my_data() returns jsonb
language plpgsql security invoker set search_path = ''
as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  insert into public.profiles (user_id) values (uid) on conflict (user_id) do nothing;   -- autocorreção se faltar o perfil

  return jsonb_build_object(
    'schemaVersion', 2,
    'profile', (select jsonb_strip_nulls(jsonb_build_object(
        'weight', pr.weight, 'calorieGoal', pr.calorie_goal, 'proteinGoal', pr.protein_goal,
        'fatGoal', pr.fat_goal, 'carbGoal', pr.carb_goal, 'waterGoalMl', pr.water_goal_ml,
        'appearance', jsonb_build_object('theme', pr.theme, 'accent', pr.accent)))
      from public.profiles pr where pr.user_id = uid),
    'workouts', coalesce((select jsonb_agg(jsonb_build_object(
        'id', w.id, 'name', w.name, 'days', to_jsonb(w.days),
        'exercises', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'name', e.name, 'sets', e.sets) order by e.position, e.created_at)
                               from public.workout_exercises e where e.user_id = uid and e.workout_id = w.id), '[]'::jsonb))
        order by w.position, w.created_at)
      from public.workouts w where w.user_id = uid), '[]'::jsonb),
    'workoutHistory', coalesce((select jsonb_agg(jsonb_build_object(
        'id', s.id, 'date', s.session_date, 'workoutId', s.workout_id, 'workoutName', s.workout_name, 'notes', s.notes,
        'exercises', coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
              'exerciseId', x.exercise_id, 'exerciseName', x.exercise_name, 'note', x.note,
              'sets', coalesce((select jsonb_agg(jsonb_build_object('setNumber', t.set_number, 'load', t.load, 'reps', t.reps, 'completed', t.completed) order by t.set_number, t.id)
                                from public.session_sets t where t.user_id = uid and t.session_exercise_id = x.id), '[]'::jsonb)))
              order by x.position)
            from public.session_exercises x where x.user_id = uid and x.session_id = s.id), '[]'::jsonb))
        order by s.session_date, s.created_at)
      from public.workout_sessions s where s.user_id = uid), '[]'::jsonb),
    'foods', coalesce((select jsonb_agg(jsonb_build_object(
        'id', f.id, 'name', f.name, 'portion', f.portion, 'unit', f.unit,
        'calories', f.calories, 'protein', f.protein, 'carbs', f.carbs, 'fat', f.fat) order by f.created_at, f.id)
      from public.foods f where f.user_id = uid), '[]'::jsonb),
    'meals', coalesce((select jsonb_agg(jsonb_build_object(
        'id', m.id, 'date', m.meal_date, 'mealType', m.meal_type, 'calories', m.calories, 'protein', m.protein,
        'foods', coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
              'id', i.id, 'name', i.name, 'quantity', i.quantity, 'calories', i.calories, 'protein', i.protein,
              'carbs', i.carbs, 'fat', i.fat, 'foodId', i.food_id)) order by i.position, i.created_at)
            from public.meal_items i where i.user_id = uid and i.meal_id = m.id), '[]'::jsonb))
        order by m.meal_date, m.created_at)
      from public.meals m where m.user_id = uid), '[]'::jsonb),
    'weightHistory', coalesce((select jsonb_agg(jsonb_build_object('id', h.id, 'date', h.entry_date, 'weight', h.weight) order by h.entry_date, h.created_at)
      from public.weight_history h where h.user_id = uid), '[]'::jsonb),
    'hydration', coalesce((select jsonb_agg(jsonb_build_object(
        'id', y.id, 'date', y.entry_date, 'time', to_char(y.entry_time, 'HH24:MI'), 'amount', y.amount_ml) order by y.entry_date, y.entry_time, y.created_at)
      from public.hydration y where y.user_id = uid), '[]'::jsonb),
    'legacyImported', coalesce((select jsonb_agg(l.source_hash) from public.legacy_imports l where l.user_id = uid), '[]'::jsonb)
  );
end $$;

-- ---------------------------------------------------------------- escrita incremental (uma transação)
-- p = {"ops":[{"k":"<tipo>","a":"put|del","v":{...}|"id":"uuid"}]}   tipos:
--   profile  (put parcial: só os campos enviados)      workout / wex (exercício do treino)     food
--   session  (agregado: substitui exercícios e séries) meal (cabeçalho) / item (alimento da refeição)   weight   water
-- Granularidade fina de propósito: adicionar um item numa refeição, ou um exercício num treino, envia SÓ aquela linha.
-- Assim uma tela desatualizada (outra aba/aparelho) nunca apaga o que outra tela gravou.
-- Totais da refeição são recalculados AQUI a partir dos itens; refeição sem itens é removida. Posição de linhas novas
-- é atribuída aqui (sempre no fim). user_id nunca vem do cliente.
create function public.apply_changeset(p jsonb) returns jsonb
language plpgsql security invoker set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  o record; x record;
  k text; a text; v jsonb; vid uuid; xid uuid; mid uuid; n integer := 0;
  touched uuid[] := '{}';
begin
  if uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if p is null or jsonb_typeof(p -> 'ops') is distinct from 'array' then
    raise exception 'invalid_changeset' using errcode = '22023';
  end if;
  if jsonb_array_length(p -> 'ops') > 20000 then raise exception 'changeset_too_large' using errcode = '22023'; end if;

  for o in
    select op.value as op, op.ord,
      case op.value ->> 'a'
        when 'put' then case op.value ->> 'k' when 'profile' then 1 when 'workout' then 2 when 'wex' then 3 when 'food' then 4
                          when 'session' then 5 when 'meal' then 6 when 'item' then 7 when 'weight' then 8 when 'water' then 9 else 99 end
        when 'del' then case op.value ->> 'k' when 'session' then 11 when 'item' then 12 when 'meal' then 13 when 'weight' then 14
                          when 'water' then 15 when 'wex' then 16 when 'workout' then 17 when 'food' then 18 else 99 end
        else 99 end as rank
    from jsonb_array_elements(p -> 'ops') with ordinality as op(value, ord)
    order by rank, ord
  loop
    if o.rank = 99 then raise exception 'invalid_op' using errcode = '22023'; end if;
    k := o.op ->> 'k'; a := o.op ->> 'a'; v := o.op -> 'v';

    if a = 'del' then
      vid := (o.op ->> 'id')::uuid;
      case k
        when 'session'  then delete from public.workout_sessions where user_id = uid and id = vid;
        when 'meal'     then delete from public.meals            where user_id = uid and id = vid;
        when 'item'     then
          delete from public.meal_items where user_id = uid and id = vid returning meal_id into mid;
          if mid is not null then touched := touched || mid; end if;
        when 'weight'   then delete from public.weight_history   where user_id = uid and id = vid;
        when 'water'    then delete from public.hydration        where user_id = uid and id = vid;
        when 'wex'      then delete from public.workout_exercises where user_id = uid and id = vid;
        when 'workout'  then delete from public.workouts         where user_id = uid and id = vid;
        when 'food'     then delete from public.foods            where user_id = uid and id = vid;
      end case;

    elsif k = 'profile' then
      insert into public.profiles (user_id) values (uid) on conflict (user_id) do nothing;
      update public.profiles set
        weight        = case when v ? 'weight'       then coalesce((v ->> 'weight')::numeric, 0) else weight end,
        calorie_goal  = case when v ? 'calorieGoal'  then coalesce(round((v ->> 'calorieGoal')::numeric)::integer, 0) else calorie_goal end,
        protein_goal  = case when v ? 'proteinGoal'  then coalesce(round((v ->> 'proteinGoal')::numeric)::integer, 0) else protein_goal end,
        fat_goal      = case when v ? 'fatGoal'      then round((v ->> 'fatGoal')::numeric)::integer else fat_goal end,
        carb_goal     = case when v ? 'carbGoal'     then round((v ->> 'carbGoal')::numeric)::integer else carb_goal end,
        water_goal_ml = case when v ? 'waterGoalMl'  then round((v ->> 'waterGoalMl')::numeric)::integer else water_goal_ml end,
        theme         = coalesce(v #>> '{appearance,theme}', theme),
        accent        = coalesce(v #>> '{appearance,accent}', accent)
      where user_id = uid;

    elsif k = 'workout' then
      insert into public.workouts (id, user_id, name, days, position)
      values ((v ->> 'id')::uuid, uid, v ->> 'name',
        coalesce(array(select distinct d.value::smallint from jsonb_array_elements_text(coalesce(v -> 'days', '[]'::jsonb)) as d(value) order by 1), '{}'),
        (select coalesce(max(w.position) + 1, 0) from public.workouts w where w.user_id = uid))
      on conflict (user_id, id) do update set name = excluded.name, days = excluded.days;

    elsif k = 'wex' then
      insert into public.workout_exercises (id, user_id, workout_id, name, sets, position)
      values ((v ->> 'id')::uuid, uid, (v ->> 'workoutId')::uuid, v ->> 'name', coalesce(round((v ->> 'sets')::numeric)::integer, 3),
        (select coalesce(max(e.position) + 1, 0) from public.workout_exercises e where e.user_id = uid and e.workout_id = (v ->> 'workoutId')::uuid))
      on conflict (user_id, id) do update set name = excluded.name, sets = excluded.sets;

    elsif k = 'food' then
      insert into public.foods (id, user_id, name, portion, unit, calories, protein, carbs, fat)
      values ((v ->> 'id')::uuid, uid, v ->> 'name', (v ->> 'portion')::numeric, v ->> 'unit',
        coalesce((v ->> 'calories')::numeric, 0), coalesce((v ->> 'protein')::numeric, 0),
        coalesce((v ->> 'carbs')::numeric, 0), coalesce((v ->> 'fat')::numeric, 0))
      on conflict (user_id, id) do update set name = excluded.name, portion = excluded.portion, unit = excluded.unit,
        calories = excluded.calories, protein = excluded.protein, carbs = excluded.carbs, fat = excluded.fat;

    elsif k = 'session' then
      vid := (v ->> 'id')::uuid;
      insert into public.workout_sessions (id, user_id, workout_id, workout_name, session_date, notes)
      values (vid, uid,
        (select w.id from public.workouts w where w.user_id = uid and w.id = public.try_uuid(v ->> 'workoutId')),   -- referência alheia/inexistente vira NULL
        v ->> 'workoutName', (v ->> 'date')::date, coalesce(v ->> 'notes', ''))
      on conflict (user_id, id) do update set workout_id = excluded.workout_id, workout_name = excluded.workout_name,
        session_date = excluded.session_date, notes = excluded.notes;
      delete from public.session_exercises where user_id = uid and session_id = vid;       -- séries saem em cascata
      for x in select e.value, e.ord from jsonb_array_elements(coalesce(v -> 'exercises', '[]'::jsonb)) with ordinality as e(value, ord) loop
        xid := gen_random_uuid();
        insert into public.session_exercises (id, user_id, session_id, exercise_id, exercise_name, note, position)
        values (xid, uid, vid,
          (select we.id from public.workout_exercises we where we.user_id = uid and we.id = public.try_uuid(x.value ->> 'exerciseId')),
          x.value ->> 'exerciseName', nullif(x.value ->> 'note', ''), (x.ord - 1)::integer);
        insert into public.session_sets (user_id, session_exercise_id, set_number, load, reps, completed)
        select uid, xid, (s.value ->> 'setNumber')::integer, coalesce((s.value ->> 'load')::numeric, 0),
               coalesce(round((s.value ->> 'reps')::numeric)::integer, 0), coalesce((s.value ->> 'completed')::boolean, false)
          from jsonb_array_elements(coalesce(x.value -> 'sets', '[]'::jsonb)) as s(value);
      end loop;

    elsif k = 'meal' then
      vid := (v ->> 'id')::uuid;
      insert into public.meals (id, user_id, meal_date, meal_type)
      values (vid, uid, (v ->> 'date')::date, v ->> 'mealType')
      on conflict (user_id, id) do update set meal_date = excluded.meal_date, meal_type = excluded.meal_type;
      touched := touched || vid;

    elsif k = 'item' then
      mid := (v ->> 'mealId')::uuid;
      insert into public.meal_items (id, user_id, meal_id, food_id, name, quantity, calories, protein, carbs, fat, position)
      values ((v ->> 'id')::uuid, uid, mid,
        (select fo.id from public.foods fo where fo.user_id = uid and fo.id = public.try_uuid(v ->> 'foodId')),
        v ->> 'name', coalesce(v ->> 'quantity', ''),
        coalesce((v ->> 'calories')::numeric, 0), coalesce((v ->> 'protein')::numeric, 0),
        coalesce((v ->> 'carbs')::numeric, 0), coalesce((v ->> 'fat')::numeric, 0),
        (select coalesce(max(i.position) + 1, 0) from public.meal_items i where i.user_id = uid and i.meal_id = mid))
      on conflict (user_id, id) do update set meal_id = excluded.meal_id, food_id = excluded.food_id, name = excluded.name,
        quantity = excluded.quantity, calories = excluded.calories, protein = excluded.protein, carbs = excluded.carbs, fat = excluded.fat;
      touched := touched || mid;

    elsif k = 'weight' then
      insert into public.weight_history (id, user_id, entry_date, weight)
      values ((v ->> 'id')::uuid, uid, (v ->> 'date')::date, (v ->> 'weight')::numeric)
      on conflict (user_id, id) do update set entry_date = excluded.entry_date, weight = excluded.weight;

    elsif k = 'water' then
      insert into public.hydration (id, user_id, entry_date, entry_time, amount_ml)
      values ((v ->> 'id')::uuid, uid, (v ->> 'date')::date, (v ->> 'time')::time, round((v ->> 'amount')::numeric)::integer)
      on conflict (user_id, id) do update set entry_date = excluded.entry_date, entry_time = excluded.entry_time, amount_ml = excluded.amount_ml;
    end if;
    n := n + 1;
  end loop;

  -- refeições tocadas: totais vêm dos itens; sem itens, a refeição some
  if array_length(touched, 1) is not null then
    update public.meals m set
      calories = coalesce((select sum(i.calories) from public.meal_items i where i.user_id = uid and i.meal_id = m.id), 0),
      protein  = coalesce((select sum(i.protein)  from public.meal_items i where i.user_id = uid and i.meal_id = m.id), 0)
    where m.user_id = uid and m.id = any (touched);
    delete from public.meals m
     where m.user_id = uid and m.id = any (touched)
       and not exists (select 1 from public.meal_items i where i.user_id = uid and i.meal_id = m.id);
  end if;

  return jsonb_build_object('applied', n);
end $$;

-- ---------------------------------------------------------------- importação (backup .json e migração do armazenamento antigo)
-- p_mode 'replace': apaga os dados da conta e grava o conteúdo do arquivo (importar backup).
-- p_mode 'merge'  : acrescenta sem tocar no que já existe (IDs determinísticos + ON CONFLICT DO NOTHING). O perfil só é
--                   aplicado se ainda estiver "em branco". Repetir a mesma chamada não duplica nada.
--                   O registro de "migração concluída" é feito à parte (mark_legacy_import), DEPOIS da conferência no app.
-- ATÔMICA: é uma única função/transação; qualquer erro desfaz tudo (nada fica pela metade).
-- O arquivo NÃO controla a identidade: user_id nunca vem do arquivo e IDs do arquivo são recodificados por conta.
create function public.import_backup(p jsonb, p_mode text default 'merge') returns jsonb
language plpgsql security invoker set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  pr jsonb; pristine boolean := false; applied boolean := false; arr text; res jsonb;
begin
  if uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if p_mode not in ('merge', 'replace') then raise exception 'invalid_mode' using errcode = '22023'; end if;
  if jsonb_typeof(p) is distinct from 'object' then raise exception 'invalid_backup' using errcode = '22023'; end if;
  foreach arr in array array['workouts', 'workoutHistory', 'foods', 'meals', 'weightHistory'] loop
    if jsonb_typeof(p -> arr) is distinct from 'array' then raise exception 'invalid_backup: %', arr using errcode = '22023'; end if;
  end loop;
  if p ? 'hydration' and jsonb_typeof(p -> 'hydration') is distinct from 'array' then raise exception 'invalid_backup: hydration' using errcode = '22023'; end if;
  insert into public.profiles (user_id) values (uid) on conflict (user_id) do nothing;

  if p_mode = 'replace' then
    delete from public.workout_sessions where user_id = uid;
    delete from public.meals            where user_id = uid;
    delete from public.weight_history   where user_id = uid;
    delete from public.hydration        where user_id = uid;
    delete from public.workouts         where user_id = uid;
    delete from public.foods            where user_id = uid;
    pristine := true;
  else
    select (pr0.weight = 0 and pr0.calorie_goal = 0 and pr0.protein_goal = 0 and pr0.fat_goal is null and pr0.carb_goal is null and pr0.water_goal_ml is null)
      into pristine from public.profiles pr0 where pr0.user_id = uid;
  end if;

  pr := p -> 'profile';
  if pristine and jsonb_typeof(pr) = 'object' then
    update public.profiles set
      weight        = coalesce((pr ->> 'weight')::numeric, 0),
      calorie_goal  = coalesce(round((pr ->> 'calorieGoal')::numeric)::integer, 0),
      protein_goal  = coalesce(round((pr ->> 'proteinGoal')::numeric)::integer, 0),
      fat_goal      = round((pr ->> 'fatGoal')::numeric)::integer,
      carb_goal     = round((pr ->> 'carbGoal')::numeric)::integer,
      water_goal_ml = round((pr ->> 'waterGoalMl')::numeric)::integer,
      theme         = coalesce(pr #>> '{appearance,theme}', theme),
      accent        = coalesce(pr #>> '{appearance,accent}', accent)
    where user_id = uid;
    applied := true;
  end if;

  insert into public.workouts (id, user_id, name, days, position)
  select public.rekey(uid, 'workout', w.value ->> 'id'), uid, w.value ->> 'name',
         coalesce(array(select distinct d.value::smallint from jsonb_array_elements_text(coalesce(w.value -> 'days', '[]'::jsonb)) as d(value) order by 1), '{}'),
         (w.ord - 1)::integer
    from jsonb_array_elements(p -> 'workouts') with ordinality as w(value, ord)
  on conflict (user_id, id) do nothing;

  insert into public.workout_exercises (id, user_id, workout_id, name, sets, position)
  select public.rekey(uid, 'wex', (w.value ->> 'id') || ':' || (e.value ->> 'id')), uid, public.rekey(uid, 'workout', w.value ->> 'id'),
         e.value ->> 'name', coalesce(round((e.value ->> 'sets')::numeric)::integer, 3), (e.ord - 1)::integer
    from jsonb_array_elements(p -> 'workouts') as w(value),
         jsonb_array_elements(coalesce(w.value -> 'exercises', '[]'::jsonb)) with ordinality as e(value, ord)
  on conflict (user_id, id) do nothing;

  insert into public.foods (id, user_id, name, portion, unit, calories, protein, carbs, fat)
  select public.rekey(uid, 'food', f.value ->> 'id'), uid, f.value ->> 'name', (f.value ->> 'portion')::numeric, f.value ->> 'unit',
         coalesce((f.value ->> 'calories')::numeric, 0), coalesce((f.value ->> 'protein')::numeric, 0),
         coalesce((f.value ->> 'carbs')::numeric, 0), coalesce((f.value ->> 'fat')::numeric, 0)
    from jsonb_array_elements(p -> 'foods') as f(value)
  on conflict (user_id, id) do nothing;

  insert into public.workout_sessions (id, user_id, workout_id, workout_name, session_date, notes)
  select public.rekey(uid, 'session', h.value ->> 'id'), uid,
         (select w.id from public.workouts w where w.user_id = uid and w.id = public.rekey(uid, 'workout', h.value ->> 'workoutId')),
         h.value ->> 'workoutName', (h.value ->> 'date')::date, coalesce(h.value ->> 'notes', '')
    from jsonb_array_elements(p -> 'workoutHistory') as h(value)
  on conflict (user_id, id) do nothing;

  insert into public.session_exercises (id, user_id, session_id, exercise_id, exercise_name, note, position)
  select public.rekey(uid, 'sx', (h.value ->> 'id') || ':' || (x.ord - 1)), uid, public.rekey(uid, 'session', h.value ->> 'id'),
         (select we.id from public.workout_exercises we where we.user_id = uid and we.id = public.rekey(uid, 'wex', (h.value ->> 'workoutId') || ':' || (x.value ->> 'exerciseId'))),
         x.value ->> 'exerciseName', nullif(x.value ->> 'note', ''), (x.ord - 1)::integer
    from jsonb_array_elements(p -> 'workoutHistory') as h(value),
         jsonb_array_elements(coalesce(h.value -> 'exercises', '[]'::jsonb)) with ordinality as x(value, ord)
  on conflict (user_id, id) do nothing;

  insert into public.session_sets (id, user_id, session_exercise_id, set_number, load, reps, completed)
  select public.rekey(uid, 'ss', (h.value ->> 'id') || ':' || (x.ord - 1) || ':' || (s.ord - 1)), uid,
         public.rekey(uid, 'sx', (h.value ->> 'id') || ':' || (x.ord - 1)),
         (s.value ->> 'setNumber')::integer, coalesce((s.value ->> 'load')::numeric, 0),
         coalesce(round((s.value ->> 'reps')::numeric)::integer, 0), coalesce((s.value ->> 'completed')::boolean, false)
    from jsonb_array_elements(p -> 'workoutHistory') as h(value),
         jsonb_array_elements(coalesce(h.value -> 'exercises', '[]'::jsonb)) with ordinality as x(value, ord),
         jsonb_array_elements(coalesce(x.value -> 'sets', '[]'::jsonb)) with ordinality as s(value, ord)
  on conflict (user_id, id) do nothing;

  insert into public.meals (id, user_id, meal_date, meal_type, calories, protein)
  select public.rekey(uid, 'meal', m.value ->> 'id'), uid, (m.value ->> 'date')::date, m.value ->> 'mealType',
         coalesce((m.value ->> 'calories')::numeric, 0), coalesce((m.value ->> 'protein')::numeric, 0)
    from jsonb_array_elements(p -> 'meals') as m(value)
  on conflict (user_id, id) do nothing;

  insert into public.meal_items (id, user_id, meal_id, food_id, name, quantity, calories, protein, carbs, fat, position)
  select public.rekey(uid, 'item', i.value ->> 'id'), uid, public.rekey(uid, 'meal', m.value ->> 'id'),
         (select fo.id from public.foods fo where fo.user_id = uid and fo.id = public.rekey(uid, 'food', i.value ->> 'foodId')),
         i.value ->> 'name', coalesce(i.value ->> 'quantity', ''),
         coalesce((i.value ->> 'calories')::numeric, 0), coalesce((i.value ->> 'protein')::numeric, 0),
         coalesce((i.value ->> 'carbs')::numeric, 0), coalesce((i.value ->> 'fat')::numeric, 0), (i.ord - 1)::integer
    from jsonb_array_elements(p -> 'meals') as m(value),
         jsonb_array_elements(coalesce(m.value -> 'foods', '[]'::jsonb)) with ordinality as i(value, ord)
  on conflict (user_id, id) do nothing;

  insert into public.weight_history (id, user_id, entry_date, weight)
  select public.rekey(uid, 'weight', w.value ->> 'id'), uid, (w.value ->> 'date')::date, (w.value ->> 'weight')::numeric
    from jsonb_array_elements(p -> 'weightHistory') as w(value)
  on conflict (user_id, id) do nothing;

  insert into public.hydration (id, user_id, entry_date, entry_time, amount_ml)
  select public.rekey(uid, 'water', y.value ->> 'id'), uid, (y.value ->> 'date')::date, (y.value ->> 'time')::time,
         round((y.value ->> 'amount')::numeric)::integer
    from jsonb_array_elements(coalesce(p -> 'hydration', '[]'::jsonb)) as y(value)
  on conflict (user_id, id) do nothing;

  -- Conferência: quantas linhas do arquivo EXISTEM agora na conta (o app compara com a contagem do arquivo).
  res := jsonb_build_object(
    'already', false, 'profile', applied,
    'workouts',  (select count(*) from public.workouts w where w.user_id = uid and w.id in (select public.rekey(uid, 'workout', x.value ->> 'id') from jsonb_array_elements(p -> 'workouts') x)),
    'exercises', (select count(*) from public.workout_exercises e where e.user_id = uid and e.id in (select public.rekey(uid, 'wex', (x.value ->> 'id') || ':' || (ee.value ->> 'id')) from jsonb_array_elements(p -> 'workouts') x, jsonb_array_elements(coalesce(x.value -> 'exercises', '[]'::jsonb)) ee)),
    'foods',     (select count(*) from public.foods f where f.user_id = uid and f.id in (select public.rekey(uid, 'food', x.value ->> 'id') from jsonb_array_elements(p -> 'foods') x)),
    'sessions',  (select count(*) from public.workout_sessions s where s.user_id = uid and s.id in (select public.rekey(uid, 'session', x.value ->> 'id') from jsonb_array_elements(p -> 'workoutHistory') x)),
    'sets',      (select count(*) from public.session_sets t where t.user_id = uid and t.id in (select public.rekey(uid, 'ss', (h.value ->> 'id') || ':' || (xx.ord - 1) || ':' || (s.ord - 1)) from jsonb_array_elements(p -> 'workoutHistory') h, jsonb_array_elements(coalesce(h.value -> 'exercises', '[]'::jsonb)) with ordinality xx(value, ord), jsonb_array_elements(coalesce(xx.value -> 'sets', '[]'::jsonb)) with ordinality s(value, ord))),
    'meals',     (select count(*) from public.meals m where m.user_id = uid and m.id in (select public.rekey(uid, 'meal', x.value ->> 'id') from jsonb_array_elements(p -> 'meals') x)),
    'items',     (select count(*) from public.meal_items i where i.user_id = uid and i.id in (select public.rekey(uid, 'item', ii.value ->> 'id') from jsonb_array_elements(p -> 'meals') x, jsonb_array_elements(coalesce(x.value -> 'foods', '[]'::jsonb)) ii)),
    'weights',   (select count(*) from public.weight_history w where w.user_id = uid and w.id in (select public.rekey(uid, 'weight', x.value ->> 'id') from jsonb_array_elements(p -> 'weightHistory') x)),
    'water',     (select count(*) from public.hydration y where y.user_id = uid and y.id in (select public.rekey(uid, 'water', x.value ->> 'id') from jsonb_array_elements(coalesce(p -> 'hydration', '[]'::jsonb)) x))
  );

  return res;
end $$;

-- ---------------------------------------------------------------- marca a migração do armazenamento antigo como concluída
-- Chamada pelo app só depois de conferir que tudo foi gravado. p_key = SHA-256 (hex) do texto original.
create function public.mark_legacy_import(p_key text, p_summary jsonb default '{}'::jsonb) returns jsonb
language plpgsql security invoker set search_path = ''
as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if p_key is null or p_key !~ '^[0-9a-f]{64}$' then raise exception 'invalid_key' using errcode = '22023'; end if;
  insert into public.legacy_imports (user_id, source_hash, summary) values (uid, p_key, coalesce(p_summary, '{}'::jsonb))
  on conflict (user_id, source_hash) do nothing;
  return jsonb_build_object('ok', true);
end $$;

-- ---------------------------------------------------------------- apagar todos os dados da própria conta (botão "Apagar dados")
-- Não apaga o login (isso exige a chave de serviço e não existe no site). Zera metas e remove marcadores de migração.
create function public.delete_all_my_data() returns jsonb
language plpgsql security invoker set search_path = ''
as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  delete from public.workout_sessions where user_id = uid;
  delete from public.meals            where user_id = uid;
  delete from public.weight_history   where user_id = uid;
  delete from public.hydration        where user_id = uid;
  delete from public.workouts         where user_id = uid;
  delete from public.foods            where user_id = uid;
  delete from public.legacy_imports   where user_id = uid;
  update public.profiles set weight = 0, calorie_goal = 0, protein_goal = 0, fat_goal = null, carb_goal = null, water_goal_ml = null
   where user_id = uid;
  return jsonb_build_object('ok', true);
end $$;

-- ---------------------------------------------------------------- permissões das funções
-- Por padrão o Postgres libera EXECUTE para todos (PUBLIC): revogamos e liberamos só para usuários logados.
revoke all on function public.rekey(uuid, text, text)           from public, anon;
revoke all on function public.try_uuid(text)                     from public, anon;
revoke all on function public.get_my_data()                      from public, anon;
revoke all on function public.apply_changeset(jsonb)             from public, anon;
revoke all on function public.import_backup(jsonb, text)         from public, anon;
revoke all on function public.mark_legacy_import(text, jsonb)    from public, anon;
revoke all on function public.delete_all_my_data()               from public, anon;
revoke all on function public.forbid_owner_change()              from public, anon, authenticated;
revoke all on function public.touch_updated_at()                 from public, anon, authenticated;
grant execute on function public.rekey(uuid, text, text)         to authenticated;
grant execute on function public.try_uuid(text)                  to authenticated;
grant execute on function public.get_my_data()                   to authenticated;
grant execute on function public.apply_changeset(jsonb)          to authenticated;
grant execute on function public.import_backup(jsonb, text)       to authenticated;
grant execute on function public.mark_legacy_import(text, jsonb)  to authenticated;
grant execute on function public.delete_all_my_data()            to authenticated;
