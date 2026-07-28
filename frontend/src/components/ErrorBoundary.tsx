import React from 'react';
import { useTranslation } from 'react-i18next';

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

const ErrorFallback: React.FC<{ error: Error | null }> = ({ error }) => {
  const { t } = useTranslation();

  return (
    <div className="min-h-screen flex items-center justify-center bg-white p-6">
      <div className="max-w-2xl w-full rounded-3xl border border-red-200 bg-red-50 p-8 shadow-lg">
        <h1 className="text-3xl font-bold text-red-700 mb-4">{t('errors.somethingWentWrong')}</h1>
        <p className="text-sm text-red-600 mb-6">{t('errors.renderError')}</p>
        <pre className="whitespace-pre-wrap text-xs text-red-800 bg-white border border-red-100 rounded-lg p-4 overflow-x-auto">
          {error?.message}
        </pre>
      </div>
    </div>
  );
};

export class ErrorBoundary extends React.Component<{
  children: React.ReactNode;
}, ErrorBoundaryState> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary caught error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return <ErrorFallback error={this.state.error} />;
    }

    return this.props.children;
  }
}
