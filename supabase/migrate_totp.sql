-- ============================================================
-- TOTP 迁移脚本（已有数据库执行一次即可）
-- 在 Supabase SQL Editor 中全选粘贴运行
-- ============================================================

-- 1. 添加 TOTP 字段
alter table users add column if not exists totp_secret text;
alter table users add column if not exists totp_enabled boolean not null default false;

-- 2. 更新 fn_login（新增 totp_required 返回值）
create or replace function fn_login(p_account text, p_name text, p_password text)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare u users%rowtype; cname text;
begin
  select * into u from users where student_no = p_account;
  if u.id is null then return json_build_object('ok', false, 'msg', '账号不存在'); end if;
  if u.role = 'student' and trim(p_name) <> '' and u.name <> trim(p_name) then
    return json_build_object('ok', false, 'msg', '姓名与学号不匹配');
  end if;
  if u.password_hash <> crypt(p_password, u.password_hash) then
    return json_build_object('ok', false, 'msg', '密码错误');
  end if;
  select name into cname from classes where id = u.class_id;
  return json_build_object(
    'ok', true,
    'totp_required', coalesce(u.totp_enabled, false) and u.role in ('teacher','super'),
    'user', json_build_object(
      'id', u.id, 'student_no', u.student_no, 'name', u.name, 'role', u.role,
      'class_id', u.class_id, 'class_name', cname, 'avatar', u.avatar,
      'must_complete_profile', u.must_complete_profile));
end $$;

-- 3. 新增 fn_get_totp_secret
create or replace function fn_get_totp_secret(p_account text, p_password text)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare u users%rowtype;
begin
  select * into u from users where student_no = p_account and role in ('teacher','super');
  if u.id is null then return json_build_object('ok', false, 'msg', '账号不存在'); end if;
  if u.password_hash <> crypt(p_password, u.password_hash) then
    return json_build_object('ok', false, 'msg', '密码错误');
  end if;
  if not coalesce(u.totp_enabled, false) then return json_build_object('ok', false, 'msg', '未启用TOTP'); end if;
  return json_build_object('ok', true, 'secret', u.totp_secret);
end $$;

-- 4. 新增 fn_save_totp
create or replace function fn_save_totp(p_user_id uuid, p_secret text, p_enabled boolean)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare u_role text;
begin
  select role into u_role from users where id = p_user_id;
  if u_role not in ('teacher','super') then return json_build_object('ok', false, 'msg', '无权限'); end if;
  update users set totp_secret = p_secret, totp_enabled = coalesce(p_enabled, false) where id = p_user_id;
  return json_build_object('ok', true);
end $$;

-- 5. 授权
grant execute on function fn_get_totp_secret, fn_save_totp to anon, authenticated;
