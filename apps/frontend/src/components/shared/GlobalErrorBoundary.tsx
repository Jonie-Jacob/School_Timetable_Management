import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export class GlobalErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Global error boundary caught:', error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false });
  };

  handleGoHome = () => {
    window.location.href = '/';
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-background p-4">
          <div className="flex max-w-md flex-col items-center text-center">
            <div className="mb-6 rounded-full bg-destructive/10 p-4">
              <AlertTriangle className="size-10 text-destructive" />
            </div>
            <h1 className="text-2xl font-bold text-foreground">
              Something went wrong
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              An unexpected error occurred. Please try refreshing the page or
              navigating back to the dashboard.
            </p>
            <div className="mt-6 flex gap-3">
              <Button variant="outline" onClick={this.handleRetry}>
                <RefreshCw className="size-4" />
                Retry
              </Button>
              <Button onClick={this.handleGoHome}>
                <Home className="size-4" />
                Go Home
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
