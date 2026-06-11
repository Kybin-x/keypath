-- ============================================================
-- 键途 KeyPath — Supabase 数据库初始化脚本
-- 使用方法：在 Supabase 控制台 → SQL Editor 中粘贴本文件全部内容并运行
-- ============================================================

create extension if not exists pgcrypto;

-- ---------- 班级表 ----------
create table if not exists classes (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  teacher_id uuid,
  created_at timestamptz default now()
);

-- ---------- 用户表 ----------
create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  student_no text unique,            -- 学号（教师/管理员为登录账号）
  name text not null,
  role text not null default 'student' check (role in ('student','teacher','super')),
  class_id uuid references classes(id) on delete set null,
  password_hash text not null,
  avatar text default '',            -- DiceBear 配置或图片URL
  must_complete_profile boolean default true,
  created_at timestamptz default now()
);
alter table classes add constraint classes_teacher_fk
  foreign key (teacher_id) references users(id) on delete set null;

-- ---------- 文稿表 ----------
create table if not exists texts (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  content text not null,
  lang text not null default 'zh' check (lang in ('zh','en','num','mix')),
  difficulty int not null default 1 check (difficulty between 1 and 3),
  source text not null default 'builtin' check (source in ('builtin','user')),
  owner_id uuid references users(id) on delete cascade,
  category text default '',          -- 自定义分类
  is_global boolean default true,    -- 全站可见；false=仅所属教师的班级可见
  created_at timestamptz default now()
);
-- 旧库升级（重复运行无副作用）
alter table texts add column if not exists category text default '';
alter table texts add column if not exists is_global boolean default true;

-- ---------- 任务表 ----------
create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  note text default '',
  text_id uuid references texts(id) on delete set null,
  teacher_id uuid references users(id) on delete cascade,
  start_at timestamptz not null default now(),
  deadline timestamptz not null,
  duration_sec int not null default 300,
  allow_retry boolean default true,
  score_rule text not null default 'best' check (score_rule in ('best','last')),
  status text not null default 'open' check (status in ('draft','open','closed','archived')),
  created_at timestamptz default now()
);

create table if not exists task_students (
  task_id uuid references tasks(id) on delete cascade,
  student_id uuid references users(id) on delete cascade,
  primary key (task_id, student_id)
);

-- ---------- 任务成绩表 ----------
create table if not exists task_records (
  id uuid primary key default gen_random_uuid(),
  task_id uuid references tasks(id) on delete cascade,
  student_id uuid references users(id) on delete cascade,
  cpm numeric not null default 0,
  wpm numeric not null default 0,
  accuracy numeric not null default 0,
  duration_sec numeric not null default 0,   -- 实际打字用时
  total_sec numeric not null default 0,      -- 含停顿总时长
  errors int not null default 0,
  submitted_at timestamptz default now()
);
create index if not exists idx_task_records_task on task_records(task_id);
create index if not exists idx_task_records_student on task_records(student_id);

-- ---------- 练习日志表（练习/游戏，不计入任务成绩） ----------
create table if not exists practice_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  kind text not null default 'practice' check (kind in ('practice','game')),
  game text default '',              -- 游戏类型标识
  text_id uuid,
  cpm numeric default 0,
  wpm numeric default 0,
  accuracy numeric default 0,
  score numeric default 0,           -- 游戏得分
  duration_sec numeric default 0,
  errors int default 0,
  error_keys jsonb default '{}',     -- 键位错误统计 {"a": 3, ...}
  created_at timestamptz default now()
);
create index if not exists idx_practice_logs_user on practice_logs(user_id, created_at);

-- ---------- 成就表 ----------
create table if not exists achievements (
  id text primary key,               -- 如 'cpm_100'
  icon text not null default '🏅',
  title text not null,
  description text not null,
  category text not null default 'misc',
  rule_type text not null,           -- first_login/first_practice/first_game/cpm/accuracy/streak/first_task/all_tasks/night/slow_start/retry
  threshold numeric default 0,
  hidden boolean default false,
  sort int default 0
);

create table if not exists user_achievements (
  user_id uuid references users(id) on delete cascade,
  achievement_id text references achievements(id) on delete cascade,
  unlocked_at timestamptz default now(),
  primary key (user_id, achievement_id)
);

-- ---------- 打卡表 ----------
create table if not exists checkins (
  user_id uuid references users(id) on delete cascade,
  day date not null,
  practice_sec numeric not null default 0,
  primary key (user_id, day)
);

-- ---------- 应用配置表（游戏词库等全局配置） ----------
create table if not exists app_config (
  key text primary key,
  value jsonb not null default '{}',
  updated_at timestamptz default now()
);

-- ---------- 个人设置表 ----------
create table if not exists user_settings (
  user_id uuid primary key references users(id) on delete cascade,
  data jsonb not null default '{}',
  updated_at timestamptz default now()
);

