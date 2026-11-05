-- Avito Türk — аудит безопасности Supabase (ТОЛЬКО ЧТЕНИЕ, ничего не меняет).
-- Выполните в Supabase → SQL Editor и пришлите мне результат: по нему я подготовлю
-- точные политики RLS под вашу реальную схему (я её не вижу, поэтому не гадаю).

-- 1) Включён ли RLS на таблицах
select schemaname, tablename, rowsecurity
from pg_tables where schemaname = 'public' order by tablename;

-- 2) Какие политики уже есть
select tablename, policyname, cmd, roles, qual, with_check
from pg_policies where schemaname = 'public' order by tablename, policyname;

-- 3) Что может делать анонимный ключ (anon) с таблицами
select table_name, privilege_type
from information_schema.role_table_grants
where table_schema = 'public' and grantee = 'anon' order by table_name, privilege_type;

-- 4) Колонки таблицы users (чтобы закрыть password_hash от чтения)
select column_name, data_type from information_schema.columns
where table_schema = 'public' and table_name = 'users' order by ordinal_position;

-- 5) Определения RPC входа/регистрации
select proname, prosecdef as security_definer, pg_get_functiondef(oid)
from pg_proc where proname in ('verify_user_login', 'register_new_user');
