import { authHandlers } from './auth'
import { listingsHandlers } from './listings'
import { panoramasHandlers } from './panoramas'
import { messagingHandlers } from './messaging'
import { moderationHandlers } from './moderation'
import { chatbotHandlers, notificationsHandlers } from './misc'
import { recommendationsHandlers } from './recommendations'

export const handlers = [
  ...authHandlers,
  ...listingsHandlers,
  ...panoramasHandlers,
  ...messagingHandlers,
  ...moderationHandlers,
  ...chatbotHandlers,
  ...notificationsHandlers,
  ...recommendationsHandlers,
]
