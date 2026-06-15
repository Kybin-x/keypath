<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import {
  NCard, NTabs, NTabPane, NButton, NTag, NSelect, NInput, NInputNumber, NModal, NSpace, NUpload,
  NRadioGroup, NRadioButton, useMessage, NEmpty,
} from 'naive-ui'
import { useUserStore } from '../stores/user'
import { supabase, dbAvailable } from '../lib/supabase'
import { KEY_DRILLS, LOCAL_TEXTS } from '../data/texts'
import { getGameWords } from '../lib/gameWords'
import { saveLog } from '../lib/records'
import TypingEngine from '../components/TypingEngine.vue'
import ResultCard from '../components/ResultCard.vue'

const message = useMessage()
const user = useUserStore()

const phase = ref('pick')        // pick | typing | result
const texts = ref([])
const myTexts = ref([])
const langFilter = ref('all')
const duration = ref(60)
const current = ref(null)        // {title, content, id?}
const result = ref(null)
const unlocked = ref([])
const saved = ref(false)
const lastResult = ref(null)
const engine = ref(null)

const DURATIONS = [
  { label: '1 分钟', value: 60 }, { label: '3 分钟', value: 180 },
  { label: '5 分钟', value: 300 }, { label: '10 分钟', value: 600 },
  { label: '不限时', value: 0 }, { label: '自定义', value: -1 },
]
const customMin = ref(2)
const effectiveDuration = computed(() => duration.value === -1 ? Math.max(1, customMin.value || 1) * 60 : duration.value)

onMounted(loadTexts)
async function loadTexts() {
  if (await dbAvailable()) {
    const { data } = await supabase.from('texts').select('*').order('created_at')
    if (data?.length) {
      // 班级范围：全站文稿对所有人可见；教师私有文稿仅对其班级学生（及本人）可见
      let classTeacherId = null
      if (user.user?.class_id) {
        const { data: cls } = await supabase.from('classes').select('teacher_id').eq('id', user.user.class_id).maybeSingle()
        classTeacherId = cls?.teacher_id || null
      }
      texts.value = data.filter(t => t.source === 'builtin' &&
        (t.is_global !== false || t.owner_id === user.user?.id || (classTeacherId && t.owner_id === classTeacherId)))
      myTexts.value = data.filter(t => t.source === 'user' && t.owner_id === user.user?.id)
      return
    }
  }
  texts.value = LOCAL_TEXTS
}

const catFilter = ref('all')
const categories = computed(() => [...new Set(texts.value.map(t => t.category).filter(Boolean))])
const filteredTexts = computed(() => texts.value
  .filter(t => langFilter.value === 'all' || t.lang === langFilter.value)
  .filter(t => catFilter.value === 'all' || t.category === catFilter.value))

const drillCats = computed(() => {
  const cats = {}
  for (const d of KEY_DRILLS) (cats[d.cat] ||= []).push(d)
  return cats
})

function startDrill(d) {
  // 键位练习语言归类：数字/符号类不计入速度成就，字母类按英文轨
  const lang = ['numbers', 'symbols', 'numsym', 'symcombo'].includes(d.key) ? 'num' : 'en'
  current.value = { title: d.title, content: d.gen(), id: null, isDrill: true, drill: d, lang }
  phase.value = 'typing'
}
function startText(t) {
  current.value = { title: t.title, content: t.content, id: t.id, lang: t.lang }
  phase.value = 'typing'
}

