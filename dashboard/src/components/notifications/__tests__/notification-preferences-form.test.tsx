/**
 * Tests for NotificationPreferencesForm
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NotificationPreferencesForm } from '../NotificationPreferencesForm';
import { useNotificationsStore } from '../../../stores/notifications-store';

const resetPreferences = () => {
  useNotificationsStore.getState().updatePreferences({
    toastEnabled: true,
    emailEnabled: false,
    soundEnabled: false,
    minSeverity: 'medium',
    maxVisibleToasts: 5,
  });
};

describe('NotificationPreferencesForm', () => {
  beforeEach(() => {
    resetPreferences();
  });

  it('renders all form controls', () => {
    render(<NotificationPreferencesForm />);
    expect(screen.getByText('Toast Notifications')).toBeDefined();
    expect(screen.getByText('Email Alerts')).toBeDefined();
    expect(screen.getByText('Sound Alerts')).toBeDefined();
    expect(screen.getByText('Minimum Severity')).toBeDefined();
    expect(screen.getByText('Max Visible Toasts')).toBeDefined();
    expect(screen.getByText('Reset to Defaults')).toBeDefined();
  });

  it('toggles toastEnabled when checkbox clicked', () => {
    render(<NotificationPreferencesForm />);
    const checkboxes = screen.getAllByRole('checkbox');
    const toastCheckbox = checkboxes[0]; // first one
    expect(toastCheckbox).toBeChecked();
    fireEvent.click(toastCheckbox);
    expect(toastCheckbox).not.toBeChecked();
    expect(useNotificationsStore.getState().preferences.toastEnabled).toBe(false);
  });

  it('changes minSeverity via select', () => {
    render(<NotificationPreferencesForm />);
    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: 'high' } });
    expect(useNotificationsStore.getState().preferences.minSeverity).toBe('high');
  });

  it('updates maxVisibleToasts via input', () => {
    render(<NotificationPreferencesForm />);
    const input = screen.getByLabelText(/Max Visible Toasts/i);
    fireEvent.change(input, { target: { value: '8' } });
    expect(useNotificationsStore.getState().preferences.maxVisibleToasts).toBe(8);
  });
});
