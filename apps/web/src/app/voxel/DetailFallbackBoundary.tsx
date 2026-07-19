import { Component, type ErrorInfo, type ReactNode } from "react";

interface DetailFallbackBoundaryProps {
  readonly children: ReactNode;
  readonly fallback: ReactNode;
  readonly onFallback: () => void;
  readonly resetKey: string;
}

interface DetailFallbackBoundaryState {
  readonly failed: boolean;
  readonly resetKey: string;
}

export class DetailFallbackBoundary extends Component<
  DetailFallbackBoundaryProps,
  DetailFallbackBoundaryState
> {
  state: DetailFallbackBoundaryState = {
    failed: false,
    resetKey: this.props.resetKey,
  };

  static getDerivedStateFromError(): Partial<DetailFallbackBoundaryState> {
    return { failed: true };
  }

  static getDerivedStateFromProps(
    props: DetailFallbackBoundaryProps,
    state: DetailFallbackBoundaryState,
  ): Partial<DetailFallbackBoundaryState> | null {
    return props.resetKey === state.resetKey
      ? null
      : { failed: false, resetKey: props.resetKey };
  }

  componentDidCatch(_error: Error, _info: ErrorInfo): void {
    this.props.onFallback();
  }

  render(): ReactNode {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