// ---- 单词练习（打完单词显示中文释义） ----
const wordLang = ref('en')         // en | zh
const wordCount = ref(20)
const wordCustomCount = ref(20)
const wordStats = ref({ enTotal: 0, zhTotal: 0 })
async function loadWordStats() {
  const wb = await getGameWords()
  wordStats.value = { enTotal: wb.en.length, zhTotal: wb.zh.length }
}
onMounted(loadWordStats)
async function startWords() {
  const wb = await getGameWords()
  const count = wordCount.value === -1 ? wordCustomCount.value : wordCount.value
  if (wordLang.value === 'zh') {
    const list = [...wb.zh].sort(() => Math.random() - 0.5).slice(0, count === 0 ? wb.zh.length : count)
    current.value = {
      title: `中文词语练习（${list.length} 词）`, id: null,
      content: list.join(' '), meanings: null,
      isWords: true, lang: 'zh',
    }
  } else {
    const list = [...wb.en].sort(() => Math.random() - 0.5).slice(0, count === 0 ? wb.en.length : count)
    current.value = {
      title: `英文单词练习（${list.length} 词）`, id: null,
      content: list.join(' '), meanings: wb.enMap,
      isWords: true, lang: 'en',
    }
  }
  phase.value = 'typing'
}

async function onFinish(r) {
  result.value = r
  phase.value = 'result'
  const { saved: ok, unlocked: list } = await saveLog({ kind: 'practice', textId: current.value.id, result: r, lang: current.value.lang || '' })
  saved.value = ok
  unlocked.value = list
  lastResult.value = JSON.parse(localStorage.getItem('kp_last_practice') || 'null')
  localStorage.setItem('kp_last_practice', JSON.stringify({ cpm: r.cpm, accuracy: r.accuracy }))
}

function retry() {
  if (current.value.isDrill) current.value = { ...current.value, content: current.value.drill.gen() }
  if (current.value.isWords) return startWords()
  result.value = null
  phase.value = 'typing'
}

// ---- 自定义文稿 ----
const showCustom = ref(false)
const customTitle = ref('')
const customContent = ref('')
const customLang = ref('zh')

async function readFile({ file }) {
  const f = file.file
  if (f.name.endsWith('.txt')) {
    customContent.value = await f.text()
    if (!customTitle.value) customTitle.value = f.name.replace(/\.txt$/, '')
  } else if (f.name.endsWith('.docx')) {
    try {
      const JSZipLike = await loadDocx(f)
      customContent.value = JSZipLike
      if (!customTitle.value) customTitle.value = f.name.replace(/\.docx$/, '')
    } catch { message.error('docx 解析失败，请将内容复制粘贴到文本框') }
  } else {
    message.warning('仅支持 .txt / .docx 文件')
  }
  return false
}

// 轻量 docx 文本提取（docx 是 zip，借助 DecompressionStream 解出 document.xml）
async function loadDocx(file) {
  const buf = new Uint8Array(await file.arrayBuffer())
  const view = new DataView(buf.buffer)
  // 查找 central directory 中的 word/document.xml
  for (let i = buf.length - 22; i >= 0; i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      let off = view.getUint32(i + 16, true)
      const count = view.getUint16(i + 10, true)
      for (let n = 0; n < count; n++) {
        const sig = view.getUint32(off, true)
        if (sig !== 0x02014b50) break
        const nameLen = view.getUint16(off + 28, true)
        const extraLen = view.getUint16(off + 30, true)
        const cmtLen = view.getUint16(off + 32, true)
        const localOff = view.getUint32(off + 42, true)
        const name = new TextDecoder().decode(buf.slice(off + 46, off + 46 + nameLen))
        if (name === 'word/document.xml') {
          const lNameLen = view.getUint16(localOff + 26, true)
          const lExtraLen = view.getUint16(localOff + 28, true)
          const compSize = view.getUint32(off + 20, true)
          const method = view.getUint16(off + 10, true)
          const dataStart = localOff + 30 + lNameLen + lExtraLen
          const raw = buf.slice(dataStart, dataStart + compSize)
          let xmlBytes = raw
          if (method === 8) {
            const ds = new DecompressionStream('deflate-raw')
            const stream = new Blob([raw]).stream().pipeThrough(ds)
            xmlBytes = new Uint8Array(await new Response(stream).arrayBuffer())
          }
          const xml = new TextDecoder().decode(xmlBytes)
          return xml.replace(/<w:p[ >]/g, '\n$&').replace(/<[^>]+>/g, '').replace(/\n{2,}/g, '\n').trim()
        }
        off += 46 + nameLen + extraLen + cmtLen
      }
    }
  }
  throw new Error('not a docx')
}

