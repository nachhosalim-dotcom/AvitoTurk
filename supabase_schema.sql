-- =====================================================================
--  Avito Türk — схема НОВОЙ базы Supabase (выполнить целиком в SQL Editor)
--  Безопасность: личность пользователя подтверждает секретный токен сессии
--  (заголовок x-avito-token), который выдаёт вход/регистрация. Роль, баланс и
--  хэш пароля напрямую изменить нельзя — только через функции ниже.
-- =====================================================================
create extension if not exists pgcrypto with schema extensions;

-- ---------- ТАБЛИЦЫ ----------
create table if not exists public.users (
  uid             text primary key,
  username        text not null,
  password_hash   text not null,
  kunya           text,
  gender          text,
  whatsapp        text,
  avatar          text,
  role            text not null default 'USER' check (role in ('USER','ADMIN','SUPERUSER')),
  avitocash_balance numeric not null default 0,
  trial_balance   numeric not null default 10,
  favorites       jsonb not null default '[]',
  verified_shop   boolean not null default false,
  show_women_ads  boolean not null default false,
  frozen          boolean not null default false,
  is_archived     boolean not null default false,
  shop            jsonb,
  receipts        jsonb,
  created_at      timestamptz not null default now()
);
create unique index if not exists users_username_lower_uq on public.users (lower(username));

create table if not exists public.user_sessions (
  token_hash text primary key,
  uid        text not null references public.users(uid) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '60 days'
);
create index if not exists user_sessions_uid_idx on public.user_sessions(uid);

create table if not exists public.login_attempts (
  username_key text not null,
  at           timestamptz not null default now()
);
create index if not exists login_attempts_idx on public.login_attempts(username_key, at);

create table if not exists public.ads (
  id text primary key,
  title text not null,
  category text,
  store_category text default '',
  region text,
  city text,
  is_women_only boolean default false,
  is_free boolean default false,
  is_negotiable boolean default false,
  price numeric default 0,
  old_price numeric,
  currency text default 'USD',
  description text,
  images jsonb default '[]',
  image text,
  lat double precision,
  lng double precision,
  seller_username text,
  seller_uid text,
  seller_kunya text,
  seller_whatsapp text,
  status text default 'ACTIVE',
  created_at bigint,
  queue jsonb default '[]',
  likes jsonb default '[]',
  views integer default 0
);
create index if not exists ads_created_idx on public.ads(created_at desc);
create index if not exists ads_seller_idx on public.ads(seller_uid);

create table if not exists public.combos (
  id text primary key,
  shop_uid text,
  seller_username text,
  title text,
  price numeric default 0,
  items jsonb default '[]',
  likes jsonb default '[]',
  created_at bigint
);

create table if not exists public.categories (
  id text primary key,
  name text not null,
  icon text
);

create table if not exists public.reports (
  id text primary key,
  ad_id text,
  reason text,
  comment text,
  reporter_username text,
  "timestamp" bigint
);

create table if not exists public.system_settings (
  key text primary key,
  value jsonb
);

-- ---------- ПОМОЩНИКИ ЛИЧНОСТИ ----------
create or replace function public.app_token() returns text
language sql stable as $$
  select nullif(coalesce(current_setting('request.headers', true), '{}')::json ->> 'x-avito-token', '')
$$;

create or replace function public.app_uid() returns text
language sql stable security definer set search_path = public, extensions as $$
  select s.uid from public.user_sessions s
  join public.users u on u.uid = s.uid and not u.is_archived
  where s.token_hash = encode(digest(public.app_token(), 'sha256'), 'hex') and s.expires_at > now()
  limit 1
$$;

create or replace function public.app_is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.users where uid = public.app_uid() and role in ('ADMIN','SUPERUSER'))
$$;

create or replace function public._user_json(u public.users) returns jsonb
language sql immutable as $$ select to_jsonb(u) - 'password_hash' $$;

create or replace function public._new_session(p_uid text) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare t text := encode(gen_random_bytes(32), 'hex');
begin
  delete from public.user_sessions where uid = p_uid and expires_at < now();
  insert into public.user_sessions(token_hash, uid) values (encode(digest(t, 'sha256'), 'hex'), p_uid);
  return t;
