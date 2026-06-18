/**
 * Tests for ToastItem
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ToastItem } from '../ToastItem';
import { useNotificationsStore } from '../../../stores/notifications-store';
import type { Notification } from '../../../stores/notifications-store';

const mockNotification: Notification = {
  id: 'test-1',
  type: 'success',
  severity: 'medium',
  title: 'Test Title',
  message: 'Hello world',
  createdAt: Date.now(),
  read: false,
};

describe('ToastItem', () => {
  beforeEach(() => {
    // Ensure store is clean
    useNotificationsStore.getState().clearAll();
  });

  it('renders notification title and message', () => {
    render(<ToastItem notification={mockNotification} onClose={() => {}} />);
    expect(screen.getByText('Test Title')).toBeDefined();
    expect(screen.getByText('Hello world')).toBeDefined();
  });

  it('displays severity label', () => {
    render(<ToastItem notification={mockNotification} onClose={() => {}} />);
    expect(screen.getByText('MEDIUM')).toBeDefined();
  });

  it('calls onClose when dismiss button clicked', () => {
    let closed = false;
    const onClose = () => { closed = true; };
    render(<ToastItem notification={mockNotification} onClose={onClose} />);
    const dismissBtn = screen.getByLabelText('Dismiss notification');
    fireEvent.click(dismissBtn);
    expect(closed).toBe(true);
  });
});
