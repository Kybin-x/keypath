<script setup>
// 教学管理：班级总览 / 学生管理 / 文稿管理 / 任务管理 / 出勤 / 成就配置 / 教师账号(超管)
import { ref, computed, onMounted } from 'vue'
import {
  NCard, NTabs, NTabPane, NButton, NSpace, NInput, NSelect, NDatePicker, NInputNumber, NSwitch,
  NRadioGroup, NRadioButton, NTag, NEmpty, NSpin, NModal, NTransfer, NStatistic, NGrid, NGi,
  NTable, useMessage, NCheckbox, NCheckboxGroup, NPopconfirm, NUpload,
} from 'naive-ui'
import { supabase } from '../lib/supabase'
import { useUserStore } from '../stores/user'
import { GAME_WORDS, EN_MEANINGS } from '../data/texts'
import { clearGameWordsCache } from '../lib/gameWords'
import { parseXlsxRows } from '../lib/zip'
import { localDay } from '../lib/records'

const message = useMessage()
const user = useUserStore()

const loading = ref(true)
const classes = ref([])
const students = ref([])
const teachers = ref([])
const texts = ref([])
const tasks = ref([])
const records = ref([])
const checkinsToday = ref([])
const achievements = ref([])
const logs = ref([])

async function loadAll() {
  loading.value = true
  try {
    const today = localDay()
    const [c, s, te, t, k, r, ci, a, l] = await Promise.all([
      supabase.from('classes').select('*').order('name'),
      supabase.from('users').select('id, student_no, name, class_id, role').eq('role', 'student').order('student_no'),
      supabase.from('users').select('id, student_no, name, role, created_at').in('role', ['teacher', 'super']).order('created_at'),
      supabase.from('texts').select('*').order('created_at'),
      supabase.from('tasks').select('*').order('created_at', { ascending: false }),
      supabase.from('task_records').select('*'),
      supabase.from('checkins').select('user_id, practice_sec').eq('day', today),
      supabase.from('achievements').select('*').order('sort'),
      supabase.from('practice_logs').select('user_id, kind, cpm, accuracy, created_at').eq('kind', 'practice').limit(5000),
    ])
    classes.value = c.data || []; students.value = s.data || []
    teachers.value = te.data || []
    texts.value = t.data || []; tasks.value = k.data || []
    records.value = r.data || []; checkinsToday.value = ci.data || []
    achievements.value = a.data || []; logs.value = l.data || []
  } finally { loading.value = false }
}
onMounted(() => { loadAll(); loadGameWordsConfig() })

const classMap = computed(() => Object.fromEntries(classes.value.map(c => [c.id, c.name])))
const stuMap = computed(() => Object.fromEntries(students.value.map(s => [s.id, s])))

// ---- 班级总览 ----
const classStats = computed(() => classes.value.map(c => {
  const ids = new Set(students.value.filter(s => s.class_id === c.id).map(s => s.id))
  const recs = [...records.value.filter(r => ids.has(r.student_id)), ...logs.value.filter(l => ids.has(l.user_id))]
  const avg = (arr, f) => arr.length ? Math.round(arr.reduce((a, b) => a + Number(f(b)), 0) / arr.length) : 0
  return {
    ...c, count: ids.size,
    avgCpm: avg(recs, r => r.cpm),
    avgAcc: recs.length ? (recs.reduce((a, b) => a + Number(b.accuracy), 0) / recs.length).toFixed(1) : '—',
    checkedToday: checkinsToday.value.filter(x => ids.has(x.user_id)).length,
  }
}))

// ---- 学生导入 ----
const importText = ref('')
const importing = ref(false)
async function doImport() {
  const rows = importText.value.split('\n').map(l => l.trim()).filter(Boolean).map(l => {
    const parts = l.split(/[,，\t]/).map(x => x.trim())
    return { student_no: parts[0], name: parts[1], class_name: parts[2] }
  }).filter(r => r.student_no && r.name && r.class_name)
  if (!rows.length) return message.warning('没有有效数据。格式：学号,姓名,班级（每行一个）')
  importing.value = true
  try {
    const { data, error } = await supabase.rpc('fn_import_students', { p_actor: user.user.id, p_rows: rows })
    if (error) throw error
    if (!data.ok) throw new Error(data.msg)
    message.success(`成功导入 ${data.count} 名学生（默认密码 123）`)
    importText.value = ''
    loadAll()
  } catch (e) { message.error('导入失败：' + e.message) } finally { importing.value = false }
}
// 导入模板下载 / 文件导入
function downloadTemplate() {
  const csv = '﻿学号,姓名,班级\n20240101,张三,电商2401\n20240102,李四,电商2401\n20240201,王五,电商2402\n'
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
  a.download = '学生导入模板.csv'
  a.click()
}
async function importFromFile({ file }) {
  let text = await file.file.text()
  text = text.replace(/^﻿/, '')
  // 跳过表头行
  const lines = text.split('\n').filter(l => l.trim() && !/学号/.test(l))
  importText.value = lines.join('\n')
  message.info(`已读取 ${lines.length} 行，请核对后点击导入`)
  return false
}

