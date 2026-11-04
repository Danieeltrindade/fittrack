-- FitTrack · migração 4 · OBJETIVOS/METAS, REFEIÇÕES SALVAS, DESCRIÇÃO DE EXERCÍCIOS E FOTOS
-- ADITIVA E SEGURA: só adiciona colunas, tabelas, um bucket privado e políticas. NADA é apagado, renomeado ou reescrito;
-- seus dados atuais continuam como estão (as novas colunas recebem valores padrão). Pode ser rodada de novo sem efeito colateral.
-- Rode DEPOIS das migrações 1, 2 e 3, no SQL Editor do Supabase (ver README).

-- ---------------------------------------------------------------- perfil: objetivo e metas por objetivo
-- calorie_goal/protein_goal/fat_goal/carb_goal continuam sendo as metas ATIVAS (nada muda para quem já usa).
-- goal_presets guarda sugestões por objetivo {lose|maintain|gain: {cal,prot,carb,fat}}; aplicar uma delas às metas ativas exige confirmação no app.
alter table public.profiles add column if not exists goal_type      text    not null default 'maintain';
alter table public.profiles add column if not exists target_weight  numeric;
alter table public.profiles add column if not exists calorie_adjust integer not null default 0;
alter table public.profiles add column if not exists goal_presets   jsonb   not null default '{}'::jsonb;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_goal_type_chk') then
    alter table public.profiles add constraint profiles_goal_type_chk check (goal_type in ('lose','maintain','gain'));
    alter table public.profiles add constraint profiles_target_weight_chk check (target_weight is null or (target_weight > 0 and target_weight <= 700));
    alter table public.profiles add constraint profiles_calorie_adjust_chk check (calorie_adjust between -5000 and 5000);
    alter table public.profiles add constraint profiles_goal_presets_chk check (jsonb_typeof(goal_presets) = 'object' and octet_length(goal_presets::text) <= 4000);
  end if;
end $$;

-- ---------------------------------------------------------------- exercícios: descrição e grupo muscular
alter table public.workout_exercises add column if not exists description  text check (description  is null or char_length(description)  <= 2000);
alter table public.workout_exercises add column if not exists muscle_group text check (muscle_group is null or char_length(muscle_group) <= 60);

