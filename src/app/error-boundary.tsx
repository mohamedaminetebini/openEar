import { Component, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';

export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed)
      return (
        <main className="fatal-error">
          <h1>The application could not render</h1>
          <p>Reload to recover. Saved profiles remain saved on this computer.</p>
          <Button onClick={() => location.reload()}>Reload application</Button>
        </main>
      );
    return this.props.children;
  }
}
