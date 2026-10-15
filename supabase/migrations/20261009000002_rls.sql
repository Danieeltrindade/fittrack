-- FitTrack · migração 2/3 · RLS (Row Level Security) e permissões
-- Regra única: cada linha só é visível/alterável pelo usuário dono (user_id = auth.uid()).
-- O papel "anon" (visitante, inclusive a demonstração) NÃO recebe permissão em nenhuma tabela.
-- Nunca desative o RLS destas tabelas.

do $$
declare t text;
begin
  foreach t in array array[
    'profiles','workouts','workout_exercises','workout_sessions','session_exercises','session_sets',
    'foods','meals','meal_items','weight_history','hydration','legacy_imports'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from public, anon, authenticated', t);   -- remove também TRUNCATE/REFERENCES/TRIGGER herdados
    execute format('grant select, insert, update, delete on table public.%I to authenticated', t);

    execute format('create policy %I on public.%I for select to authenticated using (user_id = (select auth.uid()))',
                   t || '_select_own', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (user_id = (select auth.uid()))',
                   t || '_insert_own', t);
    execute format('create policy %I on public.%I for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))',
                   t || '_update_own', t);
    execute format('create policy %I on public.%I for delete to authenticated using (user_id = (select auth.uid()))',
                   t || '_delete_own', t);
  end loop;
end $$;

-- O dono de uma linha nunca muda: bloqueia também a troca de user_id em UPDATE (defesa extra além do WITH CHECK).
create function public.forbid_owner_change() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if new.user_id is distinct from old.user_id then
    raise exception 'user_id é imutável' using errcode = '42501';
  end if;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array[
    'profiles','workouts','workout_exercises','workout_sessions','session_exercises','session_sets',
    'foods','meals','meal_items','weight_history','hydration','legacy_imports'
  ] loop
    execute format('create trigger %I before update on public.%I for each row execute function public.forbid_owner_change()',
                   t || '_owner_immutable', t);
  end loop;
end $$;
