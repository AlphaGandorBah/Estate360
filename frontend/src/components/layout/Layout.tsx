import { Outlet } from 'react-router-dom'
import Navbar from './Navbar'
import ChatbotWidget from '@/components/chatbot/ChatbotWidget'

export default function Layout() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <Navbar />
      <main className="mx-auto max-w-7xl px-4 py-8">
        <Outlet />
      </main>
      <ChatbotWidget />
    </div>
  )
}
