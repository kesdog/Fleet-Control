import { Component, type ErrorInfo, type ReactNode } from 'react'
import i18n from '../i18n'

type ErrorBoundaryProps = { children: ReactNode }
type ErrorBoundaryState = { hasError: boolean }

// Wrap the application root with this boundary to show a safe recovery message for render errors.
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false }

  static getDerivedStateFromError(): ErrorBoundaryState { return { hasError: true } }

  componentDidCatch(_error: Error, _errorInfo: ErrorInfo) {
    // Error reporting can be connected here later without exposing diagnostics to operators.
  }

  render() {
    if (this.state.hasError) return <main className="error-screen"><section className="error-card" aria-live="assertive"><p className="eyebrow">{i18n.t('app.name')}</p><h1>{i18n.t('errors.title')}</h1><p>{i18n.t('errors.description')}</p></section></main>
    return this.props.children
  }
}
