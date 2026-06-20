import api from '@/lib/apiClient'

export const chatbotApi = {
  query: (message: string) =>
    api.post<{ reply: string; intent: string | null; confidence: number; followups: string[] }>(
      '/chatbot/query', { message },
    ),
}
