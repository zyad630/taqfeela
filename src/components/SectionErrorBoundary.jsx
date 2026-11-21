import React from 'react';



// صمام أمان محلي: يعزل أي أخطاء في واجهات التقارير أو الإعدادات لمنع انهيار شاشة الكاشير والبيع
export default class SectionErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, info) {
    console.error(`[SectionErrorBoundary:${this.props.name || 'Component'}] caught error:`, error, info);
  }
  handleReset = () => {
    this.setState({ hasError: false, error: null });
    if (typeof this.props.onReset === 'function') {
      this.props.onReset();
    }
  };
  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          padding: '24px',
          margin: '20px',
          background: 'rgba(239, 68, 68, 0.08)',
          border: '1.5px dashed rgba(239, 68, 68, 0.4)',
          borderRadius: '12px',
          color: '#f87171',
          textAlign: 'center',
          direction: 'rtl'
        }}>
          <h3 style={{ margin: '0 0 8px 0', fontSize: '18px' }}>⚠️ حدث خطأ غير متوقع أثناء عرض {this.props.name || 'هذا القسم'}</h3>
          <p style={{ margin: '0 0 16px 0', color: '#94a3b8', fontSize: '14px' }}>
            شاشة الكاشير ونظام حفظ الفواتير والطاولات يعمل بأمان تام وبدون أي تأثر.
          </p>
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
            <button
              type="button"
              onClick={this.handleReset}
              style={{
                padding: '8px 20px',
                background: '#eab308',
                color: '#000',
                border: 'none',
                borderRadius: '8px',
                fontWeight: 'bold',
                cursor: 'pointer'
              }}
            >
              🔄 إعادة المحاولة
            </button>
            {this.props.onFallback && (
              <button
                type="button"
                onClick={this.props.onFallback}
                style={{
                  padding: '8px 20px',
                  background: '#334155',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer'
                }}
              >
                العودة لنقطة البيع (POS)
              </button>
            )}
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