end $$;

-- ---------- ВХОД / РЕГИСТРАЦИЯ ----------
create or replace function public.register_new_user(
  p_uid text, p_username text, p_password_hash text, p_kunya text,
  p_gender text, p_whatsapp text, p_avatar text
) returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare v_uid text; v_user public.users; v_tok text;
begin
  p_username := btrim(coalesce(p_username, ''));
  if char_length(p_username) < 3 or char_length(p_username) > 32 then
    return jsonb_build_object('success', false, 'error', 'Логин должен быть от 3 до 32 символов');
  end if;
  if p_password_hash is null or p_password_hash !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('success', false, 'error', 'Некорректный пароль');
  end if;
  if exists (select 1 from public.users where lower(username) = lower(p_username)) then
    return jsonb_build_object('success', false, 'error', 'Такой логин уже занят');
  end if;
  v_uid := case when p_uid ~ '^u_[0-9]{10,16}$' and not exists (select 1 from public.users where uid = p_uid)
                then p_uid else 'u_' || (extract(epoch from clock_timestamp()) * 1000)::bigint || floor(random()*100)::int end;
  insert into public.users(uid, username, password_hash, kunya, gender, whatsapp, avatar)
  values (v_uid, p_username, crypt(p_password_hash, gen_salt('bf', 10)),
          left(coalesce(nullif(btrim(p_kunya), ''), p_username), 60),
          case when p_gender in ('MALE','FEMALE') then p_gender else null end,
          left(p_whatsapp, 20), p_avatar)
  returning * into v_user;
  v_tok := public._new_session(v_uid);
  return jsonb_build_object('success', true, 'user', public._user_json(v_user) || jsonb_build_object('session_token', v_tok));
end $$;

