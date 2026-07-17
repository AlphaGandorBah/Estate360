import { Outlet } from 'react-router-dom'
import Navbar from './Navbar'
import RestrictionBanner from './RestrictionBanner'
import ChatbotWidget from '@/components/chatbot/ChatbotWidget'

export default function Layout() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-gray-50 dark:bg-gray-950">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.08),transparent_35%)]" />
      <Navbar />
      <RestrictionBanner />
      <main className="relative mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
        <Outlet />
      </main>
      <ChatbotWidget />
    </div>
  )
}