async function saveCustom(andStart) {
  if (!customContent.value.trim()) return message.warning('请输入文稿内容')
  const t = { title: customTitle.value.trim() || '自定义文稿', content: customContent.value.trim(), lang: customLang.value }
  if (user.isLogin && (await dbAvailable())) {
    const { data, error } = await supabase.from('texts')
      .insert({ ...t, source: 'user', owner_id: user.user.id, difficulty: 1 }).select().single()
    if (!error && data) { myTexts.value.push(data); message.success('已保存到个人文稿库') }
  } else {
    message.info('访客模式：文稿仅本次可用')
  }
  showCustom.value = false
  if (andStart) startText(t)
}

async function deleteMyText(t) {
  await supabase.from('texts').delete().eq('id', t.id)
  myTexts.value = myTexts.value.filter(x => x.id !== t.id)
}

const LANG_TAG = { zh: ['中文', 'success'], en: ['英文', 'info'], num: ['数字符号', 'warning'], mix: ['混合', 'default'] }
const DIFF = ['', '初级', '中级', '高级']
</script>

<template>
  <div>
    <!-- 选择阶段 -->
    <template v-if="phase === 'pick'">
      <h2 style="margin-top:0">⌨️ 打字练习</h2>
      <n-card size="small" style="margin-bottom:16px">
        <n-space align="center">
          <span style="font-weight:600">练习时长：</span>
          <n-radio-group v-model:value="duration">
            <n-radio-button v-for="d in DURATIONS" :key="d.value" :value="d.value">{{ d.label }}</n-radio-button>
          </n-radio-group>
          <n-input-number v-if="duration === -1" v-model:value="customMin" :min="1" :max="120" style="width: 130px">
            <template #suffix>分钟</template>
          </n-input-number>
          <span style="opacity:.55;font-size:13px">短文稿会在计时内自动循环</span>
        </n-space>
      </n-card>

      <n-card>
      <n-tabs type="line" size="large" :pane-style="{ paddingTop: '14px' }">
        <n-tab-pane name="drill" tab="🎹 键位练习">
          <div v-for="(list, cat) in drillCats" :key="cat" style="margin-bottom: 18px">
            <h3 style="margin: 6px 0 10px">{{ cat }}</h3>
            <n-space>
              <n-card v-for="d in list" :key="d.key" size="small" hoverable class="drill-card" @click="startDrill(d)">
                {{ d.title }}
              </n-card>
            </n-space>
          </div>
        </n-tab-pane>

        <n-tab-pane name="words" tab="🔤 单词练习">
          <div class="word-practice-wrap">
            <!-- 语言选择 -->
            <div class="lang-row">
              <div class="lang-card" :class="{ active: wordLang === 'en' }" @click="wordLang = 'en'">
                <span class="lc-icon">🔤</span>
                <div class="lc-body">
                  <div class="lc-title">英文单词</div>
                  <div class="lc-desc">打对立即显示中文释义</div>
                </div>
                <span class="lc-badge">{{ wordStats.enTotal }} 词</span>
              </div>
              <div class="lang-card" :class="{ active: wordLang === 'zh' }" @click="wordLang = 'zh'">
                <span class="lc-icon">🀄</span>
                <div class="lc-body">
                  <div class="lc-title">中文词语</div>
                  <div class="lc-desc">拼音输入法直接上屏</div>
                </div>
                <span class="lc-badge">{{ wordStats.zhTotal }} 词</span>
              </div>
            </div>

            <!-- 数量 + 开始 -->
            <div class="count-row">
              <span class="count-label">练习数量</span>
              <div class="count-chips">
                <div v-for="opt in [{v:10,l:'10'},{v:20,l:'20'},{v:40,l:'40'},{v:0,l:'全部'}]"
                  :key="opt.v" class="count-chip" :class="{ active: wordCount === opt.v }"
                  @click="wordCount = opt.v">{{ opt.l }}</div>
                <div class="count-chip" :class="{ active: wordCount === -1 }" @click="wordCount = -1">自定义</div>
                <n-input-number v-if="wordCount === -1" v-model:value="wordCustomCount"
                  :min="1" :max="500" style="width:110px" size="small">
                  <template #suffix>词</template>
                </n-input-number>
              </div>
              <n-button type="primary" size="medium" @click="startWords" style="flex-shrink:0">
                开始练习 →
              </n-button>
            </div>
            <p class="word-hint">
              {{ wordLang === 'en' ? '每打对一个单词，立即浮现中文释义，边打字边记忆。' : '词库由老师在后台「词库管理」中配置，支持批量导入。' }}
            </p>
          </div>
        </n-tab-pane>

        <n-tab-pane name="text" tab="📄 文稿练习">
          <n-space style="margin-bottom: 14px" align="center">
            <n-radio-group v-model:value="langFilter" size="small">
              <n-radio-button value="all">全部</n-radio-button>
              <n-radio-button value="zh">中文</n-radio-button>
              <n-radio-button value="en">英文</n-radio-button>
              <n-radio-button value="num">数字符号</n-radio-button>
            </n-radio-group>
            <n-radio-group v-if="categories.length" v-model:value="catFilter" size="small">
              <n-radio-button value="all">全部分类</n-radio-button>
              <n-radio-button v-for="c in categories" :key="c" :value="c">{{ c }}</n-radio-button>
            </n-radio-group>
          </n-space>
          <div class="text-grid">
            <n-card v-for="t in filteredTexts" :key="t.id" size="small" hoverable @click="startText(t)" class="text-card">
              <div class="tc-title">{{ t.title }}</div>
              <div class="tc-preview">{{ t.content.slice(0, 60) }}…</div>
              <n-space size="small">
                <n-tag size="tiny" :type="LANG_TAG[t.lang]?.[1]" round>{{ LANG_TAG[t.lang]?.[0] }}</n-tag>
                <n-tag size="tiny" round>{{ DIFF[t.difficulty] || '初级' }}</n-tag>
                <n-tag v-if="t.category" size="tiny" round type="warning">{{ t.category }}</n-tag>
              </n-space>
            </n-card>
          </div>
        </n-tab-pane>

        <n-tab-pane name="mine" tab="✏️ 自定义文稿">
          <n-button type="primary" @click="showCustom = true" style="margin-bottom: 14px">＋ 新建 / 上传文稿</n-button>
          <div class="text-grid" v-if="myTexts.length">
            <n-card v-for="t in myTexts" :key="t.id" size="small" hoverable class="text-card">
              <div class="tc-title" @click="startText(t)">{{ t.title }}</div>
              <div class="tc-preview" @click="startText(t)">{{ t.content.slice(0, 60) }}…</div>
              <n-space justify="space-between">
                <n-button size="tiny" type="primary" @click="startText(t)">开始练习</n-button>
                <n-button size="tiny" quaternary type="error" @click="deleteMyText(t)">删除</n-button>
              </n-space>
            </n-card>
          </div>
          <n-empty v-else description="还没有自定义文稿，点击上方按钮创建" />
        </n-tab-pane>
      </n-tabs>
      </n-card>
    </template>

    <!-- 打字阶段 -->
    <template v-else-if="phase === 'typing'">
      <n-space justify="space-between" align="center" style="margin-bottom: 12px">
        <h2 style="margin:0">{{ current.title }}</h2>
        <n-space>
          <n-button size="small" @click="engine?.finish()" v-if="effectiveDuration === 0">提前结束</n-button>
          <n-button size="small" @click="phase = 'pick'">退出</n-button>
        </n-space>
      </n-space>
      <TypingEngine ref="engine" :text="current.content" :duration-sec="effectiveDuration" :loop="effectiveDuration > 0"
        :meanings="current.meanings || null" @finish="onFinish" />
    </template>

    <!-- 结果阶段 -->
    <template v-else>
      <div style="max-width: 560px; margin: 30px auto">
        <ResultCard :result="result" :unlocked="unlocked" :saved="saved" :compare="lastResult" @retry="retry" @close="phase = 'pick'" />
      </div>
    </template>

    <!-- 自定义文稿弹窗 -->
    <n-modal v-model:show="showCustom" preset="card" title="新建自定义文稿" style="max-width: 560px">
      <n-space vertical>
        <n-input v-model:value="customTitle" placeholder="文稿标题" />
        <n-radio-group v-model:value="customLang" size="small">
          <n-radio-button value="zh">中文</n-radio-button>
          <n-radio-button value="en">英文</n-radio-button>
          <n-radio-button value="num">数字符号</n-radio-button>
          <n-radio-button value="mix">混合</n-radio-button>
        </n-radio-group>
        <n-upload :show-file-list="false" accept=".txt,.docx" :custom-request="readFile">
          <n-button size="small">📂 上传 .txt / .docx 文件</n-button>
        </n-upload>
        <n-input v-model:value="customContent" type="textarea" :rows="8" placeholder="或直接粘贴文稿内容…" />
        <n-space justify="end">
          <n-button @click="saveCustom(false)">仅保存</n-button>
          <n-button type="primary" @click="saveCustom(true)">保存并开始练习</n-button>
        </n-space>
      </n-space>
    </n-modal>
  </div>
