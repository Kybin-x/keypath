import { createClient } from '@supabase/supabase-js'

export const SUPABASE_URL = 'https://cvvomfuorizmbqtaeifb.supabase.co'
export const SUPABASE_KEY = 'sb_publishable_LXbfpfrMIhgtu0I3bp_NkA_A24QsWEB'

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

// 数据库是否可用（未运行 schema.sql 时为 false，应用以访客离线模式运行）
let _dbOk = null
export async function dbAvailable() {
  if (_dbOk !== null) return _dbOk
  try {
    const { error } = await supabase.from('achievements').select('id').limit(1)
    _dbOk = !error
  } catch { _dbOk = false }
  return _dbOk
}
