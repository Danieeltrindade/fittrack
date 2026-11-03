-- SOMENTE PARA TESTES LOCAIS (servidor de teste e2e). Executa uma função pública COMO o papel "authenticated" de um usuário,
-- passando pelo RLS e pelas permissões reais — assim o navegador de teste fala com o banco do mesmo modo que o Supabase faria.
create schema stub;
create function stub.rpc(p_uid uuid, p_fn text, p_args jsonb) returns jsonb
language plpgsql as $$
declare r jsonb;
begin
  perform set_config('request.jwt.claim.sub', p_uid::text, true);
  execute 'set local role authenticated';
  begin
    case p_fn
      when 'get_my_data'         then r := public.get_my_data();
      when 'apply_changeset'     then r := public.apply_changeset(p_args -> 'p');
      when 'import_backup'       then r := public.import_backup(p_args -> 'p', coalesce(p_args ->> 'p_mode', 'merge'));
      when 'mark_legacy_import'  then r := public.mark_legacy_import(p_args ->> 'p_key', coalesce(p_args -> 'p_summary', '{}'::jsonb));
      when 'delete_all_my_data'  then r := public.delete_all_my_data();
      else raise exception 'PGRST202: function not found' using errcode = 'P0002';
    end case;
  exception when others then
    execute 'reset role';
    return jsonb_build_object('__error', jsonb_build_object('code', sqlstate, 'message', sqlerrm));
  end;
  execute 'reset role';
  return jsonb_build_object('data', r);
end $$;

-- Storage de teste: executa insert/select/delete em storage.objects COMO o usuário (RLS real das políticas da migração 4)
create function stub.st(p_uid uuid, p_op text, p_bucket text, p_names jsonb) returns jsonb
language plpgsql as $$
declare r jsonb;
begin
  perform set_config('request.jwt.claim.sub', p_uid::text, true);
  execute 'set local role authenticated';
  begin
    if p_op = 'insert' then
      insert into storage.objects (bucket_id, name) select p_bucket, jsonb_array_elements_text(p_names); r := '[]'::jsonb;
    elsif p_op = 'exists' then
      select coalesce(jsonb_agg(o.name), '[]') into r from storage.objects o where o.bucket_id = p_bucket and o.name in (select jsonb_array_elements_text(p_names));
    elsif p_op = 'delete' then
      with d as (delete from storage.objects o where o.bucket_id = p_bucket and o.name in (select jsonb_array_elements_text(p_names)) returning o.name) select coalesce(jsonb_agg(name), '[]') into r from d;
    elsif p_op = 'list' then
      select coalesce(jsonb_agg(o.name), '[]') into r from storage.objects o where o.bucket_id = p_bucket and (storage.foldername(o.name))[1] = (p_names ->> 0);
    end if;
  exception when others then
    execute 'reset role';
    return jsonb_build_object('__error', jsonb_build_object('code', sqlstate, 'message', sqlerrm));
  end;
  execute 'reset role';
  return jsonb_build_object('data', r);
end $$;
