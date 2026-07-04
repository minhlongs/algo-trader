/**
 * Tests for ToastContainer
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ToastContainer } from '../ToastContainer';
import { useNotificationsStore } from '../../../stores/notifications-store';

describe('ToastContainer', () => {
  beforeEach(() => {
    useNotificationsStore.getState().clearAll();
  });

  it('renders nothing when no notifications', () => {
    const { container } = render(<ToastContainer />);
    expect(container.firstChild).toBeNull();
  });

  it('renders toast items when notifications exist', () => {
    useNotificationsStore.getState().addNotification({
      type: 'info',
      severity: 'medium', // meets default minSeverity
      message: 'Test toast',
    });
    render(<ToastContainer />);
    expect(screen.getByText('Test toast')).toBeDefined();
  });

  it('renders multiple toasts', () => {
    useNotificationsStore.getState().addNotification({
      type: 'info',
      severity: 'medium',
      message: 'First',
    });
    useNotificationsStore.getState().addNotification({
      type: 'info',
      severity: 'medium',
      message: 'Second',
    });
    render(<ToastContainer />);
    expect(screen.getByText('First')).toBeDefined();
    expect(screen.getByText('Second')).toBeDefined();
  });
});
