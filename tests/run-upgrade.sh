#!/bin/bash
# Prova que a migração 4 é ADITIVA: cria um banco só com as migrações 1–3, grava dados como no app antigo,
# aplica a 4 (duas vezes) e confere que nenhum dado mudou.
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"
export PGHOST=127.0.0.1 PGPORT=54329 PGUSER=postgres
psql -q -d postgres -c "drop database if exists fittrack_upg" -c "create database fittrack_upg"
P="psql -q -v ON_ERROR_STOP=1 -d fittrack_upg"
$P -f "$HERE/sql/00_supabase_stub.sql"
for f in "$HERE"/../supabase/migrations/2026100900000[123]_*.sql; do $P -f "$f"; done
$P <<'SQL' >/dev/null
insert into auth.users (id,email) values ('aaaaaaaa-0000-4000-8000-00000000000a','a@t.invalid');
set role authenticated; select set_config('request.jwt.claim.sub','aaaaaaaa-0000-4000-8000-00000000000a',false);
select public.apply_changeset($j${"ops":[
 {"k":"profile","a":"put","v":{"weight":78.4,"calorieGoal":2900,"proteinGoal":160,"fatGoal":80,"carbGoal":380,"waterGoalMl":3000,"appearance":{"theme":"light","accent":"blue"}}},
 {"k":"workout","a":"put","v":{"id":"11111111-1111-4111-8111-111111111111","name":"Treino A","days":[1,4]}},
 {"k":"wex","a":"put","v":{"id":"11111111-1111-4111-8111-1111111111e1","workoutId":"11111111-1111-4111-8111-111111111111","name":"Supino","sets":4}},
 {"k":"food","a":"put","v":{"id":"22222222-2222-4222-8222-222222222222","name":"Frango","portion":150,"unit":"g","calories":248,"protein":46,"carbs":0,"fat":5}},
 {"k":"session","a":"put","v":{"id":"33333333-3333-4333-8333-333333333333","date":"2026-10-01","workoutId":"11111111-1111-4111-8111-111111111111","workoutName":"Treino A","notes":"ok","exercises":[{"exerciseId":"11111111-1111-4111-8111-1111111111e1","exerciseName":"Supino","sets":[{"setNumber":1,"load":70,"reps":8,"completed":true}]}]}},
 {"k":"meal","a":"put","v":{"id":"44444444-4444-4444-8444-444444444444","date":"2026-10-01","mealType":"almoco"}},
 {"k":"item","a":"put","v":{"id":"55555555-5555-4555-8555-555555555555","mealId":"44444444-4444-4444-8444-444444444444","name":"Frango","quantity":"150 g","calories":248,"protein":46,"carbs":0,"fat":5,"foodId":"22222222-2222-4222-8222-222222222222"}},
 {"k":"weight","a":"put","v":{"id":"66666666-6666-4666-8666-666666666666","date":"2026-10-01","weight":78.4}},
 {"k":"water","a":"put","v":{"id":"77777777-7777-4777-8777-777777777777","date":"2026-10-01","time":"09:30","amount":500}}]}$j$::jsonb);
SQL
dump() { psql -At -d fittrack_upg -c "select set_config('request.jwt.claim.sub','aaaaaaaa-0000-4000-8000-00000000000a',false)" -c "set role authenticated" -c "select (public.get_my_data() - 'schemaVersion' #- '{profile,goalType}' #- '{profile,calorieAdjust}' #- '{profile,goalPresets}' #- '{profile,targetWeight}')::text" | tail -1 | python3 -c "
import sys,json
d=json.loads(sys.stdin.read())
def clean(x):
    if isinstance(x,dict): return {k:clean(v) for k,v in x.items() if not (k in('photo','description','muscleGroup') and v is None) and k!='savedMeals'}
    if isinstance(x,list): return [clean(i) for i in x]
    return x
print(json.dumps(clean(d),sort_keys=True))"; }
BEFORE=$(dump)
$P -f "$HERE"/../supabase/migrations/20261102000004_*.sql
$P -f "$HERE"/../supabase/migrations/20261102000004_*.sql   # segunda vez: idempotente
AFTER=$(dump)
[ "$BEFORE" = "$AFTER" ] && echo "OK  migração 4 aditiva e idempotente: todos os dados anteriores idênticos (${#AFTER} bytes comparados)" || { echo "FALHOU: dados mudaram"; echo "$BEFORE"; echo "$AFTER"; exit 1; }
