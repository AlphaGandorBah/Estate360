import api from '@/lib/apiClient'

export interface ChatbotListingResult {
  id: number
  title: string
  price_annual: number
  currency: string
  bedrooms: number
  location_area: string
}

export interface ChatbotReply {
  reply: string
  intent: string | null
  confidence: number
  followups: string[]
  results: ChatbotListingResult[]
}

export interface ChatbotHistoryTurn {
  role: 'user' | 'assistant'
  content: string
}

export const chatbotApi = {
  query: (message: string, history: ChatbotHistoryTurn[] = []) =>
    api.post<ChatbotReply>('/chatbot/query', { message, history }),
}
