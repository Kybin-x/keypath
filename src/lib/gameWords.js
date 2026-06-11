// 词库：中文词语来自 app_config；英文单词（含释义）来自 words 表，按班级范围过滤
// 均以内置词库兜底
import { supabase, dbAvailable } from './supabase'
import { GAME_WORDS, EN_MEANINGS } from '../data/texts'

let cache = null

export async function getGameWords() {
  if (cache) return cache
  cache = { zh: GAME_WORDS.zh, en: GAME_WORDS.en, letters: GAME_WORDS.letters, enMap: { ...EN_MEANINGS } }
  try {
    if (!(await dbAvailable())) return cache
    // 中文词语（教师在后台配置）
    const { data: cfg } = await supabase.from('app_config').select('value').eq('key', 'game_words').maybeSingle()
    if (cfg?.value?.zh?.length) cache.zh = cfg.value.zh

    // 英文单词 + 释义：全站词 + 本班教师的词
    const { useUserStore } = await import('../stores/user')
    const u = useUserStore()
    let classTeacherId = null
    if (u.user?.class_id) {
      const { data: cls } = await supabase.from('classes').select('teacher_id').eq('id', u.user.class_id).maybeSingle()
      classTeacherId = cls?.teacher_id || null
    }
    const { data: rows } = await supabase.from('words').select('word, meaning, owner_id, is_global')
    if (rows?.length) {
      const visible = rows.filter(r => r.is_global !== false || r.owner_id === u.user?.id || (classTeacherId && r.owner_id === classTeacherId))
      if (visible.length) {
        cache.en = [...new Set(visible.map(r => r.word))]
        for (const r of visible) if (r.meaning) cache.enMap[r.word] = r.meaning
      }
    }
  } catch { /* 内置词库兜底 */ }
  return cache
}

export function clearGameWordsCache() { cache = null }
