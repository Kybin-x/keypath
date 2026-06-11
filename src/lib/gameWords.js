// 游戏词库：优先使用教师在后台配置的词库（app_config 表），否则用内置词库
import { supabase, dbAvailable } from './supabase'
import { GAME_WORDS } from '../data/texts'

let cache = null

export async function getGameWords() {
  if (cache) return cache
  cache = { ...GAME_WORDS }
  try {
    if (await dbAvailable()) {
      const { data } = await supabase.from('app_config').select('value').eq('key', 'game_words').maybeSingle()
      if (data?.value) {
        if (data.value.zh?.length) cache.zh = data.value.zh
        if (data.value.en?.length) cache.en = data.value.en
      }
    }
  } catch { /* 用内置词库兜底 */ }
  return cache
}

export function clearGameWordsCache() { cache = null }
