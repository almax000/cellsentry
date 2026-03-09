import { Component, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('[ErrorBoundary]', error, info.componentStack)
  }

  render(): ReactNode {
    if (!this.state.hasError) return this.props.children

    const isZh = navigator.language?.startsWith('zh')

    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        fontFamily: 'var(--font-sans, -apple-system, sans-serif)',
        color: 'var(--text-primary, #1f2937)',
        background: 'var(--bg-primary, #f8f9fa)',
        padding: '24px',
        textAlign: 'center',
      }}>
        <div style={{ fontSize: '36px', marginBottom: '16px' }}>:(</div>
        <h2 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '8px' }}>
          {isZh ? '出了点问题' : 'Something went wrong'}
        </h2>
        <p style={{ fontSize: '13px', color: 'var(--text-muted, #6b7280)', marginBottom: '20px', maxWidth: '400px' }}>
          {this.state.error?.message || (isZh ? '发生了意外错误' : 'An unexpected error occurred')}
        </p>
        <button
          onClick={() => {
            this.setState({ hasError: false, error: null })
            window.location.hash = '#/'
          }}
          style={{
            padding: '8px 20px',
            fontSize: '13px',
            fontWeight: 500,
            border: 'none',
            borderRadius: '6px',
            background: 'var(--brand, #22c55e)',
            color: 'white',
            cursor: 'pointer',
          }}
        >
          {isZh ? '重新加载' : 'Reload App'}
        </button>
      </div>
    )
  }
}