-- ============================================================
-- 行级安全：本应用使用自定义登录（学号+密码），通过 publishable key 访问。
-- 密码散列经列级权限保护，登录/改密/导入走 SECURITY DEFINER 函数。
-- ============================================================
alter table classes enable row level security;
alter table users enable row level security;
alter table texts enable row level security;
alter table tasks enable row level security;
alter table task_students enable row level security;
alter table task_records enable row level security;
alter table practice_logs enable row level security;
alter table achievements enable row level security;
alter table user_achievements enable row level security;
alter table checkins enable row level security;
alter table user_settings enable row level security;
alter table app_config enable row level security;

do $$ declare t text;
begin
  foreach t in array array['classes','users','texts','tasks','task_students','task_records','practice_logs','achievements','user_achievements','checkins','user_settings','app_config'] loop
    execute format('drop policy if exists allow_all on %I', t);
    execute format('create policy allow_all on %I for all to anon, authenticated using (true) with check (true)', t);
  end loop;
end $$;

-- 保护密码散列：撤销逐列权限后仅授予安全列
revoke all on users from anon, authenticated;
grant select (id, student_no, name, role, class_id, avatar, must_complete_profile, created_at) on users to anon, authenticated;
grant update (name, class_id, avatar, must_complete_profile) on users to anon, authenticated;

-- ============================================================
-- 登录 / 密码 / 导入 函数（SECURITY DEFINER）
-- ============================================================

-- 学生登录：学号 + 姓名 + 密码；教师/管理员登录：账号 + 密码（p_name 传空）
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
  return json_build_object('ok', true, 'user', json_build_object(
    'id', u.id, 'student_no', u.student_no, 'name', u.name, 'role', u.role,
    'class_id', u.class_id, 'class_name', cname, 'avatar', u.avatar,
    'must_complete_profile', u.must_complete_profile));
end $$;

create or replace function fn_change_password(p_user_id uuid, p_old text, p_new text)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare u users%rowtype;
begin
  select * into u from users where id = p_user_id;
  if u.id is null then return json_build_object('ok', false, 'msg', '用户不存在'); end if;
  if u.password_hash <> crypt(p_old, u.password_hash) then
    return json_build_object('ok', false, 'msg', '原密码错误');
  end if;
  update users set password_hash = crypt(p_new, gen_salt('bf')) where id = p_user_id;
  return json_build_object('ok', true);
end $$;

-- 教师批量导入学生：[{student_no, name, class_name}]，默认密码 123
create or replace function fn_import_students(p_actor uuid, p_rows jsonb)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare actor_role text; r jsonb; cid uuid; cnt int := 0;
begin
  select role into actor_role from users where id = p_actor;
  if actor_role not in ('teacher','super') then
    return json_build_object('ok', false, 'msg', '无权限');
  end if;
  for r in select * from jsonb_array_elements(p_rows) loop
    select id into cid from classes where name = r->>'class_name';
    if cid is null then
      insert into classes(name, teacher_id) values (r->>'class_name', p_actor) returning id into cid;
    end if;
    insert into users(student_no, name, role, class_id, password_hash)
    values (r->>'student_no', r->>'name', 'student', cid, crypt(coalesce(r->>'password','123'), gen_salt('bf')))
    on conflict (student_no) do update set name = excluded.name, class_id = excluded.class_id;
    cnt := cnt + 1;
  end loop;
  return json_build_object('ok', true, 'count', cnt);
end $$;

-- 超级管理员创建教师账号
create or replace function fn_create_teacher(p_actor uuid, p_account text, p_name text, p_password text)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare actor_role text;
begin
  select role into actor_role from users where id = p_actor;
  if actor_role <> 'super' then return json_build_object('ok', false, 'msg', '仅超级管理员可创建教师'); end if;
  insert into users(student_no, name, role, password_hash, must_complete_profile)
  values (p_account, p_name, 'teacher', crypt(p_password, gen_salt('bf')), false);
  return json_build_object('ok', true);
end $$;

-- 重置学生密码为 123（教师）
create or replace function fn_reset_password(p_actor uuid, p_user_id uuid)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare actor_role text;
begin
  select role into actor_role from users where id = p_actor;
  if actor_role not in ('teacher','super') then return json_build_object('ok', false, 'msg', '无权限'); end if;
  update users set password_hash = crypt('123', gen_salt('bf')) where id = p_user_id;
  return json_build_object('ok', true);
end $$;

grant execute on function fn_login, fn_change_password, fn_import_students, fn_create_teacher, fn_reset_password to anon, authenticated;

-- ============================================================
-- 种子数据
-- ============================================================

-- 超级管理员：账号 admin，密码 admin123（请登录后立即修改）
insert into users(student_no, name, role, password_hash, must_complete_profile)
values ('admin', '超级管理员', 'super', crypt('admin123', gen_salt('bf')), false)
on conflict (student_no) do nothing;

