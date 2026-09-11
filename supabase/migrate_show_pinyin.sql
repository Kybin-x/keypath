-- 拼音提示开关迁移（在 Supabase SQL Editor 中运行一次）
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS show_pinyin boolean NOT NULL DEFAULT true;
