/**
 * Co-pilot message bubble component.
 *
 * Renders bot messages (left-aligned, gray) and user messages (right-aligned, blue).
 * Bot content is rendered as markdown with DOMPurify sanitization.
 * Error states show a red border with retry button.
 * Loading state shows typing dots animation.
 */
import DOMPurify from 'dompurify';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Message } from '../../stores/co-pilot-store';

interface Props {
  message: Message;
  onRetry?: () => void;
}

function TypingDots() {
  return (
    <div className="flex items-center gap-1.5 py-1">
      <span className="w-2 h-2 bg-muted rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
      <span className="w-2 h-2 bg-muted rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
      <span className="w-2 h-2 bg-muted rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
    </div>
  );
}

function BotAvatar() {
  return (
    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-accent/20 border border-accent/30 flex items-center justify-center">
      <svg className="w-4 h-4 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
    </div>
  );
}

function UserAvatar() {
  return (
    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-accent flex items-center justify-center">
      <svg className="w-4 h-4 text-bg" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
      </svg>
    </div>
  );
}

/** Loading indicator shown while AI is generating a response */
export function CoPilotTypingIndicator() {
  return (
    <div className="flex gap-2.5 px-4 py-3">
      <BotAvatar />
      <div className="flex-1 max-w-[80%] bg-bg-surface border border-bg-border rounded-2xl rounded-tl-sm px-4 py-3">
        <p className="text-xs text-muted mb-1">AI is thinking...</p>
        <TypingDots />
      </div>
    </div>
  );
}

export function CoPilotMessage({ message, onRetry }: Props) {
  const isUser = message.role === 'user';
  const isError = message.error;

  // Sanitize bot content before markdown rendering
  const sanitizedContent = isUser
    ? message.content
    : DOMPurify.sanitize(message.content, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });

  return (
    <div className={`flex gap-2.5 px-4 py-2 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
      {isUser ? <UserAvatar /> : <BotAvatar />}

      <div
        className={`
          flex-1 max-w-[80%] px-4 py-3 text-sm leading-relaxed
          ${isUser
            ? 'bg-accent text-bg rounded-2xl rounded-tr-sm'
            : isError
              ? 'bg-loss/10 border border-loss/40 text-muted rounded-2xl rounded-tl-sm'
              : 'bg-bg-surface border border-bg-border text-muted rounded-2xl rounded-tl-sm'
          }
        `}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap">{sanitizedContent}</p>
        ) : isError ? (
          <div>
            <p className="text-loss text-xs font-semibold mb-1">Error</p>
            <p className="whitespace-pre-wrap">{message.content}</p>
            {onRetry && (
              <button
                onClick={onRetry}
                className="mt-2 px-3 py-1 text-xs font-semibold bg-loss/20 border border-loss/40 text-loss rounded hover:bg-loss/30 transition-colors"
              >
                Retry
              </button>
            )}
          </div>
        ) : (
          <div className="prose prose-invert prose-sm max-w-none">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {sanitizedContent}
            </ReactMarkdown>
          </div>
        )}

        <p className="text-[10px] text-muted/50 mt-1">
          {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </p>
      </div>
    </div>
  );
}
