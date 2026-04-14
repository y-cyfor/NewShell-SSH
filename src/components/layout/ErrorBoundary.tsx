import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary] Caught error:', error, errorInfo.componentStack);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      return (
        <div
          className="flex flex-col items-center justify-center h-full p-8"
          style={{ background: 'var(--bg-primary)', color: 'var(--text-primary)' }}
        >
          <h2 className="text-lg font-semibold mb-2" style={{ color: '#ef4444' }}>
            出现错误
          </h2>
          <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
            组件渲染失败，请刷新页面重试。
          </p>
          {this.state.error && (
            <pre
              className="text-xs p-3 rounded overflow-auto max-w-full max-h-48"
              style={{ background: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}
            >
              {this.state.error.message}
            </pre>
          )}
          <button
            onClick={() => window.location.reload()}
            className="mt-4 px-4 py-2 rounded text-sm"
            style={{ background: 'var(--accent)', color: '#fff' }}
          >
            刷新页面
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
