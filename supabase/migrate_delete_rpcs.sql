-- 学生/教师删除 RPC（在 Supabase SQL Editor 中运行一次）
-- 因为 users 表对 anon/authenticated 已 revoke DELETE，必须通过 SECURITY DEFINER 函数删除

create or replace function fn_delete_student(p_actor uuid, p_user_id uuid)
returns jsonb language plpgsql security definer as $$
declare actor_role text;
begin
  select role into actor_role from users where id = p_actor;
  if actor_role not in ('teacher', 'super') then
    return jsonb_build_object('ok', false, 'msg', '无权限');
  end if;
  delete from users where id = p_user_id and role = 'student';
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function fn_delete_students(p_actor uuid, p_ids uuid[])
returns jsonb language plpgsql security definer as $$
declare actor_role text;
begin
  select role into actor_role from users where id = p_actor;
  if actor_role not in ('teacher', 'super') then
    return jsonb_build_object('ok', false, 'msg', '无权限');
  end if;
  delete from users where id = any(p_ids) and role = 'student';
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function fn_delete_teacher(p_actor uuid, p_user_id uuid)
returns jsonb language plpgsql security definer as $$
declare actor_role text;
begin
  select role into actor_role from users where id = p_actor;
  if actor_role != 'super' then
    return jsonb_build_object('ok', false, 'msg', '仅超管可删除教师');
  end if;
  delete from users where id = p_user_id and role in ('teacher', 'super');
  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function fn_delete_student(uuid, uuid) to anon, authenticated;
grant execute on function fn_delete_students(uuid, uuid[]) to anon, authenticated;
grant execute on function fn_delete_teacher(uuid, uuid) to anon, authenticated;
