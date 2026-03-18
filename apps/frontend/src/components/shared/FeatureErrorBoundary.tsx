import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
}

export class FeatureErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Feature error boundary caught:', error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="flex flex-col items-center justify-center rounded-lg border border-destructive/20 bg-destructive/5 p-8 text-center">
          <AlertCircle className="mb-3 size-8 text-destructive" />
          <h3 className="text-base font-semibold text-foreground">
            This section encountered an error
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Something went wrong loading this section. Please try again.
          </p>
          <Button
            variant="outline"
            size="sm"
            className="mt-4"
            onClick={this.handleRetry}
          >
            <RefreshCw className="size-3.5" />
            Retry
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}
