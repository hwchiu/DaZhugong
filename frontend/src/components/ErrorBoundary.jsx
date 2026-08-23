import { Component } from 'react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
    this.resetErrorBoundary = this.resetErrorBoundary.bind(this);
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  resetErrorBoundary() {
    this.setState({ error: null });
  }

  componentDidCatch() {}

  render() {
    const { error } = this.state;
    const { children, fallback = null, fallbackRender = null } = this.props;

    if (error) {
      if (typeof fallbackRender === 'function') {
        return fallbackRender({
          error,
          resetErrorBoundary: this.resetErrorBoundary,
        });
      }

      return fallback;
    }

    return children;
  }
}
