-- 学生/教师删除 RPC（在 Supabase SQL Editor 中运行一次）
-- 注意：必须加 set search_path = public, extensions，与其他函数保持一致

create or replace function fn_delete_student(p_actor uuid, p_user_id uuid)
returns jsonb language plpgsql security definer
set search_path = public, extensions
as $$
declare
  actor_role text;
  deleted_count int;
begin
  select role into actor_role from users where id = p_actor;
  if actor_role not in ('teacher', 'super') then
    return jsonb_build_object('ok', false, 'msg', '无权限');
  end if;
  delete from users where id = p_user_id;
  get diagnostics deleted_count = row_count;
  if deleted_count = 0 then
    return jsonb_build_object('ok', false, 'msg', '未找到该记录');
  end if;
  return jsonb_build_object('ok', true, 'deleted', deleted_count);
exception when others then
  return jsonb_build_object('ok', false, 'msg', sqlerrm);
end;
$$;

create or replace function fn_delete_students(p_actor uuid, p_ids uuid[])
returns jsonb language plpgsql security definer
set search_path = public, extensions
as $$
declare
  actor_role text;
  deleted_count int;
begin
  select role into actor_role from users where id = p_actor;
  if actor_role not in ('teacher', 'super') then
    return jsonb_build_object('ok', false, 'msg', '无权限');
  end if;
  delete from users where id = any(p_ids);
  get diagnostics deleted_count = row_count;
  return jsonb_build_object('ok', true, 'deleted', deleted_count);
exception when others then
  return jsonb_build_object('ok', false, 'msg', sqlerrm);
end;
$$;

create or replace function fn_delete_teacher(p_actor uuid, p_user_id uuid)
returns jsonb language plpgsql security definer
set search_path = public, extensions
as $$
declare
  actor_role text;
  deleted_count int;
begin
  select role into actor_role from users where id = p_actor;
  if actor_role != 'super' then
    return jsonb_build_object('ok', false, 'msg', '仅超管可删除教师');
  end if;
  delete from users where id = p_user_id and role in ('teacher', 'super');
  get diagnostics deleted_count = row_count;
  if deleted_count = 0 then
    return jsonb_build_object('ok', false, 'msg', '未找到该教师记录');
  end if;
  return jsonb_build_object('ok', true, 'deleted', deleted_count);
exception when others then
  return jsonb_build_object('ok', false, 'msg', sqlerrm);
end;
$$;

grant execute on function fn_delete_student(uuid, uuid) to anon, authenticated;
grant execute on function fn_delete_students(uuid, uuid[]) to anon, authenticated;
grant execute on function fn_delete_teacher(uuid, uuid) to anon, authenticated;

-- 诊断查询：验证函数能否正常调用（替换 UUID 后执行）
-- SELECT fn_delete_student(
--   (SELECT id FROM users WHERE role = 'super' LIMIT 1),
--   (SELECT id FROM users WHERE role = 'student' LIMIT 1)
-- );
