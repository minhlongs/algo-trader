import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { BetaFeedbackItem } from './poly-beta-api-client';
import { PolyBetaFeedbackPanel } from './poly-beta-feedback-panel';
import type { PolyBetaSession } from './use-poly-beta-session';

type AuthedRequestFn = PolyBetaSession['authedRequest'];

function createMockRequest(
  handler: (path: string, options?: { method?: 'GET' | 'POST' | 'DELETE'; body?: unknown }) => Promise<{
    status: number;
    data: Record<string, unknown>;
    abortedSession: boolean;
  }>,
): AuthedRequestFn {
  return vi.fn(handler) as unknown as AuthedRequestFn;
}

describe('PolyBetaFeedbackPanel', () => {
  it('submits feedback on 201, shows confirmation, clears draft, and refreshes history', async () => {
    const items: BetaFeedbackItem[] = [];
    const created: BetaFeedbackItem = {
      feedbackId: 'fb-1',
      category: 'trading_simulation',
      message: 'Spread display looks clear on mobile.',
      screenId: 'dashboard',
      status: 'OPEN',
      createdAtMs: 1_700_000_000_000,
    };

    const authedRequest = createMockRequest(async (path, options) => {
      if (path === '/api/beta/feedback' && (!options?.method || options.method === 'GET')) {
        return { status: 200, data: { ok: true, feedback: [...items] }, abortedSession: false };
      }
      if (path === '/api/beta/feedback' && options?.method === 'POST') {
        items.unshift(created);
        return { status: 201, data: { ok: true, feedback: created }, abortedSession: false };
      }
      return { status: 404, data: { error: 'Not found' }, abortedSession: false };
    });

    render(<PolyBetaFeedbackPanel lang="en" authedRequest={authedRequest} />);

    const select = screen.getByTestId('feedback-category-select');
    const textarea = screen.getByTestId('feedback-message-input');
    const submitBtn = screen.getByTestId('feedback-submit-btn');

    fireEvent.change(select, { target: { value: 'trading_simulation' } });
    fireEvent.change(textarea, { target: { value: 'Spread display looks clear on mobile.' } });
    expect(submitBtn).not.toBeDisabled();

    fireEvent.click(submitBtn);

    const status = await screen.findByTestId('feedback-status');
    expect(status).toHaveAttribute('role', 'status');
    expect(status).toHaveTextContent('Feedback saved.');
    expect(textarea).toHaveValue('');

    const rows = await screen.findAllByTestId('feedback-history-item');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveTextContent('Spread display looks clear on mobile.');
    expect(screen.getByTestId('feedback-history-list')).toBeInTheDocument();
  });

  it('shows an error alert and preserves draft text when persistence fails with 500 or 400', async () => {
    let failStatus = 500;
    const authedRequest = createMockRequest(async (path, options) => {
      if (path === '/api/beta/feedback' && (!options?.method || options.method === 'GET')) {
        return { status: 200, data: { ok: true, feedback: [] }, abortedSession: false };
      }
      if (path === '/api/beta/feedback' && options?.method === 'POST') {
        return {
          status: failStatus,
          data: { ok: false, error: failStatus === 500 ? 'Database write failed' : 'Invalid feedback payload' },
          abortedSession: false,
        };
      }
      return { status: 404, data: { error: 'Not found' }, abortedSession: false };
    });

    render(<PolyBetaFeedbackPanel lang="en" authedRequest={authedRequest} />);
    const textarea = screen.getByTestId('feedback-message-input');
    const submitBtn = screen.getByTestId('feedback-submit-btn');

    fireEvent.change(textarea, { target: { value: 'Order button froze after pause.' } });
    fireEvent.click(submitBtn);

    const alert500 = await screen.findByTestId('feedback-status');
    expect(alert500).toHaveAttribute('role', 'alert');
    expect(alert500).toHaveTextContent('Database write failed');
    expect(alert500).not.toHaveTextContent(/feedback saved/i);
    expect(textarea).toHaveValue('Order button froze after pause.');

    failStatus = 400;
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByTestId('feedback-status')).toHaveTextContent('Invalid feedback payload');
    });
    expect(screen.getByTestId('feedback-status')).toHaveAttribute('role', 'alert');
    expect(textarea).toHaveValue('Order button froze after pause.');
  });

  it('disables submit when message is shorter than 5 trimmed characters', () => {
    const authedRequest = createMockRequest(async () => ({
      status: 200,
      data: { ok: true, feedback: [] },
      abortedSession: false,
    }));

    render(<PolyBetaFeedbackPanel lang="en" authedRequest={authedRequest} />);
    const textarea = screen.getByTestId('feedback-message-input');
    const submitBtn = screen.getByTestId('feedback-submit-btn');

    expect(submitBtn).toBeDisabled();

    fireEvent.change(textarea, { target: { value: '  hi  ' } });
    expect(submitBtn).toBeDisabled();

    fireEvent.change(textarea, { target: { value: 'valid' } });
    expect(submitBtn).not.toBeDisabled();
  });
});
