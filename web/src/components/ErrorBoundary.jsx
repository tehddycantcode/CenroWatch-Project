import { Component } from 'react';

// App-wide safety net. If any screen throws during render, show a friendly
// message instead of unmounting the whole React tree to a blank white page.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Surface it in the console for debugging; never swallow it silently.
    console.error('UI crash caught by ErrorBoundary:', error, info);
  }

  reset = () => this.setState({ error: null });

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background p-6 text-center">
          <h1 className="font-display text-2xl text-foreground">Something went wrong</h1>
          <p className="max-w-md text-sm text-muted-foreground">
            This page hit an unexpected error. Try again, or go back to the homepage.
          </p>
          <div className="flex gap-3">
            <button
              onClick={this.reset}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-soft hover:shadow-soft-md"
            >
              Try again
            </button>
            <a href="/" className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-accent">
              Go home
            </a>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