-- ---------------------------------------------------------------- fotos (caminho do arquivo no Storage; o arquivo fica no bucket privado)
-- O caminho SEMPRE começa com o id do dono: <user_id>/<uuid>.jpg — o banco recusa um caminho que aponte para a pasta de outra pessoa.
alter table public.foods       add column if not exists photo_path text;
alter table public.meals       add column if not exists photo_path text;
alter table public.meal_items  add column if not exists photo_path text;
do $$
declare t text;
begin
  foreach t in array array['foods','meals','meal_items'] loop
    if not exists (select 1 from pg_constraint where conname = t || '_photo_chk') then
      execute format($f$alter table public.%I add constraint %I check (photo_path is null or (photo_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.jpg$' and substr(photo_path, 1, 36) = user_id::text))$f$, t, t || '_photo_chk');
    end if;
  end loop;
end $$;

-- devolve o caminho só se for da pasta do próprio usuário (usado pelas funções; caminho alheio vira "sem foto")
create or replace function public.own_photo(p_uid uuid, p text) returns text
language sql immutable set search_path = ''
as $$ select case when p ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.jpg$' and substr(p, 1, 36) = p_uid::text then p else null end $$;

-- ---------------------------------------------------------------- refeições salvas (modelos reutilizáveis)
create table if not exists public.saved_meals (
  id          uuid not null default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null check (char_length(btrim(name)) between 1 and 200),
  category    text not null default 'almoco' check (category in ('cafe','almoco','lanche','pre','pos','jantar','ceia','outras')),
  favorite    boolean not null default false,
  photo_path  text,
  position    integer not null default 0,
  created_at  timestamptz not null default now(),
  primary key (user_id, id),
  constraint saved_meals_photo_chk check (photo_path is null or (photo_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.jpg$' and substr(photo_path, 1, 36) = user_id::text))
);
-- Os valores dos itens são CÓPIAS para a quantidade indicada (amount + unit): ajustar a quantidade ao adicionar ao diário é proporcional.
create table if not exists public.saved_meal_items (
  id             uuid not null default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  saved_meal_id  uuid not null,
  food_id        uuid,
  name           text not null check (char_length(btrim(name)) between 1 and 200),
  amount         numeric not null check (amount > 0 and amount <= 100000),
  unit           text not null default 'g' check (char_length(btrim(unit)) between 1 and 40),
  calories       numeric not null default 0 check (calories between 0 and 100000),
  protein        numeric not null default 0 check (protein  between 0 and 100000),
  carbs          numeric not null default 0 check (carbs    between 0 and 100000),
  fat            numeric not null default 0 check (fat      between 0 and 100000),
  position       integer not null default 0,
  created_at     timestamptz not null default now(),
  primary key (user_id, id),
  foreign key (user_id, saved_meal_id) references public.saved_meals (user_id, id) on delete cascade,
  foreign key (user_id, food_id)       references public.foods       (user_id, id) on delete set null (food_id)
);
create index if not exists saved_meals_order_idx       on public.saved_meals      (user_id, position);
create index if not exists saved_meal_items_parent_idx on public.saved_meal_items (user_id, saved_meal_id);

-- ---------------------------------------------------------------- RLS das tabelas novas (mesmo padrão da migração 2)
do $$
declare t text;
begin
  foreach t in array array['saved_meals','saved_meal_items'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from public, anon, authenticated', t);
    execute format('grant select, insert, update, delete on table public.%I to authenticated', t);
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = t || '_select_own') then
      execute format('create policy %I on public.%I for select to authenticated using (user_id = (select auth.uid()))', t || '_select_own', t);
      execute format('create policy %I on public.%I for insert to authenticated with check (user_id = (select auth.uid()))', t || '_insert_own', t);
      execute format('create policy %I on public.%I for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t || '_update_own', t);
      execute format('create policy %I on public.%I for delete to authenticated using (user_id = (select auth.uid()))', t || '_delete_own', t);
      execute format('create trigger %I before update on public.%I for each row execute function public.forbid_owner_change()', t || '_owner_immutable', t);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------- Storage: bucket PRIVADO "food-photos"
-- Só JPEG (o app converte), até 1 MB por arquivo. Cada pessoa só lê/grava/apaga na própria pasta <user_id>/.
-- O bucket NÃO é público: o app usa links assinados temporários.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('food-photos', 'food-photos', false, 1048576, array['image/jpeg'])
on conflict (id) do nothing;

do $$
declare p text;
begin
  foreach p in array array['select','insert','update','delete'] loop
    if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'food_photos_' || p || '_own') then
      if p = 'insert' then
        execute 'create policy food_photos_insert_own on storage.objects for insert to authenticated with check (bucket_id = ''food-photos'' and (storage.foldername(name))[1] = (select auth.uid())::text)';
      elsif p = 'update' then
        execute 'create policy food_photos_update_own on storage.objects for update to authenticated using (bucket_id = ''food-photos'' and (storage.foldername(name))[1] = (select auth.uid())::text) with check (bucket_id = ''food-photos'' and (storage.foldername(name))[1] = (select auth.uid())::text)';
      else
        execute format('create policy food_photos_%s_own on storage.objects for %s to authenticated using (bucket_id = ''food-photos'' and (storage.foldername(name))[1] = (select auth.uid())::text)', p, p);
      end if;
    end if;
  end loop;
end $$;

-- ================================================================ FUNÇÕES ATUALIZADAS (create or replace: mesmas assinaturas e permissões)

create or replace function public.get_my_data() returns jsonb
language plpgsql security invoker set search_path = ''
as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  insert into public.profiles (user_id) values (uid) on conflict (user_id) do nothing;   -- autocorreção se faltar o perfil

  return jsonb_build_object(
    'schemaVersion', 3,
    'profile', (select jsonb_strip_nulls(jsonb_build_object(
        'weight', pr.weight, 'calorieGoal', pr.calorie_goal, 'proteinGoal', pr.protein_goal,
        'fatGoal', pr.fat_goal, 'carbGoal', pr.carb_goal, 'waterGoalMl', pr.water_goal_ml,
        'appearance', jsonb_build_object('theme', pr.theme, 'accent', pr.accent),
        'goalType', pr.goal_type, 'targetWeight', pr.target_weight, 'calorieAdjust', pr.calorie_adjust, 'goalPresets', pr.goal_presets))
      from public.profiles pr where pr.user_id = uid),
    'workouts', coalesce((select jsonb_agg(jsonb_build_object(
        'id', w.id, 'name', w.name, 'days', to_jsonb(w.days),
        'exercises', coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id', e.id, 'name', e.name, 'sets', e.sets, 'description', e.description, 'muscleGroup', e.muscle_group)) order by e.position, e.created_at)
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
        'calories', f.calories, 'protein', f.protein, 'carbs', f.carbs, 'fat', f.fat, 'photo', f.photo_path) order by f.created_at, f.id)
      from public.foods f where f.user_id = uid), '[]'::jsonb),
    'meals', coalesce((select jsonb_agg(jsonb_build_object(
        'id', m.id, 'date', m.meal_date, 'mealType', m.meal_type, 'calories', m.calories, 'protein', m.protein, 'photo', m.photo_path,
        'foods', coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
              'id', i.id, 'name', i.name, 'quantity', i.quantity, 'calories', i.calories, 'protein', i.protein,
              'carbs', i.carbs, 'fat', i.fat, 'foodId', i.food_id, 'photo', i.photo_path)) order by i.position, i.created_at)
            from public.meal_items i where i.user_id = uid and i.meal_id = m.id), '[]'::jsonb))
        order by m.meal_date, m.created_at)
      from public.meals m where m.user_id = uid), '[]'::jsonb),
    'weightHistory', coalesce((select jsonb_agg(jsonb_build_object('id', h.id, 'date', h.entry_date, 'weight', h.weight) order by h.entry_date, h.created_at)
      from public.weight_history h where h.user_id = uid), '[]'::jsonb),
    'hydration', coalesce((select jsonb_agg(jsonb_build_object(
        'id', y.id, 'date', y.entry_date, 'time', to_char(y.entry_time, 'HH24:MI'), 'amount', y.amount_ml) order by y.entry_date, y.entry_time, y.created_at)
      from public.hydration y where y.user_id = uid), '[]'::jsonb),
    'savedMeals', coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'id', sm.id, 'name', sm.name, 'category', sm.category, 'favorite', sm.favorite, 'photo', sm.photo_path,
        'items', coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
              'id', si.id, 'foodId', si.food_id, 'name', si.name, 'amount', si.amount, 'unit', si.unit,
              'calories', si.calories, 'protein', si.protein, 'carbs', si.carbs, 'fat', si.fat)) order by si.position, si.created_at)
            from public.saved_meal_items si where si.user_id = uid and si.saved_meal_id = sm.id), '[]'::jsonb)))
        order by sm.position, sm.created_at)
      from public.saved_meals sm where sm.user_id = uid), '[]'::jsonb),
    'legacyImported', coalesce((select jsonb_agg(l.source_hash) from public.legacy_imports l where l.user_id = uid), '[]'::jsonb)
  );
