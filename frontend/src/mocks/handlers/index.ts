import { authHandlers } from './auth'
import { listingsHandlers } from './listings'
import { panoramasHandlers } from './panoramas'
import { messagingHandlers } from './messaging'
import { chatbotHandlers, notificationsHandlers } from './misc'

export const handlers = [
  ...authHandlers,
  ...listingsHandlers,
  ...panoramasHandlers,
  ...messagingHandlers,
  ...chatbotHandlers,
  ...notificationsHandlers,
]