</template>

<style scoped>
.drill-card { cursor: pointer; font-weight: 600; }
.drill-card:hover { color: var(--kp-primary); }
.text-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 14px; }
.text-card { cursor: pointer; }
.tc-title { font-weight: 700; margin-bottom: 6px; }
.tc-preview { font-size: 12px; opacity: .6; margin-bottom: 8px; min-height: 32px; }
.word-practice-wrap { display: flex; flex-direction: column; gap: 14px; }
.lang-row { display: flex; gap: 12px; }
.lang-card { flex: 1; display: flex; align-items: center; gap: 12px; padding: 14px 18px;
  border-radius: 12px; border: 2px solid rgba(127,127,127,.15);
  background: rgba(127,127,127,.04); cursor: pointer; transition: all .18s; }
.lang-card:hover { border-color: var(--kp-primary); background: rgba(79,70,229,.04); }
.lang-card.active { border-color: var(--kp-primary); background: rgba(79,70,229,.07);
  box-shadow: 0 2px 14px rgba(79,70,229,.13); }
.lc-icon { font-size: 28px; flex-shrink: 0; }
.lc-body { flex: 1; }
.lc-title { font-weight: 700; font-size: 14px; }
.lc-desc { font-size: 12px; opacity: .5; margin-top: 2px; }
.lc-badge { flex-shrink: 0; padding: 3px 10px; border-radius: 20px; font-size: 12px;
  font-weight: 600; background: rgba(127,127,127,.12); color: inherit;
  transition: background .18s, color .18s; }
.lang-card.active .lc-badge { background: var(--kp-primary); color: #fff; }

.count-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
  padding: 12px 16px; border-radius: 10px; background: rgba(127,127,127,.05); }
.count-label { font-size: 13px; font-weight: 600; opacity: .65; flex-shrink: 0; }
.count-chips { display: flex; gap: 6px; flex-wrap: wrap; flex: 1; }
.count-chip { padding: 5px 14px; border-radius: 20px; border: 1.5px solid rgba(127,127,127,.2);
  font-size: 13px; font-weight: 600; cursor: pointer; transition: all .15s;
  background: #fff; user-select: none; }
.dark .count-chip { background: rgba(255,255,255,.06); }
.count-chip:hover { border-color: var(--kp-primary); color: var(--kp-primary); }
.count-chip.active { border-color: var(--kp-primary); background: var(--kp-primary);
  color: #fff; box-shadow: 0 2px 6px rgba(79,70,229,.25); }
.word-hint { font-size: 12px; opacity: .45; margin: 0; }
</style>
