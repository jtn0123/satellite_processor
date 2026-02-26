import { Component, type ReactNode } from 'react';

interface Props { children: ReactNode; }
interface State { hasError: boolean; }

export default class ImageErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State { return { hasError: true }; }

  componentDidCatch(error: Error) {
    console.error('ImageErrorBoundary caught:', error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="w-full h-full flex items-center justify-center bg-slate-900">
          <div className="text-center">
            <p className="text-white/60 text-sm">Something went wrong loading the image</p>
            <button
              onClick={() => this.setState({ hasError: false })}
              className="mt-2 px-3 py-1.5 rounded-lg bg-white/10 text-white/80 text-xs hover:bg-white/20"
            >
              Try again
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
