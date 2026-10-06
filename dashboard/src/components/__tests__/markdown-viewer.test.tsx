import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MarkdownViewer } from '../markdown-viewer';

describe('MarkdownViewer', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('renders loading state initially', () => {
    global.fetch = vi.fn().mockImplementation(() => new Promise(() => {}));
    render(<MarkdownViewer src="/docs/test.md" loadingLabel="Loading test..." />);
    expect(screen.getByText('Loading test...')).toBeInTheDocument();
  });

  it('renders error state when fetch fails', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
    } as Response);

    render(<MarkdownViewer src="/docs/missing.md" />);

    await waitFor(() => {
      expect(screen.getByText(/Failed to load document: HTTP 404/)).toBeInTheDocument();
    });
  });

  it('renders sanitized markdown content successfully', async () => {
    const markdownContent = '# Welcome to Algo Trader\n\nThis is **bold** text.\n<script>alert("xss")</script>';
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(markdownContent),
    } as Response);

    render(<MarkdownViewer src="/docs/welcome.md" />);

    await waitFor(() => {
      expect(screen.getByText('Welcome to Algo Trader')).toBeInTheDocument();
      expect(screen.getByText('bold')).toBeInTheDocument();
    });

    // Ensure script was stripped
    expect(document.querySelector('script')).toBeNull();
  });
});
