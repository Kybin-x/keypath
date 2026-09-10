<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { NCard, NTabs, NTabPane, NForm, NFormItem, NInput, NButton, useMessage, NModal, NSpace, NAvatar } from 'naive-ui'
import { useUserStore } from '../stores/user'
import { evaluateAchievements } from '../lib/records'
import { AVATAR_STYLES, avatarUrl } from '../lib/avatar'
import { verifyTotp } from '../lib/totp'
import { supabase } from '../lib/supabase'

const router = useRouter()
const message = useMessage()
const user = useUserStore()

const tab = ref('student')
const stuForm = ref({ no: '', name: '', pwd: '123' })
const admForm = ref({ no: '', pwd: '' })
const loading = ref(false)

// TOTP 二步验证
const totpStep = ref(false)    // 是否进入第二步
const totpCode = ref('')
const totpPending = ref(null)  // 密码验证通过的临时用户对象
const totpLoading = ref(false)

async function verifyTotpStep() {
  if (!totpCode.value || totpCode.value.replace(/\s/g, '').length !== 6) {
    return message.warning('请输入 6 位验证码')
  }
  totpLoading.value = true
  try {
    // 重新用密码换取 TOTP secret（密码已验证，只是取 secret）
    const { data: r } = await supabase.rpc('fn_get_totp_secret', {
      p_account: admForm.value.no,
      p_password: admForm.value.pwd,
    })
    if (!r?.ok) throw new Error(r?.msg || '获取验证配置失败')
    const ok = await verifyTotp(r.secret, totpCode.value)
    if (!ok) { message.error('验证码错误或已过期，请重试'); return }
    // 验证通过 → 完成登录
    await afterLogin(totpPending.value)
  } catch (e) { message.error(e.message) } finally { totpLoading.value = false }
}

async function afterLogin(u) {
  user.setUser(u)
  message.success(`欢迎，${u.name}！`)
  evaluateAchievements({ loginEvent: true }).then(list =>
    list.forEach(a => message.info(`${a.icon} 解锁成就：${a.title}`)))
  if (u.role === 'student' && u.must_complete_profile) {
    guideSeed.value = u.name
    showGuide.value = true
  } else {
    router.push('/')
  }
}

// 首次登录引导
const showGuide = ref(false)
const guideAvatar = ref('adventurer')
const guideSeed = ref('')
const newPwd = ref('')

async function doLogin(isStudent) {
  loading.value = true
  try {
    const f = isStudent ? stuForm.value : admForm.value
    const result = await user.login(isStudent ? f.no : f.no, isStudent ? f.name : '', f.pwd, { dryRun: !isStudent })
    if (!isStudent && result?.totp_required) {
      // 管理员且已启用 TOTP → 进入第二步
      totpPending.value = result.user
      totpCode.value = ''
      totpStep.value = true
      return
    }
    await afterLogin(result.user)
  } catch (e) {
    message.error(e.message)
  } finally { loading.value = false }
}

async function finishGuide() {
  try {
    await user.saveProfile({ avatar: `${guideAvatar.value}:${guideSeed.value}` })
    if (newPwd.value.trim()) {
      await user.changePassword(stuForm.value.pwd, newPwd.value.trim())
      message.success('密码已修改')
    }
    showGuide.value = false
    router.push('/')
  } catch (e) { message.error(e.message) }
}
</script>

