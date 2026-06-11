import { defineStore } from 'pinia'
import { supabase } from '../lib/supabase'

const KEY = 'keypath_session'

export const useUserStore = defineStore('user', {
  state: () => ({
    user: JSON.parse(localStorage.getItem(KEY) || 'null'), // null=访客
  }),
  getters: {
    isLogin: s => !!s.user,
    isStudent: s => s.user?.role === 'student',
    isTeacher: s => ['teacher', 'super'].includes(s.user?.role),
    isSuper: s => s.user?.role === 'super',
  },
  actions: {
    async login(account, name, password) {
      const { data, error } = await supabase.rpc('fn_login', { p_account: account, p_name: name, p_password: password })
      if (error) throw new Error('无法连接数据库，请确认已在 Supabase 运行 schema.sql（' + error.message + '）')
      if (!data.ok) throw new Error(data.msg)
      this.user = data.user
      localStorage.setItem(KEY, JSON.stringify(data.user))
      return data.user
    },
    logout() {
      this.user = null
      localStorage.removeItem(KEY)
    },
    patch(p) {
      this.user = { ...this.user, ...p }
      localStorage.setItem(KEY, JSON.stringify(this.user))
    },
    async changePassword(oldPwd, newPwd) {
      const { data, error } = await supabase.rpc('fn_change_password', { p_user_id: this.user.id, p_old: oldPwd, p_new: newPwd })
      if (error) throw new Error(error.message)
      if (!data.ok) throw new Error(data.msg)
    },
    async saveProfile({ name, avatar }) {
      const upd = { avatar, must_complete_profile: false }
      if (name) upd.name = name
      const { error } = await supabase.from('users').update(upd).eq('id', this.user.id)
      if (error) throw new Error(error.message)
      this.patch({ ...upd, name: name || this.user.name })
    },
  },
})
