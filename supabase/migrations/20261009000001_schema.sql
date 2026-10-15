-- FitTrack · migração 1/3 · TABELAS
-- Rode nesta ordem: 1_schema → 2_rls → 3_functions (ver README, seção "Configurar o Supabase").
-- Todas as tabelas pessoais têm user_id (dono) e chave primária (user_id, id).
-- Chaves estrangeiras COMPOSTAS (user_id, pai_id) impedem, no próprio banco, ligar uma linha
-- de um usuário a uma entidade de outro usuário.

-- ---------------------------------------------------------------- perfil
create table public.profiles (
  user_id        uuid primary key references auth.users (id) on delete cascade,
  weight         numeric not null default 0 check (weight >= 0 and weight <= 700),
  calorie_goal   integer not null default 0 check (calorie_goal between 0 and 20000),
  protein_goal   integer not null default 0 check (protein_goal between 0 and 2000),
  fat_goal       integer          check (fat_goal   is null or fat_goal   between 0 and 2000),   -- null = estimada pelo app
  carb_goal      integer          check (carb_goal  is null or carb_goal  between 0 and 3000),   -- meta ÚNICA de carboidratos
  water_goal_ml  integer          check (water_goal_ml is null or water_goal_ml between 0 and 20000),
  theme          text not null default 'dark'  check (theme  ~ '^[a-z0-9_-]{1,32}$'),
  accent         text not null default 'green' check (accent ~ '^[a-z0-9_-]{1,32}$'),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- ---------------------------------------------------------------- treinos (modelos)
create table public.workouts (
  id          uuid not null default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null check (char_length(btrim(name)) between 1 and 200),
  days        smallint[] not null default '{}' check (days <@ array[0,1,2,3,4,5,6]::smallint[]),   -- 0 = domingo
  position    integer not null default 0,
  created_at  timestamptz not null default now(),
  primary key (user_id, id)
);

create table public.workout_exercises (
  id          uuid not null default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  workout_id  uuid not null,
  name        text not null check (char_length(btrim(name)) between 1 and 200),
  sets        integer not null default 3 check (sets between 1 and 100),
  position    integer not null default 0,
  created_at  timestamptz not null default now(),
  primary key (user_id, id),
  foreign key (user_id, workout_id) references public.workouts (user_id, id) on delete cascade
);

-- ---------------------------------------------------------------- sessões realizadas (histórico)
create table public.workout_sessions (
  id            uuid not null default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  workout_id    uuid,                                   -- vira NULL se o modelo de treino for apagado (histórico fica)
  workout_name  text not null check (char_length(btrim(workout_name)) between 1 and 200),
  session_date  date not null,
  notes         text not null default '' check (char_length(notes) <= 4000),
  created_at    timestamptz not null default now(),
  primary key (user_id, id),
  foreign key (user_id, workout_id) references public.workouts (user_id, id) on delete set null (workout_id)
);

create table public.session_exercises (
  id             uuid not null default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  session_id     uuid not null,
  exercise_id    uuid,                                  -- NULL se o exercício do modelo foi apagado
  exercise_name  text not null check (char_length(btrim(exercise_name)) between 1 and 200),
  note           text check (note is null or char_length(note) <= 2000),
  position       integer not null default 0,
  primary key (user_id, id),
  foreign key (user_id, session_id)  references public.workout_sessions  (user_id, id) on delete cascade,
  foreign key (user_id, exercise_id) references public.workout_exercises (user_id, id) on delete set null (exercise_id)
);

create table public.session_sets (
  id                   uuid not null default gen_random_uuid(),
  user_id              uuid not null default auth.uid() references auth.users (id) on delete cascade,
  session_exercise_id  uuid not null,
  set_number           integer not null check (set_number between 1 and 1000),
  load                 numeric not null default 0 check (load >= 0 and load <= 100000),
  reps                 integer not null default 0 check (reps between 0 and 100000),
  completed            boolean not null default false,
  primary key (user_id, id),
  foreign key (user_id, session_exercise_id) references public.session_exercises (user_id, id) on delete cascade
);

-- ---------------------------------------------------------------- biblioteca de alimentos
create table public.foods (
  id          uuid not null default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null check (char_length(btrim(name)) between 1 and 200),
  portion     numeric not null check (portion > 0 and portion <= 100000),
  unit        text not null check (char_length(btrim(unit)) between 1 and 40),
  calories    numeric not null default 0 check (calories between 0 and 100000),
  protein     numeric not null default 0 check (protein  between 0 and 100000),
  carbs       numeric not null default 0 check (carbs    between 0 and 100000),
  fat         numeric not null default 0 check (fat      between 0 and 100000),
  created_at  timestamptz not null default now(),
  primary key (user_id, id)
);

-- ---------------------------------------------------------------- refeições
-- Os valores de meal_items são CÓPIAS: editar a biblioteca não altera refeições já registradas.
-- food_id é só uma referência informativa (vira NULL se o alimento da biblioteca for apagado).
create table public.meals (
  id          uuid not null default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  meal_date   date not null,
  meal_type   text not null check (meal_type in ('cafe','almoco','lanche','jantar','outras')),
  calories    numeric not null default 0 check (calories between 0 and 1000000),
  protein     numeric not null default 0 check (protein  between 0 and 1000000),
  created_at  timestamptz not null default now(),
  primary key (user_id, id)
);

create table public.meal_items (
  id          uuid not null default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  meal_id     uuid not null,
  food_id     uuid,
  name        text not null check (char_length(btrim(name)) between 1 and 200),
  quantity    text not null default '' check (char_length(quantity) <= 60),
  calories    numeric not null default 0 check (calories between 0 and 100000),
  protein     numeric not null default 0 check (protein  between 0 and 100000),
  carbs       numeric not null default 0 check (carbs    between 0 and 100000),
  fat         numeric not null default 0 check (fat      between 0 and 100000),
  position    integer not null default 0,
  created_at  timestamptz not null default now(),
  primary key (user_id, id),
  foreign key (user_id, meal_id) references public.meals (user_id, id) on delete cascade,
  foreign key (user_id, food_id) references public.foods (user_id, id) on delete set null (food_id)
);

-- ---------------------------------------------------------------- peso e hidratação
create table public.weight_history (
  id          uuid not null default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  entry_date  date not null,
  weight      numeric not null check (weight > 0 and weight <= 700),
  created_at  timestamptz not null default now(),
  primary key (user_id, id)
);

create table public.hydration (
  id          uuid not null default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  entry_date  date not null,
  entry_time  time(0) not null,
  amount_ml   integer not null check (amount_ml between 1 and 20000),
  created_at  timestamptz not null default now(),
  primary key (user_id, id)
);

-- ---------------------------------------------------------------- marcador de migração do armazenamento antigo
-- Uma linha por arquivo antigo (hash SHA-256) já migrado para esta conta → migrar de novo não duplica.
create table public.legacy_imports (
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  source_hash  text not null check (source_hash ~ '^[0-9a-f]{64}$'),
  summary      jsonb not null default '{}'::jsonb,
  imported_at  timestamptz not null default now(),
  primary key (user_id, source_hash)
);

-- ---------------------------------------------------------------- índices (além das PKs, que já começam por user_id)
create index workouts_order_idx            on public.workouts          (user_id, position);
create index workout_exercises_parent_idx  on public.workout_exercises (user_id, workout_id);
create index workout_sessions_date_idx     on public.workout_sessions  (user_id, session_date desc);
create index workout_sessions_workout_idx  on public.workout_sessions  (user_id, workout_id);
create index session_exercises_parent_idx  on public.session_exercises (user_id, session_id);
create index session_exercises_exid_idx    on public.session_exercises (user_id, exercise_id);
create index session_sets_parent_idx       on public.session_sets      (user_id, session_exercise_id);
create index meals_date_idx                on public.meals             (user_id, meal_date);
create index meal_items_parent_idx         on public.meal_items        (user_id, meal_id);
create index meal_items_food_idx           on public.meal_items        (user_id, food_id);
create index weight_history_date_idx       on public.weight_history    (user_id, entry_date);
create index hydration_date_idx            on public.hydration         (user_id, entry_date);

-- ---------------------------------------------------------------- perfil criado automaticamente após o cadastro
-- SECURITY DEFINER porque o gatilho roda no cadastro, antes de existir sessão do usuário.
-- search_path vazio: o corpo usa só nomes qualificados.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (user_id) values (new.id) on conflict (user_id) do nothing;
  return new;
end $$;
revoke all on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create function public.touch_updated_at() returns trigger
language plpgsql set search_path = ''
as $$ begin new.updated_at := now(); return new; end $$;
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();
