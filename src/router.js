import { createRouter, createWebHashHistory } from 'vue-router'
import { useUserStore } from './stores/user'

const routes = [
  { path: '/', component: () => import('./views/Home.vue') },
  { path: '/login', component: () => import('./views/Login.vue') },
  { path: '/practice', component: () => import('./views/Practice.vue') },
  { path: '/games', component: () => import('./views/Games.vue') },
  { path: '/games/space', component: () => import('./views/games/SpaceType.vue') },
  { path: '/games/crush', component: () => import('./views/games/WordCrush.vue') },
  { path: '/games/race', component: () => import('./views/games/TypeRace.vue') },
  { path: '/games/bomb', component: () => import('./views/games/BombType.vue') },
  { path: '/games/quest', component: () => import('./views/games/TypeQuest.vue') },
  { path: '/games/mole', component: () => import('./views/games/MoleType.vue') },
  { path: '/tasks', component: () => import('./views/Tasks.vue'), meta: { auth: true } },
  { path: '/tasks/:id/run', component: () => import('./views/TaskRun.vue'), meta: { auth: true } },
  { path: '/leaderboard', component: () => import('./views/Leaderboard.vue') },
  { path: '/profile', component: () => import('./views/Profile.vue'), meta: { auth: true } },
  { path: '/admin', component: () => import('./views/Admin.vue'), meta: { teacher: true } },
]

const router = createRouter({ history: createWebHashHistory(), routes })

router.beforeEach((to) => {
  const u = useUserStore()
  if (to.meta.auth && !u.isLogin) return '/login'
  if (to.meta.teacher && !u.isTeacher) return '/login'
})

export default router
