import { AgentMessage as AgentMessageType } from '../../types';
import { ToolCallCard } from './ToolCallCard';
import { TaskStepList } from './TaskStepList';
import ReactMarkdown from 'react-markdown';
import { Loader, Sparkles } from 'lucide-react';

interface Props {
  message: AgentMessageType;
  isStreaming: boolean;
  isLast: boolean;
}

export function AgentMessageView({ message, isStreaming, isLast }: Props) {
  if (message.role === 'user') {
    return (
      <div className="flex justify-end animate-fade-in">
        <div
          className="max-w-[85%] px-3 py-2 rounded-lg text-xs"
          style={{ background: 'var(--accent)', color: '#fff' }}
        >
          {message.content}
        </div>
      </div>
    );
  }

  // Thinking indicator
  if (message.isThinking) {
    return (
      <div className="animate-fade-in">
        <div className="flex items-center gap-2 text-xs mb-2" style={{ color: 'var(--text-secondary)' }}>
          <Loader size={12} className="animate-spin" />
          <span>正在思考{message.iteration ? ` (第 ${message.iteration} 步)` : ''}...</span>
        </div>
        {/* Show task steps if available */}
        {message.taskSteps && message.taskSteps.length > 0 && (
          <TaskStepList steps={message.taskSteps} />
        )}
      </div>
    );
  }

  // Assistant message
  return (
    <div className="animate-fade-in">
      {/* Task steps list */}
      {message.taskSteps && message.taskSteps.length > 0 && (
        <TaskStepList steps={message.taskSteps} />
      )}

      {/* Tool calls - interleaved with content */}
      {message.toolCalls && message.toolCalls.length > 0 && (
        <div className="mb-2">
          {message.toolCalls.map((tc) => (
            <ToolCallCard key={tc.id} toolCall={tc} />
          ))}
        </div>
      )}

      {/* Text content */}
      {message.content && (
        <div
          className="text-xs leading-relaxed"
          style={{
            color: message.isFinal
              ? 'var(--text-primary)'
              : isStreaming && isLast
                ? 'rgba(var(--text-primary-rgb, 30,41,59), 0.5)'
                : 'var(--text-primary)',
          }}
        >
          {message.isFinal ? (
            <div className="markdown-body">
              <ReactMarkdown
                components={{
                  code({ className, children, ...props }: any) {
                    const match = /language-(\w+)/.exec(className || '');
                    const codeString = String(children).replace(/\n$/, '');
                    const isBlock = codeString.includes('\n') || !!match;
                    if (isBlock) {
                      return (
                        <div className="ai-code-block">
                          {match && <div className="text-xs mb-1 opacity-50">{match[1]}</div>}
                          <pre><code className={className} {...props}>{children}</code></pre>
                        </div>
                      );
                    }
                    return <code className="px-1 py-0.5 rounded text-xs" style={{ background: 'var(--bg-tertiary)' }} {...props}>{children}</code>;
                  },
                  p({ children }) { return <p className="mb-2 leading-relaxed">{children}</p>; },
                  ul({ children }) { return <ul className="mb-2 ml-4 list-disc">{children}</ul>; },
                  ol({ children }) { return <ol className="mb-2 ml-4 list-decimal">{children}</ol>; },
                  li({ children }) { return <li className="mb-1">{children}</li>; },
                  h1({ children }) { return <h1 className="text-sm font-bold mb-2">{children}</h1>; },
                  h2({ children }) { return <h2 className="text-xs font-bold mb-2">{children}</h2>; },
                  h3({ children }) { return <h3 className="text-xs font-semibold mb-1">{children}</h3>; },
                  blockquote({ children }) {
                    return <blockquote className="mb-2 pl-3 py-1" style={{ borderLeft: '3px solid var(--accent)', color: 'var(--text-secondary)' }}>{children}</blockquote>;
                  },
                  table({ children }) {
                    return <table className="mb-2 text-xs border-collapse w-full">{children}</table>;
                  },
                  th({ children }) {
                    return <th className="border px-2 py-1 text-left" style={{ borderColor: 'var(--border)', background: 'var(--bg-tertiary)' }}>{children}</th>;
                  },
                  td({ children }) {
                    return <td className="border px-2 py-1" style={{ borderColor: 'var(--border)' }}>{children}</td>;
                  },
                }}
              >
                {message.content}
              </ReactMarkdown>
            </div>
          ) : (
            <div className="whitespace-pre-wrap">{message.content}</div>
          )}
        </div>
      )}

      {/* Empty state */}
      {!message.content && !message.toolCalls?.length && !message.taskSteps?.length && (
        <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
          <Sparkles size={12} style={{ color: 'var(--accent)' }} />
          <span>Agent 已就绪</span>
        </div>
      )}
    </div>
  );
}