create or replace function public.verify_user_login(p_username text, p_password_hash text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare v_user public.users; v_key text := lower(btrim(coalesce(p_username, '')));
begin
  if (select count(*) from public.login_attempts where username_key = v_key and at > now() - interval '15 minutes') >= 10 then
    return jsonb_build_object('success', false, 'error', 'Слишком много попыток. Попробуйте через 15 минут');
  end if;
  select * into v_user from public.users
  where lower(username) = v_key
     or (whatsapp is not null and regexp_replace(whatsapp, '\D', '', 'g') <> ''
         and regexp_replace(whatsapp, '\D', '', 'g') = regexp_replace(v_key, '\D', '', 'g'))
  limit 1;
  if not found or v_user.password_hash <> crypt(p_password_hash, v_user.password_hash) then
    insert into public.login_attempts(username_key) values (v_key);
    return jsonb_build_object('success', false, 'error', 'Неверный логин или пароль');
  end if;
  if v_user.is_archived then
    return jsonb_build_object('success', false, 'error', 'Аккаунт в архиве');
  end if;
  delete from public.login_attempts where username_key = v_key;
  return jsonb_build_object('success', true,
    'user', public._user_json(v_user) || jsonb_build_object('session_token', public._new_session(v_user.uid)));
end $$;

create or replace function public.logout() returns void
language sql security definer set search_path = public, extensions as $$
  delete from public.user_sessions where token_hash = encode(digest(public.app_token(), 'sha256'), 'hex')
$$;

create or replace function public.get_me() returns jsonb
language sql stable security definer set search_path = public as $$
  select public._user_json(u) from public.users u where u.uid = public.app_uid()
$$;

create or replace function public.change_password(p_new_hash text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
begin
  if public.app_uid() is null then return jsonb_build_object('success', false, 'error', 'Требуется вход'); end if;
  if p_new_hash is null or p_new_hash !~ '^[0-9a-f]{64}$' then return jsonb_build_object('success', false, 'error', 'Некорректный пароль'); end if;
  update public.users set password_hash = crypt(p_new_hash, gen_salt('bf', 10)) where uid = public.app_uid();
  return jsonb_build_object('success', true);
end $$;

-- ---------- АДМИНИСТРИРОВАНИЕ (p_caller_id оставлен для совместимости, не используется) ----------
create or replace function public.admin_list_users() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.app_is_admin() then return '[]'::jsonb; end if;
  return coalesce((select jsonb_agg(public._user_json(u) order by u.created_at) from public.users u), '[]'::jsonb);
end $$;

create or replace function public.admin_manage_user(
  p_caller_id text default null, p_target_uid text default null,
  p_frozen boolean default null, p_verified_shop boolean default null, p_role text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not public.app_is_admin() then return jsonb_build_object('success', false, 'error', 'Недостаточно прав'); end if;
  if p_role is not null and p_role not in ('USER','ADMIN','SUPERUSER') then return jsonb_build_object('success', false, 'error', 'Неверная роль'); end if;
  if p_role is not null and not exists (select 1 from public.users where uid = public.app_uid() and role = 'SUPERUSER') then
    return jsonb_build_object('success', false, 'error', 'Роли меняет только главный администратор');
  end if;
  update public.users set frozen = coalesce(p_frozen, frozen),
                          verified_shop = coalesce(p_verified_shop, verified_shop),
                          role = coalesce(p_role, role)
  where uid = p_target_uid;
  return jsonb_build_object('success', found);
end $$;

create or replace function public.admin_toggle_archive_user(p_target_uid text, p_archive_status boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not public.app_is_admin() then return jsonb_build_object('success', false, 'error', 'Недостаточно прав'); end if;
  update public.users set is_archived = p_archive_status where uid = p_target_uid;
  if p_archive_status then delete from public.user_sessions where uid = p_target_uid; end if;
  return jsonb_build_object('success', found);
end $$;

create or replace function public.admin_delete_user(p_target_uid text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_name text;
begin
  if not public.app_is_admin() then return jsonb_build_object('success', false, 'error', 'Недостаточно прав'); end if;
  if p_target_uid = public.app_uid() then return jsonb_build_object('success', false, 'error', 'Нельзя удалить себя'); end if;
  select username into v_name from public.users where uid = p_target_uid;
  delete from public.ads where seller_uid = p_target_uid or (v_name is not null and lower(seller_username) = lower(v_name));
  delete from public.combos where shop_uid = p_target_uid;
  delete from public.users where uid = p_target_uid;
  return jsonb_build_object('success', true);
end $$;

create or replace function public.update_user_shop(p_identifier text, p_shop_data jsonb, p_token text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me text := public.app_uid();
begin
  if me is null then return jsonb_build_object('success', false, 'error', 'Требуется вход'); end if;
  if not (public.app_is_admin() or exists (select 1 from public.users where uid = me and (uid = p_identifier or username = p_identifier))) then
    return jsonb_build_object('success', false, 'error', 'Недостаточно прав');
  end if;
  update public.users set shop = p_shop_data where uid = p_identifier or username = p_identifier;
  return jsonb_build_object('success', found);
end $$;

create or replace function public.secure_manage_ad(p_ad_id text, p_caller_id text default null, p_action text default 'SET_STATUS', p_status text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me text := public.app_uid();
begin
  if me is null then return jsonb_build_object('success', false, 'error', 'Требуется вход'); end if;
  if p_action = 'SET_STATUS' and p_status in ('ACTIVE','SOLD','ARCHIVED','EXPIRED','WITHDRAWN') then
    update public.ads set status = p_status where id = p_ad_id and (seller_uid = me or public.app_is_admin());
    return jsonb_build_object('success', found);
  end if;
  return jsonb_build_object('success', false, 'error', 'Неизвестное действие');
end $$;

-- ---------- AVITOCASH (деньги: только через функции) ----------
create or replace function public.charge_avitocash(p_user_identifier text, p_amount numeric, p_action text, p_reason text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me text := public.app_uid(); v_bal numeric;
begin
  if me is null or p_amount is null or p_amount < 0 then return jsonb_build_object('success', false, 'error', 'Некорректный запрос'); end if;
  if p_action = 'DEDUCT' then
    update public.users set avitocash_balance = avitocash_balance - p_amount
    where uid = me and avitocash_balance >= p_amount and (uid = p_user_identifier or username = p_user_identifier)
    returning avitocash_balance into v_bal;
    if not found then return jsonb_build_object('success', false, 'error', 'Недостаточно средств'); end if;
  elsif p_action = 'ADD' and public.app_is_admin() then
    update public.users set avitocash_balance = avitocash_balance + p_amount
    where uid = p_user_identifier or username = p_user_identifier returning avitocash_balance into v_bal;
    if not found then return jsonb_build_object('success', false, 'error', 'Пользователь не найден'); end if;
  else
    return jsonb_build_object('success', false, 'error', 'Недостаточно прав');
  end if;
  return jsonb_build_object('success', true, 'new_balance', v_bal);
end $$;

create or replace function public.transfer_avitocash(sender_identifier text, recipient_identifier text, transfer_amount numeric)
returns jsonb language sql stable as $$ select jsonb_build_object('success', false, 'error', 'Переводы отключены') $$;
create or replace function public.purchase_ad_item(p_ad_id text, p_buyer_identifier text)
returns jsonb language sql stable as $$ select jsonb_build_object('success', false, 'error', 'Оплата внутри платформы отключена') $$;

-- ---------- ЗАЩИТА ОБЪЯВЛЕНИЙ И КОМБО (ТРИГГЕРЫ) ----------
-- Чужой пользователь может менять только likes / queue / views.
create or replace function public._guard_owner_cols() returns trigger
language plpgsql security definer set search_path = public as $$
declare owner_ok boolean;
begin
  owner_ok := public.app_is_admin() or (case when tg_table_name = 'ads' then old.seller_uid else (to_jsonb(old)->>'shop_uid') end) = public.app_uid();
  if owner_ok then return new; end if;
  if (to_jsonb(new) - 'likes' - 'queue' - 'views') is distinct from (to_jsonb(old) - 'likes' - 'queue' - 'views') then
    raise exception 'Недостаточно прав для изменения объявления' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists ads_guard on public.ads;
create trigger ads_guard before update on public.ads for each row execute function public._guard_owner_cols();
drop trigger if exists combos_guard on public.combos;
create trigger combos_guard before update on public.combos for each row execute function public._guard_owner_cols();

-- ---------- RLS ----------
alter table public.users enable row level security;
alter table public.user_sessions enable row level security;
alter table public.login_attempts enable row level security;
alter table public.ads enable row level security;
alter table public.combos enable row level security;
alter table public.categories enable row level security;
alter table public.reports enable row level security;
alter table public.system_settings enable row level security;

-- users: публичные поля видны всем (витрина магазинов), хэш/баланс/чеки/избранное — нет
drop policy if exists users_read on public.users;
create policy users_read on public.users for select to anon, authenticated using (not is_archived);
drop policy if exists users_update_own on public.users;
create policy users_update_own on public.users for update to anon, authenticated
  using (uid = public.app_uid()) with check (uid = public.app_uid());

drop policy if exists ads_read on public.ads;      create policy ads_read on public.ads for select to anon, authenticated using (true);
drop policy if exists ads_insert on public.ads;    create policy ads_insert on public.ads for insert to anon, authenticated
  with check (public.app_uid() is not null and (seller_uid = public.app_uid() or public.app_is_admin()));
drop policy if exists ads_update on public.ads;    create policy ads_update on public.ads for update to anon, authenticated using (true) with check (true);
drop policy if exists ads_delete on public.ads;    create policy ads_delete on public.ads for delete to anon, authenticated
  using (seller_uid = public.app_uid() or public.app_is_admin());

drop policy if exists combos_read on public.combos;   create policy combos_read on public.combos for select to anon, authenticated using (true);
drop policy if exists combos_insert on public.combos; create policy combos_insert on public.combos for insert to anon, authenticated
  with check (shop_uid = public.app_uid() or public.app_is_admin());
drop policy if exists combos_update on public.combos; create policy combos_update on public.combos for update to anon, authenticated using (true) with check (true);
drop policy if exists combos_delete on public.combos; create policy combos_delete on public.combos for delete to anon, authenticated
  using (shop_uid = public.app_uid() or public.app_is_admin());

drop policy if exists cat_read on public.categories;  create policy cat_read on public.categories for select to anon, authenticated using (true);
drop policy if exists cat_write on public.categories; create policy cat_write on public.categories for all to anon, authenticated
  using (public.app_is_admin()) with check (public.app_is_admin());

drop policy if exists set_read on public.system_settings;  create policy set_read on public.system_settings for select to anon, authenticated using (true);
drop policy if exists set_write on public.system_settings; create policy set_write on public.system_settings for all to anon, authenticated
  using (public.app_is_admin()) with check (public.app_is_admin());

drop policy if exists rep_insert on public.reports; create policy rep_insert on public.reports for insert to anon, authenticated with check (true);
drop policy if exists rep_admin on public.reports;  create policy rep_admin on public.reports for select to anon, authenticated using (public.app_is_admin());
drop policy if exists rep_del on public.reports;    create policy rep_del on public.reports for delete to anon, authenticated using (public.app_is_admin());

-- ---------- ПРАВА НА УРОВНЕ КОЛОНОК ----------
revoke all on public.users, public.user_sessions, public.login_attempts from anon, authenticated;
grant select (uid, username, kunya, gender, whatsapp, avatar, role, verified_shop, show_women_ads, frozen, is_archived, shop, created_at)
  on public.users to anon, authenticated;
grant update (username, kunya, whatsapp, avatar, favorites, show_women_ads, shop) on public.users to anon, authenticated;
grant select, insert, update, delete on public.ads, public.combos, public.categories, public.system_settings to anon, authenticated;
grant select, delete on public.reports to anon, authenticated;
grant insert on public.reports to anon, authenticated;

revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function
  public.app_uid(), public.app_is_admin(), public.app_token(),
  public.register_new_user(text,text,text,text,text,text,text), public.verify_user_login(text,text),
  public.logout(), public.get_me(), public.change_password(text), public.admin_list_users(),
  public.admin_manage_user(text,text,boolean,boolean,text), public.admin_toggle_archive_user(text,boolean),
  public.admin_delete_user(text), public.update_user_shop(text,jsonb,text),
  public.secure_manage_ad(text,text,text,text), public.charge_avitocash(text,numeric,text,text),
  public.transfer_avitocash(text,text,numeric), public.purchase_ad_item(text,text)
to anon, authenticated;

-- ---------- КАТЕГОРИИ ПО УМОЛЧАНИЮ ----------
insert into public.categories(id, name, icon) values
  ('electronics','Elektronik','fa-mobile-screen'),('transport','Vasıta & Araçlar','fa-car'),
  ('realestate','Emlak','fa-house'),('tools','Alet & Edavat','fa-hammer'),('home','Ev & Yaşam','fa-couch'),
  ('food','Gıda & Market','fa-utensils'),('fashion','Giyim & Moda','fa-shirt'),('services','Hizmetler','fa-wrench'),
  ('kids','Anne & Bebek','fa-baby'),('other','Diğer','fa-boxes-stacked')
on conflict (id) do nothing;

-- ---------- ХРАНИЛИЩЕ ФОТО (bucket listings) ----------
do $$ begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
    values ('listings','listings', true, 5242880, array['image/jpeg','image/png','image/webp'])
    on conflict (id) do update set public = true, file_size_limit = 5242880, allowed_mime_types = array['image/jpeg','image/png','image/webp'];
    execute 'drop policy if exists "listings read" on storage.objects';
    execute 'create policy "listings read" on storage.objects for select using (bucket_id = ''listings'')';
    execute 'drop policy if exists "listings upload" on storage.objects';
    execute 'create policy "listings upload" on storage.objects for insert to anon, authenticated with check (bucket_id = ''listings'' and public.app_uid() is not null)';
  end if;
end $$;

-- ---------- ПЕРВЫЙ АДМИНИСТРАТОР ----------
-- 1) Зарегистрируйтесь в приложении как обычный пользователь.
-- 2) Выполните (подставьте свой логин):
--    update public.users set role = 'SUPERUSER' where lower(username) = lower('ВАШ_ЛОГИН');
