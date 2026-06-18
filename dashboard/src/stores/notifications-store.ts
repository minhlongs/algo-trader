/**
 * Notifications Store — Manages toast notifications and alert preferences
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { createJSONStorage } from 'zustand/middleware';

export type NotificationSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface Notification {
  id: string;
  type: 'info' | 'success' | 'warning' | 'error';
  severity: NotificationSeverity;
  title?: string;
  message: string;
  duration?: number; // ms, 0 = sticky
  createdAt: number;
  read: boolean;
}

export interface NotificationPreferences {
  toastEnabled: boolean;
  emailEnabled: boolean;
  soundEnabled: boolean;
  minSeverity: NotificationSeverity;
  maxVisibleToasts: number;
}

const DEFAULT_PREFERENCES: NotificationPreferences = {
  toastEnabled: true,
  emailEnabled: false,
  soundEnabled: false,
  minSeverity: 'medium',
  maxVisibleToasts: 5,
};

interface NotificationsState {
  notifications: Notification[];
  preferences: NotificationPreferences;
  addNotification: (notification: Omit<Notification, 'id' | 'createdAt' | 'read'>) => string;
  removeNotification: (id: string) => void;
  markAsRead: (id: string) => void;
  clearAll: () => void;
  updatePreferences: (prefs: Partial<NotificationPreferences>) => void;
  shouldShow: (severity: NotificationSeverity) => boolean;
}

const generateId = () => Math.random().toString(36).substring(2, 9);

export const useNotificationsStore = create<NotificationsState>()(
  persist(
    (set, get) => ({
      notifications: [],
      preferences: DEFAULT_PREFERENCES,
      addNotification: (notification) => {
        const id = generateId();
        const now = Date.now();
        const severity = notification.severity;
        const { minSeverity } = get().preferences;
        // Check if severity meets threshold
        const severityOrder: Record<NotificationSeverity, number> = {
          low: 1,
          medium: 2,
          high: 3,
          critical: 4,
        };
        if (severityOrder[severity] < severityOrder[minSeverity]) {
          return id; // Still add but may be filtered by UI
        }
        const newNotification: Notification = {
          ...notification,
          id,
          createdAt: now,
          read: false,
        };
        set((state) => {
          const updated = [newNotification, ...state.notifications];
          // Enforce max visible toasts (keep only newest)
          const max = state.preferences.maxVisibleToasts;
          if (updated.length > max) {
            return { notifications: updated.slice(0, max) };
          }
          return { notifications: updated };
        });
        // Auto-remove after duration if set
        if (notification.duration && notification.duration > 0) {
          setTimeout(() => {
            get().removeNotification(id);
          }, notification.duration);
        }
        return id;
      },
      removeNotification: (id) =>
        set((state) => ({
          notifications: state.notifications.filter((n) => n.id !== id),
        })),
      markAsRead: (id) =>
        set((state) => ({
          notifications: state.notifications.map((n) =>
            n.id === id ? { ...n, read: true } : n
          ),
        })),
      clearAll: () => set({ notifications: [] }),
      updatePreferences: (prefs) =>
        set((state) => ({
          preferences: { ...state.preferences, ...prefs },
        })),
      shouldShow: (severity) => {
        const { minSeverity } = get().preferences;
        const severityOrder: Record<NotificationSeverity, number> = {
          low: 1,
          medium: 2,
          high: 3,
          critical: 4,
        };
        return severityOrder[severity] >= severityOrder[minSeverity];
      },
    }),
    {
      name: 'algo-trader-notifications-preferences',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ preferences: state.preferences }),
    }
  )
);
