// 成绩保存、打卡、成就解锁（登录后写库，访客仅本地）
import { supabase, dbAvailable } from './supabase'
import { useUserStore } from '../stores/user'

// 本地时区日期（避免 UTC 偏移导致凌晨打卡记到前一天）
export function localDay(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const today = () => localDay()

// 保存练习/游戏日志；返回新解锁成就列表
// lang：本次练习语言（zh/en/num/mix），用于速度成就分轨——中文看 CPM，英文看 WPM
export async function saveLog({ kind = 'practice', game = '', textId = null, result, lang = '' }) {
  const u = useUserStore()
  const unlocked = []
  if (!u.isLogin || !(await dbAvailable())) return { saved: false, unlocked }
  const uid = u.user.id
  const row = {
    user_id: uid, kind, game,
    text_id: textId && String(textId).length === 36 ? textId : null,
    cpm: result.cpm || 0, wpm: result.wpm || 0, accuracy: result.accuracy || 0,
    score: result.score || 0, duration_sec: result.activeSec || result.durationSec || 0,
    errors: result.errors || 0, error_keys: result.errorKeys || {},
  }
  await supabase.from('practice_logs').insert(row)

  // 打卡：单次练习 >= 60 秒
  if ((row.duration_sec || 0) >= 60) {
    const { data: c } = await supabase.from('checkins').select('practice_sec').eq('user_id', uid).eq('day', today()).maybeSingle()
    await supabase.from('checkins').upsert({ user_id: uid, day: today(), practice_sec: (c?.practice_sec || 0) + row.duration_sec })
  }
  unlocked.push(...await evaluateAchievements({ kind, result, lang }))
  return { saved: true, unlocked }
}

export async function saveTaskRecord(taskId, result, lang = '') {
  const u = useUserStore()
  if (!u.isLogin) return { unlocked: [] }
  await supabase.from('task_records').insert({
    task_id: taskId, student_id: u.user.id,
    cpm: result.cpm, wpm: result.wpm, accuracy: result.accuracy,
    duration_sec: result.activeSec, total_sec: result.durationSec, errors: result.errors,
  })
  const unlocked = await evaluateAchievements({ kind: 'task', result, taskId, lang })
  return { unlocked }
}

let _defs = null
async function defs() {
  if (_defs) return _defs
  const { data } = await supabase.from('achievements').select('*').order('sort')
  _defs = data || []
  return _defs
}

async function streakDays(uid) {
  const { data } = await supabase.from('checkins').select('day').eq('user_id', uid).order('day', { ascending: false }).limit(60)
  if (!data?.length) return 0
  let n = 0
  const d = new Date()
  if (data[0].day !== today()) d.setDate(d.getDate() - 1) // 今天还没打卡则从昨天数
  for (const row of data) {
    if (row.day === localDay(d)) { n++; d.setDate(d.getDate() - 1) } else break
  }
  return n
}

// 评估并解锁成就，返回新解锁的成就对象
export async function evaluateAchievements({ kind, result = {}, taskId = null, loginEvent = false, lang = '' }) {
  const u = useUserStore()
  if (!u.isLogin || !(await dbAvailable())) return []
  const uid = u.user.id
  const all = await defs()
  const { data: owned } = await supabase.from('user_achievements').select('achievement_id').eq('user_id', uid)
  const has = new Set((owned || []).map(o => o.achievement_id))
  const candidates = []
  const hour = new Date().getHours()

  for (const a of all) {
    if (has.has(a.id)) continue
    let ok = false
    switch (a.rule_type) {
      case 'first_login': ok = loginEvent; break
      case 'first_practice': ok = kind === 'practice'; break
      case 'first_game': ok = kind === 'game'; break
      // 速度成就分轨：中文练习看 CPM（字/分），英文练习看 WPM（词/分）
      case 'cpm': ok = lang === 'zh' && (result.cpm || 0) >= Number(a.threshold); break
      case 'wpm': ok = lang === 'en' && (result.wpm || 0) >= Number(a.threshold); break
      case 'accuracy': ok = ['practice', 'task'].includes(kind) && (result.accuracy || 0) >= Number(a.threshold); break
      case 'streak': ok = (await streakDays(uid)) >= Number(a.threshold); break
      case 'night': ok = !loginEvent && (hour >= 0 && hour < 5); break
      case 'slow_start': ok = kind === 'practice' && lang === 'zh' && (result.cpm || 0) > 0 && (result.cpm || 0) < Number(a.threshold); break
      case 'retry': {
        if (kind === 'task' && taskId) {
          const { count } = await supabase.from('task_records').select('id', { count: 'exact', head: true }).eq('task_id', taskId).eq('student_id', uid)
          ok = (count || 0) >= Number(a.threshold)
        }
        break
      }
      case 'first_task': ok = kind === 'task'; break
      case 'all_tasks': {
        if (kind !== 'task') break
        const { data: ts } = await supabase.from('task_students').select('task_id').eq('student_id', uid)
        if (!ts?.length) break
        const ids = ts.map(t => t.task_id)
        const { data: recs } = await supabase.from('task_records').select('task_id').eq('student_id', uid).in('task_id', ids)
        ok = new Set((recs || []).map(r => r.task_id)).size >= ids.length
        break
      }
    }
    if (ok) candidates.push(a)
  }
  if (candidates.length) {
    await supabase.from('user_achievements').insert(candidates.map(a => ({ user_id: uid, achievement_id: a.id })))
  }
  return candidates
}
