// 内置语料：键位练习生成器 + 文稿库（数据库不可用时的本地兜底）

const HOME_ROW = 'asdfjkl;'
const ALL_LETTERS = 'abcdefghijklmnopqrstuvwxyz'
const NUMBERS = '0123456789'
const SYMBOLS = `!@#$%^&*()_+-=[]{};:'",.<>/?`
const LEFT_HAND = 'qwertasdfgzxcvb'
const RIGHT_HAND = 'yuiophjkl;nm,./'
const WEAK_FINGERS = 'qazplo;.wsxik,' // 小指/无名指

function gen(pool, groups = 30, groupLen = 4) {
  const out = []
  for (let i = 0; i < groups; i++) {
    let g = ''
    for (let j = 0; j < groupLen; j++) g += pool[Math.floor(Math.random() * pool.length)]
    out.push(g)
  }
  return out.join(' ')
}

function genCase(groups = 30) {
  const out = []
  for (let i = 0; i < groups; i++) {
    let g = ''
    for (let j = 0; j < 4; j++) {
      const c = ALL_LETTERS[Math.floor(Math.random() * 26)]
      g += Math.random() < 0.5 ? c.toUpperCase() : c
    }
    out.push(g)
  }
  return out.join(' ')
}

export const KEY_DRILLS = [
  { key: 'home', cat: '基础键位', title: '基准键位 ASDF JKL;', gen: () => gen(HOME_ROW) },
  { key: 'letters', cat: '基础键位', title: '全键盘字母', gen: () => gen(ALL_LETTERS) },
  { key: 'numbers', cat: '基础键位', title: '数字键行', gen: () => gen(NUMBERS) },
  { key: 'symbols', cat: '基础键位', title: '符号键', gen: () => gen(SYMBOLS, 24, 3) },
  { key: 'case', cat: '进阶练习', title: '大小写切换', gen: () => genCase() },
  { key: 'symcombo', cat: '进阶练习', title: '常用符号组合', gen: () => Array.from({ length: 18 }, () => ['()', '[]', '{}', '<>', '->', '=>', '!=', '==', '&&', '||', '+=', '::'][Math.floor(Math.random() * 12)] + gen(ALL_LETTERS, 1, 3)).join(' ') },
  { key: 'numsym', cat: '进阶练习', title: '数字符号混合', gen: () => gen(NUMBERS + SYMBOLS, 26, 4) },
  { key: 'left', cat: '专项练习', title: '左手专项', gen: () => gen(LEFT_HAND) },
  { key: 'right', cat: '专项练习', title: '右手专项', gen: () => gen(RIGHT_HAND) },
  { key: 'weak', cat: '专项练习', title: '弱指专项（小指/无名指）', gen: () => gen(WEAK_FINGERS) },
]

// 本地兜底文稿（与 schema.sql 种子一致的精简版）
export const LOCAL_TEXTS = [
  { id: 'l1', title: '常用单词初级', lang: 'en', difficulty: 1, source: 'builtin', content: 'the and you that was for are with his they this have from one had word but not what all were when your can said there use each which she how their time will way about many then them' },
  { id: 'l2', title: '英文短文：The Sun', lang: 'en', difficulty: 2, source: 'builtin', content: 'The sun rises in the east and sets in the west. Every morning the sky turns from dark blue to bright gold. Birds begin to sing and the city slowly wakes up. A new day always brings new chances to learn and to grow.' },
  { id: 'l3', title: '中文常用词语', lang: 'zh', difficulty: 1, source: 'builtin', content: '我们 学习 工作 时间 问题 学生 老师 电脑 键盘 练习 进步 努力 坚持 目标 梦想 成功 快乐 健康 朋友 家人 学校 班级 知识 能力 思考' },
  { id: 'l4', title: '中文短文：晨光', lang: 'zh', difficulty: 2, source: 'builtin', content: '清晨的阳光洒在窗台上，新的一天开始了。教室里传来键盘的敲击声，同学们正在认真练习打字。熟能生巧，每一次练习都是一次进步。只要坚持不懈，速度和准确率都会稳步提升。' },
  { id: 'l5', title: '电商专业术语', lang: 'zh', difficulty: 3, source: 'builtin', content: '订单 客服 物流 仓储 售后 退款 评价 店铺 流量 转化率 客单价 复购率 直播带货 供应链 库存 促销 满减 优惠券 详情页 主图' },
  { id: 'l6', title: '纯数字练习', lang: 'num', difficulty: 1, source: 'builtin', content: '157 9320 48 6210 735 8946 1029 3847 5610 2938 4756 1203 9485 7621 3059 8412 6793 0524 1867 4930' },
]

// 游戏词库
export const GAME_WORDS = {
  en: ['cat', 'dog', 'sun', 'run', 'key', 'type', 'fast', 'jump', 'code', 'star', 'moon', 'fire', 'wind', 'rain', 'blue', 'gold', 'ship', 'rock', 'tree', 'bird', 'speed', 'magic', 'power', 'happy', 'dream', 'light', 'cloud', 'storm', 'brave', 'quick'],
  zh: ['你好', '学习', '键盘', '打字', '速度', '准确', '练习', '游戏', '快乐', '努力', '坚持', '进步', '梦想', '成功', '朋友', '时间', '电脑', '学校', '老师', '同学'],
  letters: 'abcdefghijklmnopqrstuvwxyz'.split(''),
}
