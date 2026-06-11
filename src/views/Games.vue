<script setup>
import { useRouter } from 'vue-router'
import { NCard, NGrid, NGi, NTag } from 'naive-ui'

const router = useRouter()
const games = [
  { icon: '🚀', name: '太空射击', en: 'SpaceType', desc: '击落带字母/单词的敌机，难度递增，支持中英文', path: '/games/space', tag: '射击' },
  { icon: '🌊', name: '文字消消乐', en: 'WordCrush', desc: '文字块下落，打对消除，连击有奖励', path: '/games/crush', tag: '消除' },
  { icon: '🏃', name: '赛跑竞速', en: 'TypeRace', desc: '打字速度决定奔跑，支持多人实时对战', path: '/games/race', tag: '多人对战' },
  { icon: '💣', name: '拆弹游戏', en: 'BombType', desc: '限时打出正确字符拆除炸弹，打错引线变短', path: '/games/bomb', tag: '限时' },
  { icon: '🐍', name: '文字冒险', en: 'TypeQuest', desc: '通过打字推进故事，速度影响结局', path: '/games/quest', tag: '剧情' },
  { icon: '🎯', name: '打地鼠', en: 'MoleType', desc: '打出地鼠头上的字母击打地鼠，适合入门', path: '/games/mole', tag: '入门' },
]
</script>

<template>
  <div>
    <h2 style="margin-top:0">🎮 打字游戏</h2>
    <p style="opacity:.65;margin-top:-8px">边玩边练，游戏成绩计入游戏排行榜</p>
    <n-grid :cols="3" :x-gap="16" :y-gap="16" item-responsive responsive="screen">
      <n-gi v-for="g in games" :key="g.path" span="3 m:1">
        <n-card hoverable class="game-card" @click="router.push(g.path)">
          <div class="g-icon">{{ g.icon }}</div>
          <div class="g-name">{{ g.name }} <small>{{ g.en }}</small></div>
          <div class="g-desc">{{ g.desc }}</div>
          <n-tag size="small" round type="info">{{ g.tag }}</n-tag>
        </n-card>
      </n-gi>
    </n-grid>
  </div>
</template>

<style scoped>
.game-card { cursor: pointer; text-align: center; transition: transform .15s; }
.game-card:hover { transform: translateY(-4px); }
.g-icon { font-size: 44px; }
.g-name { font-size: 18px; font-weight: 700; margin: 8px 0 4px; }
.g-name small { font-size: 12px; opacity: .5; font-weight: 400; }
.g-desc { font-size: 13px; opacity: .65; min-height: 38px; margin-bottom: 8px; }
</style>
