// frontend/src/components/ErrorBoundary.tsx
import React from 'react';

interface State { hasError: boolean; error: Error | null; }

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 40, fontFamily: 'monospace', background: '#fff', minHeight: '100vh' }}>
          <h2 style={{ color: '#8a1a1a' }}>⚠️ Chyba při renderování</h2>
          <pre style={{ background: '#f4f4f4', padding: 16, borderRadius: 8, overflow: 'auto', fontSize: 12 }}>
            {this.state.error?.toString()}
            {'\n'}
            {this.state.error?.stack}
          </pre>
          <button onClick={() => window.location.reload()} style={{ marginTop: 16, padding: '8px 16px', cursor: 'pointer' }}>
            🔄 Obnovit stránku
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}