async function resetPwd(s) {
  const { data, error } = await supabase.rpc('fn_reset_password', { p_actor: user.user.id, p_user_id: s.id })
  if (error || !data.ok) message.error('重置失败')
  else message.success(`${s.name} 的密码已重置为 123`)
}
async function removeStudent(s) {
  await supabase.from('users').delete().eq('id', s.id)
  message.success('已删除')
  loadAll()
}
const stuClassFilter = ref(null)
const filteredStudents = computed(() => stuClassFilter.value
  ? students.value.filter(s => s.class_id === stuClassFilter.value) : students.value)

// ---- 文稿管理（新增 / 编辑 / 分类 / 班级范围） ----
const showText = ref(false)
const textForm = ref({ id: null, title: '', content: '', lang: 'zh', difficulty: 1, category: '' })
// 教师仅见全站文稿与自己的文稿；超管全见
const visibleTexts = computed(() => user.isSuper ? texts.value
  : texts.value.filter(t => t.is_global !== false || t.owner_id === user.user.id))
const actualCategories = computed(() => [...new Set(texts.value.map(t => t.category).filter(Boolean))])
const categoryOptions = computed(() => {
  const set = new Set(actualCategories.value)
  // 没有任何分类时给出常用预设，引导教师建立分类体系
  if (!set.size) ['课文', '单词', '数字符号', '专业术语'].forEach(c => set.add(c))
  return [...set].map(c => ({ label: c, value: c }))
})

// ---- 文稿表格筛选（分类多选 / 语言 / 难度 / 来源） ----
const tFilter = ref({ cats: [], lang: null, diff: null, source: null })
function sourceOf(t) {
  if (t.source !== 'builtin') return 'student'
  return teacherMap.value[t.owner_id]?.role === 'teacher' ? 'teacher' : 'builtin'
}
const tableTexts = computed(() => visibleTexts.value.filter(t => {
  const f = tFilter.value
  if (f.cats.length && !f.cats.includes(t.category || '__none__')) return false
  if (f.lang && t.lang !== f.lang) return false
  if (f.diff && t.difficulty !== f.diff) return false
  if (f.source && sourceOf(t) !== f.source) return false
  return true
}))
const catFilterOptions = computed(() => [
  ...actualCategories.value.map(c => ({ label: c, value: c })),
  { label: '未分类', value: '__none__' },
])
const DIFF_OPTS = [{ label: '初级', value: 1 }, { label: '中级', value: 2 }, { label: '高级', value: 3 }]
const SOURCE_OPTS = [{ label: '内置', value: 'builtin' }, { label: '教师', value: 'teacher' }, { label: '学生', value: 'student' }]

// ---- 任务发布的文稿选择：分类筛选 + 输入搜索 ----
const taskTextCat = ref(null)
const taskTextOptions = computed(() => visibleTexts.value
  .filter(t => !taskTextCat.value || (taskTextCat.value === '__none__' ? !t.category : t.category === taskTextCat.value))
  .map(t => ({
    label: `${t.category ? `[${t.category}] ` : ''}${t.title}（${t.content.length}字 · ${LANGS.find(l => l.value === t.lang)?.label || ''}）`,
    value: t.id,
  })))
function newText() {
  textForm.value = { id: null, title: '', content: '', lang: 'zh', difficulty: 1, category: '' }
  showText.value = true
}
function editText(t) {
  textForm.value = { id: t.id, title: t.title, content: t.content, lang: t.lang, difficulty: t.difficulty, category: t.category || '' }
  showText.value = true
}
async function saveText() {
  const f = textForm.value
  if (!f.title || !f.content) return message.warning('请填写标题和内容')
  const fields = { title: f.title, content: f.content, lang: f.lang, difficulty: f.difficulty, category: f.category || '' }
  if (f.id) {
    const { error } = await supabase.from('texts').update(fields).eq('id', f.id)
    if (error) return message.error(error.message)
    message.success('文稿已更新')
  } else {
    // 超管添加 → 全站；教师添加 → 仅自己班级可见，超管可在列表中开放全站
    const { error } = await supabase.from('texts').insert({ ...fields, source: 'builtin', owner_id: user.user.id, is_global: user.isSuper })
    if (error) return message.error(error.message)
    message.success(user.isSuper ? '文稿已添加（全站可用）' : '文稿已添加（仅你的班级可见）')
  }
  showText.value = false
  loadAll()
}
async function toggleGlobal(t, v) {
  const { error } = await supabase.from('texts').update({ is_global: v }).eq('id', t.id)
  if (error) return message.error(error.message)
  t.is_global = v
  message.success(v ? '已设为全站使用' : '已改为仅该教师班级使用')
}

