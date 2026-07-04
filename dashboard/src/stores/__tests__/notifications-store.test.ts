/**
 * Tests for notifications store
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useNotificationsStore } from '../notifications-store';

const resetStore = () => {
  // Clear all notifications and reset preferences
  useNotificationsStore.getState().clearAll();
  useNotificationsStore.getState().updatePreferences({
    toastEnabled: true,
    emailEnabled: false,
    soundEnabled: false,
    minSeverity: 'medium',
    maxVisibleToasts: 5,
  });
};

describe('notifications store', () => {
  beforeEach(() => {
    resetStore();
  });

  it('adds a notification', () => {
    const { addNotification } = useNotificationsStore.getState();
    addNotification({
      type: 'info',
      severity: 'medium', // meets default minSeverity
      message: 'Test notification',
    });
    expect(useNotificationsStore.getState().notifications.length).toBe(1);
    expect(useNotificationsStore.getState().notifications[0].message).toBe('Test notification');
  });

  it('removes a notification by id', () => {
    const { addNotification, removeNotification } = useNotificationsStore.getState();
    addNotification({
      type: 'success',
      severity: 'medium',
      message: 'First',
    });
    addNotification({
      type: 'error',
      severity: 'high',
      message: 'Second',
    });
    // Notifications are prepended, so order is [Second, First]
    const notifs = useNotificationsStore.getState().notifications;
    const idToRemove = notifs[1].id; // remove older (First)
    removeNotification(idToRemove);
    expect(useNotificationsStore.getState().notifications.length).toBe(1);
    expect(useNotificationsStore.getState().notifications[0].message).toBe('Second');
  });

  it('marks a notification as read', () => {
    const { addNotification, markAsRead } = useNotificationsStore.getState();
    addNotification({
      type: 'warning',
      severity: 'high',
      message: 'Warning',
    });
    const id = useNotificationsStore.getState().notifications[0].id;
    markAsRead(id);
    expect(useNotificationsStore.getState().notifications[0].read).toBe(true);
  });

  it('clears all notifications', () => {
    const { addNotification, clearAll } = useNotificationsStore.getState();
    addNotification({ type: 'info', severity: 'low', message: 'A' });
    addNotification({ type: 'info', severity: 'low', message: 'B' });
    clearAll();
    expect(useNotificationsStore.getState().notifications.length).toBe(0);
  });

  it('updates preferences', () => {
    const { updatePreferences } = useNotificationsStore.getState();
    updatePreferences({ toastEnabled: false, minSeverity: 'high' });
    const prefs = useNotificationsStore.getState().preferences;
    expect(prefs.toastEnabled).toBe(false);
    expect(prefs.minSeverity).toBe('high');
  });

  it('shouldShow returns true for severity >= minSeverity', () => {
    const { shouldShow, updatePreferences } = useNotificationsStore.getState();
    updatePreferences({ minSeverity: 'medium' });
    expect(shouldShow('low')).toBe(false);
    expect(shouldShow('medium')).toBe(true);
    expect(shouldShow('high')).toBe(true);
    expect(shouldShow('critical')).toBe(true);
  });

  it('enforces maxVisibleToasts limit', () => {
    const { addNotification, preferences } = useNotificationsStore.getState();
    // Add 10 notifications with high severity (meets minSeverity)
    for (let i = 0; i < 10; i++) {
      addNotification({
        type: 'info',
        severity: 'high', // ensure it's added
        message: `Notification ${i}`,
      });
    }
    const count = useNotificationsStore.getState().notifications.length;
    expect(count).toBe(preferences.maxVisibleToasts);
    // The newest should be first; check that the first is "Notification 9"
    expect(useNotificationsStore.getState().notifications[0].message).toBe('Notification 9');
  });
});
