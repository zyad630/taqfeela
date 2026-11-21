import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './App.css';

// حماية المتصفح والواجهة من الانهيار المفاجئ أو الشاشة البيضاء (Crash & White-Screen Prevention)
window.addEventListener('error', (event) => {
  console.error('[Global UI Error Caught]', event.error || event.message);
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('[Global Unhandled Rejection Caught]', event.reason);
  // منع الانهيار بسبب بروميس غير ملتقط
  if (event.preventDefault) event.preventDefault();
});

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('React Error Boundary caught an error:', error, info);
    window.__lastReactError = {
      message: error?.message || String(error),
      stack: error?.stack,
      componentStack: info?.componentStack
    };
    this.setState({ error, errorInfo: info });
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          background: '#0f1117',
          color: '#fff',
          fontFamily: 'sans-serif',
          textAlign: 'center',
          padding: '20px'
        }}>
          <h1 style={{ fontSize: '28px', marginBottom: '12px' }}>⚠️ حدث خطأ غير متوقع في الشاشة</h1>
          <p style={{ marginBottom: '24px', color: '#94a3b8' }}>
            بيانات الفواتير والطاولات محفوظة بأمان ولم تتأثر. اضغط الزر بالأسفل لإعادة تحميل الشاشة والمتابعة.
          </p>
          {(this.state.error || window.__lastReactError) && (
            <div style={{
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              borderRadius: '8px',
              padding: '16px',
              maxWidth: '850px',
              width: '90%',
              marginBottom: '20px',
              textAlign: 'left',
              direction: 'ltr',
              fontFamily: 'monospace',
              fontSize: '12px',
              color: '#f87171',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              maxHeight: '260px',
              overflowY: 'auto'
            }}>
              <strong>{String(this.state.error?.message || this.state.error)}</strong>
              {'\n\n'}
              {this.state.error?.stack}
              {'\n\n'}
              {this.state.errorInfo?.componentStack}
            </div>
          )}
          <button
            onClick={this.handleReload}
            style={{
              padding: '14px 32px',
              fontSize: '16px',
              fontWeight: 'bold',
              background: '#eab308',
              color: '#000',
              border: 'none',
              borderRadius: '10px',
              cursor: 'pointer'
            }}
          >
            🔄 إعادة تحميل الشاشة
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);