<template>
  <div class="login-wrap">
    <n-card class="login-card" :bordered="false">
      <div class="brand">
        <div class="brand-icon">⌨️</div>
        <h1>键途 KeyPath</h1>
        <p>打字的成长之路</p>
      </div>
      <n-tabs v-model:value="tab" justify-content="space-evenly" size="large">
        <n-tab-pane name="student" tab="学生登录">
          <n-form @submit.prevent>
            <n-form-item label="学号"><n-input v-model:value="stuForm.no" placeholder="请输入学号" /></n-form-item>
            <n-form-item label="姓名"><n-input v-model:value="stuForm.name" placeholder="请输入姓名" /></n-form-item>
            <n-form-item label="密码"><n-input v-model:value="stuForm.pwd" type="password" show-password-on="click" placeholder="默认密码 123" @keyup.enter="doLogin(true)" /></n-form-item>
            <n-button type="primary" block size="large" :loading="loading" @click="doLogin(true)">登 录</n-button>
          </n-form>
        </n-tab-pane>
        <n-tab-pane name="admin" tab="教师登录">
          <template v-if="!totpStep">
            <n-form @submit.prevent>
              <n-form-item label="账号"><n-input v-model:value="admForm.no" placeholder="教师账号" /></n-form-item>
              <n-form-item label="密码"><n-input v-model:value="admForm.pwd" type="password" show-password-on="click" placeholder="密码" @keyup.enter="doLogin(false)" /></n-form-item>
              <n-button type="primary" block size="large" :loading="loading" @click="doLogin(false)">登 录</n-button>
            </n-form>
          </template>
          <template v-else>
            <div style="text-align:center;margin-bottom:18px">
              <div style="font-size:36px">🔐</div>
              <div style="font-weight:700;font-size:16px;margin:8px 0 4px">身份验证器</div>
              <div style="opacity:.6;font-size:13px">请打开身份验证器 App，输入 6 位动态验证码</div>
            </div>
            <n-form-item label="验证码">
              <n-input v-model:value="totpCode" placeholder="000000" maxlength="6" style="letter-spacing:6px;font-size:20px;text-align:center"
                @keyup.enter="verifyTotpStep" />
            </n-form-item>
            <n-button type="primary" block size="large" :loading="totpLoading" @click="verifyTotpStep">验 证</n-button>
            <n-button block quaternary style="margin-top:8px" @click="totpStep=false">← 返回重新输入密码</n-button>
          </template>
        </n-tab-pane>
      </n-tabs>
      <div class="guest-link">
        <a @click="router.push('/practice')">先逛逛 → 以访客身份体验基础练习</a>
      </div>
    </n-card>

    <n-modal v-model:show="showGuide" preset="card" title="🎉 首次登录 — 完善个人信息" style="max-width: 460px" :mask-closable="false">
      <p style="opacity:.7">选择一个喜欢的头像，建议同时修改默认密码。</p>
      <n-space align="center">
        <n-avatar round :size="72" :src="avatarUrl(`${guideAvatar}:${guideSeed}`)" />
        <n-button size="small" @click="guideSeed = guideSeed + Math.floor(Math.random() * 100)">🎲 换一个</n-button>
      </n-space>
      <n-space style="margin: 14px 0" :size="6">
        <n-button v-for="s in AVATAR_STYLES" :key="s.key" size="tiny" round
          :type="guideAvatar === s.key ? 'primary' : 'default'" @click="guideAvatar = s.key">{{ s.label }}</n-button>
      </n-space>
      <n-form-item label="新密码（留空则不修改）">
        <n-input v-model:value="newPwd" type="password" show-password-on="click" placeholder="设置新密码" />
      </n-form-item>
      <n-button type="primary" block @click="finishGuide">完成，开始打字之旅 🚀</n-button>
    </n-modal>
  </div>
</template>

<style scoped>
.login-wrap { display: flex; justify-content: center; align-items: center; min-height: 75vh; }
.login-card { max-width: 420px; width: 100%; box-shadow: 0 12px 40px rgba(79,70,229,.15); }
.brand { text-align: center; margin-bottom: 8px; }
.brand-icon { font-size: 48px; }
.brand h1 { margin: 8px 0 4px; background: linear-gradient(90deg, var(--kp-primary), var(--kp-secondary));
  -webkit-background-clip: text; background-clip: text; color: transparent; }
.brand p { margin: 0 0 8px; opacity: .6; }
.guest-link { text-align: center; margin-top: 16px; }
.guest-link a { color: var(--kp-primary); cursor: pointer; font-size: 14px; }
</style>
