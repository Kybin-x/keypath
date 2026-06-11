<script setup>
// 🐍 文字冒险：打字推进故事，速度影响分支结局
import { ref, computed } from 'vue'
import { NButton, NSpace, NCard, useMessage } from 'naive-ui'
import { playFx } from '../../lib/sound'
import { saveLog } from '../../lib/records'
import GameShell from './GameShell.vue'
import TypingEngine from '../../components/TypingEngine.vue'

const message = useMessage()
const state = ref('ready')
const score = ref(0)
const chapter = ref(null)
const story = ref([])     // 已展示的剧情
const results = ref([])
const engineKey = ref(0)

// 故事树：每章打一段文字，按 CPM 分支
const STORY = {
  start: {
    text: '夜幕降临，你独自走进了传说中的键盘神殿。石门上刻着一行字，只有打出它才能开门。',
    typing: '芝麻开门 键盘神殿欢迎勇敢的打字者',
    branch: r => r.cpm >= 60 ? 'hall_fast' : 'hall_slow',
  },
  hall_fast: {
    text: '⚡ 石门轰然洞开！守门人惊叹于你的手速："年轻人，你有成为键盘大师的潜质！"他递给你一把金钥匙。',
    typing: 'The golden key shines in the dark hall like a small sun',
    branch: r => r.accuracy >= 95 ? 'treasure' : 'trap',
  },
  hall_slow: {
    text: '石门缓缓打开了一条缝，你侧身挤了进去。大厅里有两条路：左边火光摇曳，右边寒气逼人。你需要快速决定。',
    typing: '熟能生巧 坚持练习就一定会进步',
    branch: r => r.cpm >= 50 ? 'treasure' : 'trap',
  },
  trap: {
    text: '💀 糟糕！是陷阱房！地板开始塌陷，你必须立刻打出咒语逃生！',
    typing: 'escape now run fast do not look back',
    branch: r => r.accuracy >= 90 ? 'ending_ok' : 'ending_bad',
  },
  treasure: {
    text: '✨ 你找到了宝藏室！中央的水晶键盘悬浮在空中。完成最后的试炼，它就属于你。',
    typing: '十指如飞 心键合一 这就是打字的最高境界',
    branch: r => (r.cpm >= 80 && r.accuracy >= 95) ? 'ending_best' : 'ending_good',
  },
  ending_best: { text: '🏆 完美结局：水晶键盘认可了你！你成为新一代键盘大师，神殿的传说将由你续写！', end: true, bonus: 500 },
  ending_good: { text: '🌟 圆满结局：你带着宝藏平安离开神殿，打字技艺大有长进！', end: true, bonus: 300 },
  ending_ok: { text: '😅 惊险结局：你死里逃生，虽然两手空空，但这次冒险让你明白了练习的重要性。', end: true, bonus: 100 },
  ending_bad: { text: '💫 重生结局：你掉入了地下河，被冲出了神殿…再练练再来吧！', end: true, bonus: 50 },
}

function start() {
  state.value = 'playing'
  score.value = 0; story.value = []; results.value = []
  goto('start')
}

function goto(key) {
  const node = STORY[key]
  chapter.value = { key, ...node }
  story.value.push(node.text)
  if (node.end) {
    score.value += node.bonus
    finish()
  } else {
    engineKey.value++
  }
}

async function onSegmentDone(r) {
  results.value.push(r)
  score.value += Math.round(r.cpm * (r.accuracy / 100))
  playFx('win')
  goto(chapter.value.branch(r))
}

async function finish() {
  state.value = 'over'
  const avg = arr => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0
  const acc = Math.round(avg(results.value.map(r => r.accuracy)) * 10) / 10
  const cpm = Math.round(avg(results.value.map(r => r.cpm)))
  const dur = results.value.reduce((a, r) => a + r.activeSec, 0)
  const { unlocked } = await saveLog({ kind: 'game', game: 'quest', result: { score: score.value, cpm, accuracy: acc, durationSec: dur, activeSec: dur } })
  unlocked.forEach(a => message.info(`${a.icon} 解锁成就：${a.title}`))
}

const ending = computed(() => story.value[story.value.length - 1])
</script>

<template>
  <GameShell title="🐍 文字冒险 TypeQuest" :score="score" :state="state" @restart="start">
    <template #setup>
      <n-space vertical align="center">
        <p style="opacity:.6">通过打字推进故事，你的速度和准确率决定故事走向与结局！</p>
        <n-button type="primary" size="large" @click="start">开始冒险</n-button>
      </n-space>
    </template>
    <template #over><p style="max-width: 380px">{{ ending }}</p></template>

    <div class="quest">
      <n-card v-for="(s, i) in story" :key="i" size="small" class="story-card">{{ s }}</n-card>
      <div v-if="chapter && !chapter.end" class="typing-zone">
        <p class="prompt">⌨️ 打出下面的文字继续冒险：</p>
        <TypingEngine :key="engineKey" :text="chapter.typing" :duration-sec="0" :loop="false" :show-keyboard="false" @finish="onSegmentDone" />
      </div>
    </div>
  </GameShell>
</template>

<style scoped>
.quest { max-width: 720px; margin: 0 auto; }
.story-card { margin-bottom: 10px; font-size: 15px; line-height: 1.7; animation: fadein .5s; }
@keyframes fadein { from { opacity: 0; transform: translateY(8px); } }
.prompt { font-weight: 600; }
</style>