end $$;

create or replace function public.apply_changeset(p jsonb) returns jsonb
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
                          when 'session' then 5 when 'meal' then 6 when 'item' then 7 when 'weight' then 8 when 'water' then 9
                          when 'smeal' then 10 when 'sitem' then 11 else 99 end
        when 'del' then case op.value ->> 'k' when 'session' then 31 when 'item' then 32 when 'meal' then 33 when 'weight' then 34
                          when 'water' then 35 when 'wex' then 36 when 'workout' then 37 when 'food' then 38
                          when 'sitem' then 39 when 'smeal' then 40 else 99 end
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
        when 'smeal'    then delete from public.saved_meals      where user_id = uid and id = vid;
        when 'sitem'    then delete from public.saved_meal_items where user_id = uid and id = vid;
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
        accent        = coalesce(v #>> '{appearance,accent}', accent),
        goal_type     = case when v ? 'goalType' then coalesce(v ->> 'goalType', 'maintain') else goal_type end,
        target_weight = case when v ? 'targetWeight' then (v ->> 'targetWeight')::numeric else target_weight end,
        calorie_adjust = case when v ? 'calorieAdjust' then coalesce(round((v ->> 'calorieAdjust')::numeric)::integer, 0) else calorie_adjust end,
        goal_presets  = case when v ? 'goalPresets' then (case when jsonb_typeof(v -> 'goalPresets') = 'object' then v -> 'goalPresets' else '{}'::jsonb end) else goal_presets end
      where user_id = uid;

    elsif k = 'workout' then
      insert into public.workouts (id, user_id, name, days, position)
      values ((v ->> 'id')::uuid, uid, v ->> 'name',
        coalesce(array(select distinct d.value::smallint from jsonb_array_elements_text(coalesce(v -> 'days', '[]'::jsonb)) as d(value) order by 1), '{}'),
        (select coalesce(max(w.position) + 1, 0) from public.workouts w where w.user_id = uid))
      on conflict (user_id, id) do update set name = excluded.name, days = excluded.days;

    elsif k = 'wex' then
      insert into public.workout_exercises (id, user_id, workout_id, name, sets, description, muscle_group, position)
      values ((v ->> 'id')::uuid, uid, (v ->> 'workoutId')::uuid, v ->> 'name', coalesce(round((v ->> 'sets')::numeric)::integer, 3),
        nullif(v ->> 'description', ''), nullif(v ->> 'muscleGroup', ''),
        (select coalesce(max(e.position) + 1, 0) from public.workout_exercises e where e.user_id = uid and e.workout_id = (v ->> 'workoutId')::uuid))
      on conflict (user_id, id) do update set name = excluded.name, sets = excluded.sets, description = excluded.description, muscle_group = excluded.muscle_group;

    elsif k = 'food' then
      insert into public.foods (id, user_id, name, portion, unit, calories, protein, carbs, fat, photo_path)
      values ((v ->> 'id')::uuid, uid, v ->> 'name', (v ->> 'portion')::numeric, v ->> 'unit',
        coalesce((v ->> 'calories')::numeric, 0), coalesce((v ->> 'protein')::numeric, 0),
        coalesce((v ->> 'carbs')::numeric, 0), coalesce((v ->> 'fat')::numeric, 0), public.own_photo(uid, v ->> 'photo'))
      on conflict (user_id, id) do update set name = excluded.name, portion = excluded.portion, unit = excluded.unit,
        calories = excluded.calories, protein = excluded.protein, carbs = excluded.carbs, fat = excluded.fat, photo_path = excluded.photo_path;

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
      insert into public.meals (id, user_id, meal_date, meal_type, photo_path)
      values (vid, uid, (v ->> 'date')::date, v ->> 'mealType', public.own_photo(uid, v ->> 'photo'))
      on conflict (user_id, id) do update set meal_date = excluded.meal_date, meal_type = excluded.meal_type, photo_path = excluded.photo_path;
      touched := touched || vid;

    elsif k = 'item' then
      mid := (v ->> 'mealId')::uuid;
      insert into public.meal_items (id, user_id, meal_id, food_id, name, quantity, calories, protein, carbs, fat, photo_path, position)
      values ((v ->> 'id')::uuid, uid, mid,
        (select fo.id from public.foods fo where fo.user_id = uid and fo.id = public.try_uuid(v ->> 'foodId')),
        v ->> 'name', coalesce(v ->> 'quantity', ''),
        coalesce((v ->> 'calories')::numeric, 0), coalesce((v ->> 'protein')::numeric, 0),
        coalesce((v ->> 'carbs')::numeric, 0), coalesce((v ->> 'fat')::numeric, 0), public.own_photo(uid, v ->> 'photo'),
        (select coalesce(max(i.position) + 1, 0) from public.meal_items i where i.user_id = uid and i.meal_id = mid))
      on conflict (user_id, id) do update set meal_id = excluded.meal_id, food_id = excluded.food_id, name = excluded.name,
        quantity = excluded.quantity, calories = excluded.calories, protein = excluded.protein, carbs = excluded.carbs, fat = excluded.fat,
        photo_path = excluded.photo_path;
      touched := touched || mid;

    elsif k = 'smeal' then
      insert into public.saved_meals (id, user_id, name, category, favorite, photo_path, position)
      values ((v ->> 'id')::uuid, uid, v ->> 'name', coalesce(v ->> 'category', 'almoco'), coalesce((v ->> 'favorite')::boolean, false),
        public.own_photo(uid, v ->> 'photo'), (select coalesce(max(s.position) + 1, 0) from public.saved_meals s where s.user_id = uid))
      on conflict (user_id, id) do update set name = excluded.name, category = excluded.category, favorite = excluded.favorite, photo_path = excluded.photo_path;

    elsif k = 'sitem' then
      insert into public.saved_meal_items (id, user_id, saved_meal_id, food_id, name, amount, unit, calories, protein, carbs, fat, position)
      values ((v ->> 'id')::uuid, uid, (v ->> 'savedMealId')::uuid,
        (select fo.id from public.foods fo where fo.user_id = uid and fo.id = public.try_uuid(v ->> 'foodId')),
        v ->> 'name', (v ->> 'amount')::numeric, coalesce(v ->> 'unit', 'g'),
        coalesce((v ->> 'calories')::numeric, 0), coalesce((v ->> 'protein')::numeric, 0),
        coalesce((v ->> 'carbs')::numeric, 0), coalesce((v ->> 'fat')::numeric, 0),
        (select coalesce(max(i.position) + 1, 0) from public.saved_meal_items i where i.user_id = uid and i.saved_meal_id = (v ->> 'savedMealId')::uuid))
      on conflict (user_id, id) do update set food_id = excluded.food_id, name = excluded.name, amount = excluded.amount, unit = excluded.unit,
        calories = excluded.calories, protein = excluded.protein, carbs = excluded.carbs, fat = excluded.fat;

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

create or replace function public.import_backup(p jsonb, p_mode text default 'merge') returns jsonb
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
  if p ? 'savedMeals' and jsonb_typeof(p -> 'savedMeals') is distinct from 'array' then raise exception 'invalid_backup: savedMeals' using errcode = '22023'; end if;
  insert into public.profiles (user_id) values (uid) on conflict (user_id) do nothing;

  if p_mode = 'replace' then
    delete from public.workout_sessions where user_id = uid;
    delete from public.meals            where user_id = uid;
    delete from public.weight_history   where user_id = uid;
    delete from public.hydration        where user_id = uid;
    delete from public.saved_meals      where user_id = uid;
    delete from public.workouts         where user_id = uid;
    delete from public.foods            where user_id = uid;
    pristine := true;
  else
    select (pr0.weight = 0 and pr0.calorie_goal = 0 and pr0.protein_goal = 0 and pr0.fat_goal is null and pr0.carb_goal is null and pr0.water_goal_ml is null and pr0.goal_type = 'maintain' and pr0.target_weight is null and pr0.calorie_adjust = 0 and pr0.goal_presets = '{}'::jsonb)
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
      accent        = coalesce(pr #>> '{appearance,accent}', accent),
      goal_type     = coalesce(pr ->> 'goalType', 'maintain'),
      target_weight = (pr ->> 'targetWeight')::numeric,
      calorie_adjust = coalesce(round((pr ->> 'calorieAdjust')::numeric)::integer, 0),
      goal_presets  = case when jsonb_typeof(pr -> 'goalPresets') = 'object' then pr -> 'goalPresets' else '{}'::jsonb end
    where user_id = uid;
    applied := true;
  end if;

  insert into public.workouts (id, user_id, name, days, position)
  select public.rekey(uid, 'workout', w.value ->> 'id'), uid, w.value ->> 'name',
         coalesce(array(select distinct d.value::smallint from jsonb_array_elements_text(coalesce(w.value -> 'days', '[]'::jsonb)) as d(value) order by 1), '{}'),
         (w.ord - 1)::integer
    from jsonb_array_elements(p -> 'workouts') with ordinality as w(value, ord)
  on conflict (user_id, id) do nothing;

  insert into public.workout_exercises (id, user_id, workout_id, name, sets, description, muscle_group, position)
  select public.rekey(uid, 'wex', (w.value ->> 'id') || ':' || (e.value ->> 'id')), uid, public.rekey(uid, 'workout', w.value ->> 'id'),
         e.value ->> 'name', coalesce(round((e.value ->> 'sets')::numeric)::integer, 3), nullif(e.value ->> 'description', ''), nullif(e.value ->> 'muscleGroup', ''), (e.ord - 1)::integer
    from jsonb_array_elements(p -> 'workouts') as w(value),
         jsonb_array_elements(coalesce(w.value -> 'exercises', '[]'::jsonb)) with ordinality as e(value, ord)
  on conflict (user_id, id) do nothing;

  insert into public.foods (id, user_id, name, portion, unit, calories, protein, carbs, fat, photo_path)
  select public.rekey(uid, 'food', f.value ->> 'id'), uid, f.value ->> 'name', (f.value ->> 'portion')::numeric, f.value ->> 'unit',
         coalesce((f.value ->> 'calories')::numeric, 0), coalesce((f.value ->> 'protein')::numeric, 0),
         coalesce((f.value ->> 'carbs')::numeric, 0), coalesce((f.value ->> 'fat')::numeric, 0), public.own_photo(uid, f.value ->> 'photo')
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

  insert into public.meals (id, user_id, meal_date, meal_type, calories, protein, photo_path)
  select public.rekey(uid, 'meal', m.value ->> 'id'), uid, (m.value ->> 'date')::date, m.value ->> 'mealType',
         coalesce((m.value ->> 'calories')::numeric, 0), coalesce((m.value ->> 'protein')::numeric, 0), public.own_photo(uid, m.value ->> 'photo')
    from jsonb_array_elements(p -> 'meals') as m(value)
  on conflict (user_id, id) do nothing;

  insert into public.meal_items (id, user_id, meal_id, food_id, name, quantity, calories, protein, carbs, fat, photo_path, position)
  select public.rekey(uid, 'item', i.value ->> 'id'), uid, public.rekey(uid, 'meal', m.value ->> 'id'),
         (select fo.id from public.foods fo where fo.user_id = uid and fo.id = public.rekey(uid, 'food', i.value ->> 'foodId')),
         i.value ->> 'name', coalesce(i.value ->> 'quantity', ''),
         coalesce((i.value ->> 'calories')::numeric, 0), coalesce((i.value ->> 'protein')::numeric, 0),
         coalesce((i.value ->> 'carbs')::numeric, 0), coalesce((i.value ->> 'fat')::numeric, 0), public.own_photo(uid, i.value ->> 'photo'), (i.ord - 1)::integer
    from jsonb_array_elements(p -> 'meals') as m(value),
         jsonb_array_elements(coalesce(m.value -> 'foods', '[]'::jsonb)) with ordinality as i(value, ord)
  on conflict (user_id, id) do nothing;

  insert into public.saved_meals (id, user_id, name, category, favorite, photo_path, position)
  select public.rekey(uid, 'smeal', s.value ->> 'id'), uid, s.value ->> 'name', coalesce(s.value ->> 'category', 'almoco'),
         coalesce((s.value ->> 'favorite')::boolean, false), public.own_photo(uid, s.value ->> 'photo'), (s.ord - 1)::integer
    from jsonb_array_elements(coalesce(p -> 'savedMeals', '[]'::jsonb)) with ordinality as s(value, ord)
  on conflict (user_id, id) do nothing;

  insert into public.saved_meal_items (id, user_id, saved_meal_id, food_id, name, amount, unit, calories, protein, carbs, fat, position)
  select public.rekey(uid, 'sitem', si.value ->> 'id'), uid, public.rekey(uid, 'smeal', s.value ->> 'id'),
         (select fo.id from public.foods fo where fo.user_id = uid and fo.id = public.rekey(uid, 'food', si.value ->> 'foodId')),
         si.value ->> 'name', (si.value ->> 'amount')::numeric, coalesce(si.value ->> 'unit', 'g'),
         coalesce((si.value ->> 'calories')::numeric, 0), coalesce((si.value ->> 'protein')::numeric, 0),
         coalesce((si.value ->> 'carbs')::numeric, 0), coalesce((si.value ->> 'fat')::numeric, 0), (si.ord - 1)::integer
    from jsonb_array_elements(coalesce(p -> 'savedMeals', '[]'::jsonb)) as s(value),
         jsonb_array_elements(coalesce(s.value -> 'items', '[]'::jsonb)) with ordinality as si(value, ord)
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
    'smeals',    (select count(*) from public.saved_meals sm where sm.user_id = uid and sm.id in (select public.rekey(uid, 'smeal', x.value ->> 'id') from jsonb_array_elements(coalesce(p -> 'savedMeals', '[]'::jsonb)) x)),
    'sitems',    (select count(*) from public.saved_meal_items si where si.user_id = uid and si.id in (select public.rekey(uid, 'sitem', ii.value ->> 'id') from jsonb_array_elements(coalesce(p -> 'savedMeals', '[]'::jsonb)) x, jsonb_array_elements(coalesce(x.value -> 'items', '[]'::jsonb)) ii)),
    'water',     (select count(*) from public.hydration y where y.user_id = uid and y.id in (select public.rekey(uid, 'water', x.value ->> 'id') from jsonb_array_elements(coalesce(p -> 'hydration', '[]'::jsonb)) x))
  );

  return res;
end $$;

create or replace function public.delete_all_my_data() returns jsonb
language plpgsql security invoker set search_path = ''
as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  delete from public.workout_sessions where user_id = uid;
  delete from public.meals            where user_id = uid;
  delete from public.weight_history   where user_id = uid;
  delete from public.hydration        where user_id = uid;
  delete from public.saved_meals      where user_id = uid;
  delete from public.workouts         where user_id = uid;
  delete from public.foods            where user_id = uid;
  delete from public.legacy_imports   where user_id = uid;
  update public.profiles set weight = 0, calorie_goal = 0, protein_goal = 0, fat_goal = null, carb_goal = null, water_goal_ml = null,
         goal_type = 'maintain', target_weight = null, calorie_adjust = 0, goal_presets = '{}'::jsonb
   where user_id = uid;
  return jsonb_build_object('ok', true);
end $$;

-- Permissões: create or replace mantém as já concedidas; reafirma por segurança.
revoke all on function public.own_photo(uuid, text)               from public, anon;
grant execute on function public.own_photo(uuid, text)            to authenticated;
revoke all on function public.get_my_data()                       from public, anon;
revoke all on function public.apply_changeset(jsonb)              from public, anon;
revoke all on function public.import_backup(jsonb, text)          from public, anon;
revoke all on function public.delete_all_my_data()                from public, anon;
grant execute on function public.get_my_data()                    to authenticated;
grant execute on function public.apply_changeset(jsonb)           to authenticated;
grant execute on function public.import_backup(jsonb, text)       to authenticated;
grant execute on function public.delete_all_my_data()             to authenticated;
