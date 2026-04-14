import { TaskStep } from '../../types';

interface Props {
  steps: TaskStep[];
}

export function TaskStepList({ steps }: Props) {
  if (steps.length === 0) return null;

  return (
    <div className="mb-3 space-y-1">
      {steps.map((step, idx) => (
        <div
          key={step.id}
          className="flex items-center gap-2 text-xs py-1 px-2 rounded transition-all"
          style={{
            textDecoration: step.status === 'completed' ? 'line-through' : 'none',
            opacity: step.status === 'completed' ? 0.5 : 1,
            color: step.status === 'failed' ? '#ef4444' : 'var(--text-secondary)',
          }}
        >
          <span className="flex-shrink-0">
            {step.status === 'pending' && (
              <span className="inline-block w-2 h-2 rounded-full" style={{ background: '#6b7280' }} />
            )}
            {step.status === 'executing' && (
              <span className="inline-block w-2 h-2 rounded-full animate-pulse" style={{ background: '#22c55e' }} />
            )}
            {step.status === 'completed' && (
              <span className="inline-block w-2 h-2 rounded-full" style={{ background: '#22c55e' }} />
            )}
            {step.status === 'failed' && (
              <span className="inline-block w-2 h-2 rounded-full" style={{ background: '#ef4444' }} />
            )}
          </span>
          <span className="truncate">{step.description}</span>
        </div>
      ))}
    </div>
  );
}
