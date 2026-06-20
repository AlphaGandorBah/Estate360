// Thin per-backend-module endpoint functions, one file per app — apiClient
// (transport + interceptors) lives in @/lib/apiClient. Re-exported from here
// so existing `import { x } from '@/api'` call sites don't all need updating;
// new code can import directly from the specific module instead.
export { authApi } from './auth'
export { usersApi } from './users'
export { listingsApi, savedApi } from './listings'
export { verificationApi } from './verification'
export { panoramasApi } from './panoramas'
export { messagingApi } from './messaging'
export { notificationsApi } from './notifications'
export { recommendationsApi } from './recommendations'
export { chatbotApi } from './chatbot'
export { reportsApi } from './moderation'
export { adminApi } from './admin'
