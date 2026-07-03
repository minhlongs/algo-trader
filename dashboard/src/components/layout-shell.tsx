/**
 * Dashboard layout: sidebar navigation + main content area.
 * Quant Elite dark theme. Phosphor icons. Framer Motion transitions.
 */
import { ReactNode, useState } from 'react';
import { X, List } from '@phosphor-icons/react';
import { AnimatePresence, motion } from 'motion/react';
import { SidebarNavigation } from './sidebar-navigation';

export function LayoutShell({ children }: { children: ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden bg-bg font-sans">
      {/* Skip to main content */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:px-4 focus:py-2 focus:bg-accent focus:text-bg focus:rounded-lg focus:text-sm focus:font-semibold focus:outline-none"
      >
        Skip to main content
      </a>

      {/* Mobile overlay */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.div
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={() => setSidebarOpen(false)}
            aria-hidden="true"
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-50 w-64 bg-bg-surface border-r border-bg-border
          transform transition-transform duration-300 ease-[0.25,0.46,0.45,0.94]
          md:relative md:translate-x-0 md:z-auto
          ${sidebarOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full md:shadow-none'}`}>
        {/* Sidebar header */}
        <div className="flex items-center justify-between h-14 px-4 border-b border-bg-border">
          <div>
            <h1 className="text-accent font-bold text-base tracking-tight">CashClaw</h1>
            <p className="text-muted text-[10px] mt-0.5 tracking-wide">POLYMARKET MM</p>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="md:hidden p-2 text-muted hover:text-white rounded-lg hover:bg-bg-border transition-colors min-h-touch min-w-touch flex items-center justify-center"
            aria-label="Close sidebar"
          >
            <X weight="bold" className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto">
          <SidebarNavigation onNavigate={() => setSidebarOpen(false)} />
        </nav>

        <div className="p-4 border-t border-bg-border">
          <p className="text-[10px] text-muted">v5.7.0</p>
        </div>
      </aside>

      {/* Main content */}
      <main id="main-content" className="flex-1 overflow-y-auto flex flex-col min-w-0">
        {/* Mobile header */}
        <header className="sticky top-0 z-30 md:hidden glass border-b border-bg-border">
          <div className="flex items-center justify-between h-14 px-4">
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-2 -ml-2 text-muted hover:text-white rounded-lg hover:bg-bg-border transition-colors min-h-touch min-w-touch flex items-center justify-center"
              aria-label="Open menu"
            >
              <List weight="bold" className="w-6 h-6" />
            </button>
            <span className="text-accent font-bold text-base">CashClaw</span>
            <div className="w-10" />
          </div>
        </header>

        <div className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto">
          {children}
        </div>

        <footer className="hidden md:block border-t border-bg-border py-3 px-8">
          <p className="text-xs text-muted text-center">
            CashClaw v5.7.0 • Real-time trading dashboard
          </p>
        </footer>
      </main>
    </div>
  );
}