// ---- 教师账号管理（超管） ----
const teacherMap = computed(() => Object.fromEntries(teachers.value.map(t => [t.id, t])))
async function resetTeacherPwd(t) {
  const { data, error } = await supabase.rpc('fn_reset_password', { p_actor: user.user.id, p_user_id: t.id })
  if (error || !data.ok) message.error('重置失败' + (data?.msg ? '：' + data.msg : ''))
  else message.success(`${t.name} 的密码已重置为 123`)
}
async function renameTeacher(t) {
  const { error } = await supabase.from('users').update({ name: t.name }).eq('id', t.id)
  if (error) message.error(error.message)
  else message.success('已保存')
}
async function removeTeacher(t) {
  await supabase.from('users').delete().eq('id', t.id)
  message.success('已删除教师账号')
  loadAll()
}

// ---- 词库配置：中文词语（app_config）+ 英文单词带释义（words 表） ----
const gameWordsZh = ref('')
const wordPairs = ref('')   // 每行：单词,中文释义
async function loadGameWordsConfig() {
  const { data } = await supabase.from('app_config').select('value').eq('key', 'game_words').maybeSingle()
  gameWordsZh.value = (data?.value?.zh?.length ? data.value.zh : GAME_WORDS.zh).join('\n')
  try {
    const { data: rows } = await supabase.from('words').select('word, meaning').eq('owner_id', user.user.id).order('created_at')
    if (rows?.length) wordPairs.value = rows.map(r => `${r.word},${r.meaning}`).join('\n')
    else if (user.isSuper) wordPairs.value = Object.entries(EN_MEANINGS).map(([w, m]) => `${w},${m}`).join('\n')
  } catch { /* words 表未创建 */ }
}
async function saveZhWords() {
  const zh = gameWordsZh.value.split('\n').map(w => w.trim()).filter(Boolean)
  if (!zh.length) return message.warning('中文词库不能为空')
  const { error } = await supabase.from('app_config').upsert({ key: 'game_words', value: { zh }, updated_at: new Date().toISOString() })
  if (error) return message.error('保存失败：' + error.message)
  clearGameWordsCache()
  message.success(`中文词库已更新：${zh.length} 个词语`)
}
function parseWordPairs() {
  return wordPairs.value.split('\n').map(l => l.trim()).filter(Boolean).map(l => {
    const [word, ...rest] = l.split(/[,，\t]/).map(x => x.trim())
    return { word, meaning: rest.join(' ') || '' }
  }).filter(p => p.word && /^[a-zA-Z' -]+$/.test(p.word))
}
async function saveWordPairs() {
  const pairs = parseWordPairs()
  if (!pairs.length) return message.warning('没有有效的单词行，格式：单词,中文释义')
  const noMeaning = pairs.filter(p => !p.meaning).length
  await supabase.from('words').delete().eq('owner_id', user.user.id)
  const { error } = await supabase.from('words').insert(pairs.map(p => ({ ...p, owner_id: user.user.id, is_global: user.isSuper })))
  if (error) return message.error('保存失败：' + error.message + '（若提示表不存在，请在 Supabase 运行最新 schema.sql）')
  clearGameWordsCache()
  message.success(`单词词库已保存：${pairs.length} 个单词${noMeaning ? `（${noMeaning} 个缺少释义）` : ''}${user.isSuper ? '，全站可用' : '，对你的班级生效'}`)
}
function downloadWordTemplate() {
  const csv = '﻿单词,中文释义\ncat,猫\ndog,狗\nspeed,速度\n'
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
  a.download = '单词词库导入模板.csv'
  a.click()
}
async function importWordsFile({ file }) {
  try {
    const f = file.file
    let lines = []
    if (f.name.endsWith('.xlsx')) {
      const rows = await parseXlsxRows(f)
      lines = rows.map(r => `${r[0]},${r[1] || ''}`)
    } else {
      let text = await f.text()
      lines = text.replace(/^﻿/, '').split('\n')
    }
    lines = lines.map(l => l.trim()).filter(l => l && !/单词|word/i.test(l.split(/[,，\t]/)[0]))
    wordPairs.value = lines.join('\n')
    message.info(`已读取 ${lines.length} 行，请核对后点击保存`)
  } catch (e) { message.error('文件解析失败：' + e.message) }
  return false
}
function resetWordPairs() {
  wordPairs.value = Object.entries(EN_MEANINGS).map(([w, m]) => `${w},${m}`).join('\n')
  gameWordsZh.value = GAME_WORDS.zh.join('\n')
}
async function deleteText(t) {
  await supabase.from('texts').delete().eq('id', t.id)
  loadAll()
}

// ---- 任务管理 ----
const showTask = ref(false)
const taskForm = ref(null)
function newTask() {
  taskForm.value = {
    title: '', note: '', text_id: null,
    range: [Date.now(), Date.now() + 7 * 86400000],
    duration_min: 5, allow_retry: true, score_rule: 'best', status: 'open',
    class_ids: [], excluded: [],
  }
  showTask.value = true
}
const taskFormStudents = computed(() => taskForm.value
  ? students.value.filter(s => taskForm.value.class_ids.includes(s.class_id)) : [])

async function saveTask() {
  const f = taskForm.value
  if (!f.title || !f.text_id || !f.class_ids.length) return message.warning('请填写标题、选择文稿和班级')
  const { data: task, error } = await supabase.from('tasks').insert({
    title: f.title, note: f.note, text_id: f.text_id, teacher_id: user.user.id,
    start_at: new Date(f.range[0]).toISOString(), deadline: new Date(f.range[1]).toISOString(),
    duration_sec: f.duration_min * 60, allow_retry: f.allow_retry, score_rule: f.score_rule, status: f.status,
  }).select().single()
  if (error) return message.error(error.message)
  const targets = taskFormStudents.value.filter(s => !f.excluded.includes(s.id))
  if (targets.length) {
    await supabase.from('task_students').insert(targets.map(s => ({ task_id: task.id, student_id: s.id })))
  }
  message.success(`任务已发布，共指派 ${targets.length} 名学生`)
  showTask.value = false
  loadAll()
}
async function setTaskStatus(t, status) {
  await supabase.from('tasks').update({ status }).eq('id', t.id)
  loadAll()
}
async function deleteTask(t) {
  await supabase.from('tasks').delete().eq('id', t.id)
  loadAll()
}

// ---- 成绩查询与导出 ----
const viewTask = ref(null)
const taskDetailRecs = computed(() => {
  if (!viewTask.value) return []
  const rule = viewTask.value.score_rule
  const byStu = {}
  for (const r of records.value.filter(r => r.task_id === viewTask.value.id)) {
    const cur = byStu[r.student_id]
    if (!cur) byStu[r.student_id] = r
    else if (rule === 'best' ? Number(r.cpm) > Number(cur.cpm) : new Date(r.submitted_at) > new Date(cur.submitted_at)) byStu[r.student_id] = r
  }
  return Object.values(byStu).map(r => ({ ...r, stu: stuMap.value[r.student_id] }))
    .sort((a, b) => Number(b.cpm) - Number(a.cpm))
})
function exportCsv() {
  const rows = [['学号', '姓名', '班级', 'CPM', 'WPM', '准确率%', '用时s', '错误数', '提交时间']]
  for (const r of taskDetailRecs.value) {
    rows.push([r.stu?.student_no, r.stu?.name, classMap.value[r.stu?.class_id] || '', Math.round(r.cpm), Math.round(r.wpm), r.accuracy, r.duration_sec, r.errors, new Date(r.submitted_at).toLocaleString('zh-CN')])
  }
  const csv = '﻿' + rows.map(r => r.join(',')).join('\n')
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
  a.download = `${viewTask.value.title}-成绩.csv`
  a.click()
}

// ---- 成就配置 ----
async function saveAch(a) {
  await supabase.from('achievements').update({ title: a.title, description: a.description, threshold: a.threshold, icon: a.icon }).eq('id', a.id)
  message.success('已保存')
}

// ---- 教师账号（超管） ----
const teacherForm = ref({ account: '', name: '', password: '' })
async function createTeacher() {
  const f = teacherForm.value
  if (!f.account || !f.name || !f.password) return message.warning('请填写完整')
  const { data, error } = await supabase.rpc('fn_create_teacher', { p_actor: user.user.id, p_account: f.account, p_name: f.name, p_password: f.password })
  if (error || !data.ok) return message.error(error?.message || data.msg)
  message.success('教师账号已创建')
  teacherForm.value = { account: '', name: '', password: '' }
  loadAll()  // 列表即时刷新
}

const LANGS = [{ label: '中文', value: 'zh' }, { label: '英文', value: 'en' }, { label: '数字符号', value: 'num' }, { label: '混合', value: 'mix' }]
const STATUS_TAG = { draft: ['草稿', 'default'], open: ['进行中', 'success'], closed: ['已截止', 'warning'], archived: ['已归档', 'default'] }
</script>

<template>
  <div>
    <h2 style="margin-top:0">🛠️ 教学管理</h2>
    <n-spin :show="loading">
      <n-tabs type="line" size="large">
        <!-- 班级总览 -->
        <n-tab-pane name="overview" tab="📊 班级总览">
          <n-empty v-if="!classes.length" description="还没有班级，先到「学生管理」导入学生" />
          <n-grid v-else :cols="3" :x-gap="14" :y-gap="14" item-responsive responsive="screen">
            <n-gi v-for="c in classStats" :key="c.id" span="3 m:1">
              <n-card :title="c.name" size="small">
                <n-space>
                  <n-statistic label="人数" :value="c.count" />
                  <n-statistic label="平均CPM" :value="c.avgCpm" />
                  <n-statistic label="平均准确率" :value="c.avgAcc" />
                  <n-statistic label="今日打卡" :value="`${c.checkedToday}/${c.count}`" />
                </n-space>
              </n-card>
            </n-gi>
          </n-grid>
        </n-tab-pane>

        <!-- 学生管理 -->
        <n-tab-pane name="students" tab="👥 学生管理">
          <n-card size="small" title="批量导入学生" style="margin-bottom: 14px">
            <p style="opacity:.65;font-size:13px;margin-top:0">每行一名学生：<code>学号,姓名,班级</code>（支持逗号/Tab 分隔，班级不存在会自动创建；默认密码 123）</p>
            <n-space style="margin-bottom: 10px">
              <n-button size="small" @click="downloadTemplate">📥 下载导入模板</n-button>
              <n-upload :show-file-list="false" accept=".csv,.txt" :custom-request="importFromFile">
                <n-button size="small">📂 从 CSV / TXT 文件导入</n-button>
              </n-upload>
            </n-space>
            <n-input v-model:value="importText" type="textarea" :rows="5" placeholder="20240101,张三,电商2401&#10;20240102,李四,电商2401" />
            <n-button type="primary" style="margin-top: 10px" :loading="importing" @click="doImport">导入</n-button>
          </n-card>
          <n-card size="small" title="学生列表">
            <n-select v-model:value="stuClassFilter" clearable placeholder="按班级筛选" style="width: 200px; margin-bottom: 10px"
              :options="classes.map(c => ({ label: c.name, value: c.id }))" />
            <n-table size="small" :single-line="false">
              <thead><tr><th>学号</th><th>姓名</th><th>班级</th><th>操作</th></tr></thead>
              <tbody>
                <tr v-for="s in filteredStudents" :key="s.id">
                  <td>{{ s.student_no }}</td><td>{{ s.name }}</td><td>{{ classMap[s.class_id] || '—' }}</td>
                  <td>
                    <n-space size="small">
                      <n-button size="tiny" @click="resetPwd(s)">重置密码</n-button>
                      <n-popconfirm @positive-click="removeStudent(s)"><template #trigger><n-button size="tiny" type="error" quaternary>删除</n-button></template>确定删除 {{ s.name }}？所有成绩也会删除。</n-popconfirm>
                    </n-space>
                  </td>
                </tr>
              </tbody>
            </n-table>
          </n-card>
        </n-tab-pane>

        <!-- 文稿管理 -->
        <n-tab-pane name="texts" tab="📄 文稿管理">
          <n-space style="margin-bottom: 12px" align="center">
            <n-button type="primary" @click="newText">＋ 添加文稿</n-button>
            <span style="opacity:.55;font-size:13px">{{ user.isSuper ? '可通过"全站使用"开关控制教师文稿的可见范围' : '你添加的文稿仅对你的班级可见' }}</span>
          </n-space>
          <n-space style="margin-bottom: 12px" align="center">
            <n-select v-model:value="tFilter.cats" multiple clearable placeholder="分类（可多选）"
              :options="catFilterOptions" style="min-width: 200px" size="small" />
            <n-select v-model:value="tFilter.lang" clearable placeholder="语言" :options="LANGS" style="width: 120px" size="small" />
            <n-select v-model:value="tFilter.diff" clearable placeholder="难度" :options="DIFF_OPTS" style="width: 110px" size="small" />
            <n-select v-model:value="tFilter.source" clearable placeholder="来源" :options="SOURCE_OPTS" style="width: 110px" size="small" />
            <span style="opacity:.55;font-size:13px">共 {{ tableTexts.length }} 篇</span>
          </n-space>
          <n-table size="small" :single-line="false">
            <thead><tr><th>标题</th><th>分类</th><th>语言</th><th>难度</th><th>来源</th><th>字数</th><th v-if="user.isSuper">全站使用</th><th>操作</th></tr></thead>
            <tbody>
              <tr v-for="t in tableTexts" :key="t.id">
                <td>{{ t.title }}</td>
                <td><n-tag v-if="t.category" size="tiny" round>{{ t.category }}</n-tag><span v-else style="opacity:.4">—</span></td>
                <td>{{ LANGS.find(l => l.value === t.lang)?.label }}</td>
                <td>{{ ['', '初级', '中级', '高级'][t.difficulty] }}</td>
                <td>{{ t.source !== 'builtin' ? '学生' : (teacherMap[t.owner_id]?.role === 'teacher' ? `教师·${teacherMap[t.owner_id].name}` : '内置') }}</td>
                <td>{{ t.content.length }}</td>
                <td v-if="user.isSuper"><n-switch size="small" :value="t.is_global !== false" @update:value="v => toggleGlobal(t, v)" /></td>
                <td>
                  <n-space size="small">
                    <n-button size="tiny" @click="editText(t)">编辑</n-button>
                    <n-popconfirm @positive-click="deleteText(t)"><template #trigger><n-button size="tiny" type="error" quaternary>删除</n-button></template>确定删除？</n-popconfirm>
                  </n-space>
                </td>
              </tr>
            </tbody>
          </n-table>
        </n-tab-pane>

        <!-- 任务管理 -->
        <n-tab-pane name="tasks" tab="📋 任务管理">
          <n-button type="primary" @click="newTask" style="margin-bottom: 12px">＋ 发布任务</n-button>
          <n-empty v-if="!tasks.length" description="还没有任务" />
          <n-card v-for="t in tasks" :key="t.id" size="small" style="margin-bottom: 10px">
            <n-space justify="space-between" align="center">
              <div>
                <b>{{ t.title }}</b>
                <n-tag size="tiny" round :type="STATUS_TAG[t.status][1]" style="margin-left: 8px">{{ STATUS_TAG[t.status][0] }}</n-tag>
                <div style="font-size:12px;opacity:.6;margin-top:4px">
                  {{ new Date(t.start_at).toLocaleString('zh-CN') }} ~ {{ new Date(t.deadline).toLocaleString('zh-CN') }}
                  ｜ {{ Math.round(t.duration_sec / 60) }} 分钟 ｜ {{ t.score_rule === 'best' ? '取最高分' : '取最后一次' }}
                  ｜ 提交 {{ records.filter(r => r.task_id === t.id).length }} 次
                </div>
              </div>
              <n-space size="small">
                <n-button v-if="t.status === 'open'" size="tiny" type="info" @click="$router.push(`/admin/live/${t.id}`)">📺 实时大屏</n-button>
                <n-button size="tiny" @click="viewTask = t">查看成绩</n-button>
                <n-button v-if="t.status === 'open'" size="tiny" @click="setTaskStatus(t, 'closed')">截止</n-button>
                <n-button v-else-if="t.status === 'closed'" size="tiny" @click="setTaskStatus(t, 'archived')">归档</n-button>
                <n-button v-if="t.status === 'draft'" size="tiny" type="primary" @click="setTaskStatus(t, 'open')">发布</n-button>
                <n-popconfirm @positive-click="deleteTask(t)"><template #trigger><n-button size="tiny" type="error" quaternary>删除</n-button></template>确定删除任务及其全部成绩？</n-popconfirm>
              </n-space>
            </n-space>
          </n-card>

          <!-- 成绩详情 -->
          <n-modal :show="!!viewTask" preset="card" :title="`成绩 — ${viewTask?.title || ''}`" style="max-width: 760px" @update:show="v => !v && (viewTask = null)">
            <n-space justify="end" style="margin-bottom: 10px">
              <n-button size="small" @click="exportCsv" :disabled="!taskDetailRecs.length">📥 导出 CSV</n-button>
            </n-space>
            <n-empty v-if="!taskDetailRecs.length" description="还没有学生提交" />
            <n-table v-else size="small" :single-line="false">
              <thead><tr><th>#</th><th>学号</th><th>姓名</th><th>班级</th><th>CPM</th><th>准确率</th><th>用时</th><th>错误</th><th>提交时间</th></tr></thead>
              <tbody>
                <tr v-for="(r, i) in taskDetailRecs" :key="r.id">
                  <td>{{ i + 1 }}</td><td>{{ r.stu?.student_no }}</td><td>{{ r.stu?.name }}</td>
                  <td>{{ classMap[r.stu?.class_id] }}</td>
                  <td><b>{{ Math.round(r.cpm) }}</b></td><td>{{ r.accuracy }}%</td>
                  <td>{{ r.duration_sec }}s</td><td>{{ r.errors }}</td>
                  <td style="font-size:12px">{{ new Date(r.submitted_at).toLocaleString('zh-CN') }}</td>
                </tr>
              </tbody>
            </n-table>
          </n-modal>

          <!-- 新建任务 -->
          <n-modal v-model:show="showTask" preset="card" title="发布新任务" style="max-width: 620px">
            <n-space vertical v-if="taskForm">
              <n-input v-model:value="taskForm.title" placeholder="任务标题，如：第3周打字测验" />
              <n-input v-model:value="taskForm.note" placeholder="任务说明/备注（可选）" />
              <n-space :wrap="false">
                <n-select v-model:value="taskTextCat" clearable placeholder="按分类筛选" :options="catFilterOptions" style="width: 150px" />
                <n-select v-model:value="taskForm.text_id" filterable clearable placeholder="选择练习文稿（可输入标题搜索）"
                  :options="taskTextOptions" style="min-width: 320px" />
              </n-space>
              <n-space align="center">
                <span>起止时间</span>
                <n-date-picker v-model:value="taskForm.range" type="datetimerange" />
              </n-space>
              <n-space align="center">
                <span>练习时长</span>
                <n-input-number v-model:value="taskForm.duration_min" :min="1" :max="60" style="width: 110px"><template #suffix>分钟</template></n-input-number>
                <span style="margin-left:12px">允许重复提交</span>
                <n-switch v-model:value="taskForm.allow_retry" />
                <n-radio-group v-model:value="taskForm.score_rule" size="small" :disabled="!taskForm.allow_retry">
                  <n-radio-button value="best">取最高分</n-radio-button>
                  <n-radio-button value="last">取最后一次</n-radio-button>
                </n-radio-group>
              </n-space>
              <div>
                <b>指定班级（可多选）：</b>
                <n-checkbox-group v-model:value="taskForm.class_ids" style="margin-top: 6px">
                  <n-checkbox v-for="c in classes" :key="c.id" :value="c.id" :label="c.name" />
                </n-checkbox-group>
              </div>
              <div v-if="taskFormStudents.length">
                <b>学生名单（{{ taskFormStudents.length - taskForm.excluded.length }} 人，点击可排除个别学生）：</b>
                <n-space style="margin-top: 6px" :size="4">
                  <n-tag v-for="s in taskFormStudents" :key="s.id" round size="small" style="cursor:pointer"
                    :type="taskForm.excluded.includes(s.id) ? 'default' : 'success'"
                    @click="taskForm.excluded.includes(s.id) ? taskForm.excluded = taskForm.excluded.filter(x => x !== s.id) : taskForm.excluded.push(s.id)">
                    {{ taskForm.excluded.includes(s.id) ? '✕ ' : '' }}{{ s.name }}
                  </n-tag>
                </n-space>
              </div>
              <n-radio-group v-model:value="taskForm.status" size="small">
                <n-radio-button value="open">立即发布</n-radio-button>
                <n-radio-button value="draft">存为草稿</n-radio-button>
              </n-radio-group>
              <n-button type="primary" block @click="saveTask">确认发布</n-button>
            </n-space>
          </n-modal>
        </n-tab-pane>

        <!-- 词库管理 -->
        <n-tab-pane name="gamewords" tab="📚 词库管理">
          <n-card size="small">
            <n-tabs type="segment" animated>
              <n-tab-pane name="en" tab="🔤 英文单词词库">
                <p style="opacity:.65;font-size:13px;margin-top:4px">
                  供「单词练习」和所有游戏的英文模式使用，打对单词即显示中文释义。每行一个：<code>单词,中文释义</code>。
                  {{ user.isSuper ? '你保存的单词全站可用。' : '你保存的单词仅对你的班级生效（与全站词库合并）。' }}
                </p>
                <n-space style="margin-bottom: 10px" :size="8">
                  <n-button size="small" @click="downloadWordTemplate">📥 下载 Excel 模板</n-button>
                  <n-upload :show-file-list="false" accept=".xlsx,.csv,.txt" :custom-request="importWordsFile">
                    <n-button size="small">📂 从 Excel / CSV 导入</n-button>
                  </n-upload>
                  <n-button size="small" @click="resetWordPairs">恢复默认</n-button>
                </n-space>
                <n-input v-model:value="wordPairs" type="textarea" :rows="14" placeholder="每行一个：单词,中文释义&#10;cat,猫&#10;speed,速度" />
                <n-button type="primary" style="margin-top: 10px" @click="saveWordPairs">保存单词词库</n-button>
              </n-tab-pane>
              <n-tab-pane name="zh" tab="🀄 中文词语词库">
                <p style="opacity:.65;font-size:13px;margin-top:4px">供游戏的中文模式使用（太空射击 / 消消乐 / 打地鼠等），每行一个词语。保存后对全体学生生效。</p>
                <n-input v-model:value="gameWordsZh" type="textarea" :rows="14" placeholder="每行一个词语" />
                <n-button type="primary" style="margin-top: 10px" @click="saveZhWords">保存中文词库</n-button>
              </n-tab-pane>
            </n-tabs>
          </n-card>
        </n-tab-pane>

        <!-- 成就配置 -->
        <n-tab-pane name="ach" tab="🏅 成就配置">
          <p style="opacity:.65;font-size:13px">可自定义成就名称、说明、图标与阈值（如 CPM 门槛、连续打卡天数）</p>
          <n-table size="small" :single-line="false">
            <thead><tr><th style="width:60px">图标</th><th style="width:140px">名称</th><th>说明</th><th style="width:100px">阈值</th><th style="width:80px"></th></tr></thead>
            <tbody>
              <tr v-for="a in achievements" :key="a.id">
                <td><n-input v-model:value="a.icon" size="small" /></td>
                <td><n-input v-model:value="a.title" size="small" /></td>
                <td><n-input v-model:value="a.description" size="small" /></td>
                <td><n-input-number v-model:value="a.threshold" size="small" :show-button="false" /></td>
                <td><n-button size="tiny" type="primary" @click="saveAch(a)">保存</n-button></td>
              </tr>
            </tbody>
          </n-table>
        </n-tab-pane>

        <!-- 教师账号（超管专属） -->
        <n-tab-pane v-if="user.isSuper" name="teachers" tab="👩‍🏫 教师账号">
          <n-grid :cols="3" :x-gap="14" :y-gap="14" item-responsive responsive="screen">
            <n-gi span="3 m:1">
              <n-card size="small" title="创建教师账号">
                <n-space vertical>
                  <n-input v-model:value="teacherForm.account" placeholder="登录账号" />
                  <n-input v-model:value="teacherForm.name" placeholder="教师姓名" />
                  <n-input v-model:value="teacherForm.password" type="password" show-password-on="click" placeholder="登录密码" />
                  <n-button type="primary" @click="createTeacher">创建</n-button>
                </n-space>
              </n-card>
            </n-gi>
            <n-gi span="3 m:2">
              <n-card size="small" title="教师账号列表">
                <n-table size="small" :single-line="false">
                  <thead><tr><th>账号</th><th>姓名（可改）</th><th>角色</th><th>管理班级</th><th>操作</th></tr></thead>
                  <tbody>
                    <tr v-for="t in teachers" :key="t.id">
                      <td>{{ t.student_no }}</td>
                      <td><n-input v-if="t.role === 'teacher'" v-model:value="t.name" size="small" @blur="renameTeacher(t)" /><span v-else>{{ t.name }}</span></td>
                      <td><n-tag size="tiny" round :type="t.role === 'super' ? 'warning' : 'info'">{{ t.role === 'super' ? '超级管理员' : '教师' }}</n-tag></td>
                      <td>{{ classes.filter(c => c.teacher_id === t.id).map(c => c.name).join('、') || '—' }}</td>
                      <td>
                        <n-space v-if="t.role === 'teacher'" size="small">
                          <n-button size="tiny" @click="resetTeacherPwd(t)">重置密码</n-button>
                          <n-popconfirm @positive-click="removeTeacher(t)"><template #trigger><n-button size="tiny" type="error" quaternary>删除</n-button></template>确定删除 {{ t.name }}？其名下班级不受影响。</n-popconfirm>
                        </n-space>
                        <span v-else style="opacity:.4">—</span>
                      </td>
                    </tr>
                  </tbody>
                </n-table>
              </n-card>
            </n-gi>
          </n-grid>
        </n-tab-pane>
      </n-tabs>
    </n-spin>

    <!-- 添加文稿弹窗 -->
    <n-modal v-model:show="showText" preset="card" :title="textForm.id ? '编辑文稿' : '添加内置文稿'" style="max-width: 560px">
      <n-space vertical>
        <div class="tf-field"><span class="tf-label">标题</span><n-input v-model:value="textForm.title" placeholder="文稿标题" /></div>
        <n-space>
          <div class="tf-field"><span class="tf-label">语言</span>
            <n-select v-model:value="textForm.lang" :options="LANGS" style="width: 120px" /></div>
          <div class="tf-field"><span class="tf-label">难度</span>
            <n-select v-model:value="textForm.difficulty" style="width: 100px"
              :options="[{ label: '初级', value: 1 }, { label: '中级', value: 2 }, { label: '高级', value: 3 }]" /></div>
          <div class="tf-field"><span class="tf-label">分类</span>
            <n-select v-model:value="textForm.category" filterable tag clearable placeholder="选择或输入新分类"
              :options="categoryOptions" style="width: 200px" /></div>
        </n-space>
        <p style="margin:0;font-size:12px;opacity:.55">分类用于学生练习页快速筛选，如「课文」「专业术语」；下拉中直接输入文字并回车即可创建新分类</p>
        <n-input v-model:value="textForm.content" type="textarea" :rows="8" placeholder="文稿内容" />
        <n-button type="primary" @click="saveText">保存</n-button>
      </n-space>
    </n-modal>
  </div>
</template>

<style scoped>
.tf-field { display: flex; align-items: center; gap: 8px; }
.tf-field > .n-input { flex: 1; }
.tf-label { font-size: 13px; white-space: nowrap; opacity: .75; }
</style>