-- 成就定义
insert into achievements(id, icon, title, description, category, rule_type, threshold, hidden, sort) values
('first_login',   '🎯', '初来乍到', '首次登录', '新手成就', 'first_login', 0, false, 1),
('first_practice','⌨️', '初试身手', '完成第一次练习', '新手成就', 'first_practice', 0, false, 2),
('first_game',    '🎮', '游戏新人', '完成第一个游戏', '新手成就', 'first_game', 0, false, 3),
('cpm_100', '⚡', '小试牛刀', 'CPM 超过 100', '速度成就', 'cpm', 100, false, 10),
('cpm_200', '🚀', '飞速前进', 'CPM 超过 200', '速度成就', 'cpm', 200, false, 11),
('cpm_300', '💨', '键盘飞人', 'CPM 超过 300', '速度成就', 'cpm', 300, false, 12),
('cpm_400', '🏆', '打字大师', 'CPM 超过 400', '速度成就', 'cpm', 400, false, 13),
('acc_95',  '🎯', '精准射手', '准确率超过 95%', '准确率成就', 'accuracy', 95, false, 20),
('acc_100', '💎', '完美主义', '准确率 100%', '准确率成就', 'accuracy', 100, false, 21),
('streak_3',  '📅', '三日打卡', '连续 3 天练习', '坚持成就', 'streak', 3, false, 30),
('streak_7',  '🔥', '周冠军', '连续 7 天练习', '坚持成就', 'streak', 7, false, 31),
('streak_30', '💪', '月度达人', '连续 30 天练习', '坚持成就', 'streak', 30, false, 32),
('first_task', '✅', '使命必达', '完成第一个任务', '任务成就', 'first_task', 0, false, 40),
('all_tasks',  '🌟', '全勤战士', '完成所有任务', '任务成就', 'all_tasks', 0, false, 41),
('night_owl',  '🌙', '夜猫子', '深夜 12 点后练习', '隐藏成就', 'night', 0, true, 50),
('slow_start', '🐢', '龟速起步', '首次练习 CPM 低于 20，万事开头难！', '隐藏成就', 'slow_start', 20, true, 51),
('never_give_up', '🔄', '不服输', '同一任务提交 5 次以上', '隐藏成就', 'retry', 5, true, 52)
on conflict (id) do nothing;

-- 内置文稿
insert into texts(title, content, lang, difficulty, source) values
('基准键位 ASDF JKL;', 'asdf jkl; asdf jkl; fjdk slal fjdk slal jjff kkdd llss ;;aa fdsa jkl; lkjf dsa; alsk djfj sakl fdj; askl fjd; lask fdjs klaf jdls', 'en', 1, 'builtin'),
('常用单词初级', 'the and you that was for are with his they this have from one had word but not what all were when your can said there use each which she how their time will way about many then them', 'en', 1, 'builtin'),
('英文短文：The Sun', 'The sun rises in the east and sets in the west. Every morning the sky turns from dark blue to bright gold. Birds begin to sing and the city slowly wakes up. A new day always brings new chances to learn and to grow.', 'en', 2, 'builtin'),
('商务英语词汇', 'order customer payment delivery invoice discount refund product price market brand supply chain warehouse logistics service quality contract negotiate profit', 'en', 3, 'builtin'),
('中文常用词语', '我们 学习 工作 时间 问题 学生 老师 电脑 键盘 练习 进步 努力 坚持 目标 梦想 成功 快乐 健康 朋友 家人 学校 班级 知识 能力 思考', 'zh', 1, 'builtin'),
('中文短文：晨光', '清晨的阳光洒在窗台上，新的一天开始了。教室里传来键盘的敲击声，同学们正在认真练习打字。熟能生巧，每一次练习都是一次进步。只要坚持不懈，速度和准确率都会稳步提升。', 'zh', 2, 'builtin'),
('电商专业术语', '订单 客服 物流 仓储 售后 退款 评价 店铺 流量 转化率 客单价 复购率 直播带货 供应链 库存 促销 满减 优惠券 详情页 主图', 'zh', 3, 'builtin'),
('纯数字练习', '157 9320 48 6210 735 8946 1029 3847 5610 2938 4756 1203 9485 7621 3059 8412 6793 0524 1867 4930', 'num', 1, 'builtin'),
('符号练习', '!@# $%^ &*( )_+ -=[ ]{} ;:\" <>? ,./ ~`| (a+b)*c {x:y} [1,2] a&&b x||y a!=b c>=d e<=f', 'num', 2, 'builtin'),
('数字符号混合', 'No.42 100% $59.9 (2024) 3.14 a=b+1 50/50 #1st 7*8=56 [OK] 95.5% ¥128 12:30 80kg 1+1=2 x<10 y>0', 'num', 3, 'builtin')
on conflict do nothing;

-- 完成。默认管理员：admin / admin123
