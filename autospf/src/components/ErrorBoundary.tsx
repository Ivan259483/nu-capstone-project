import React, { Component, ErrorInfo, ReactNode } from "react";
import { AlertTriangle, Home, RefreshCcw } from "lucide-react";
import { Button } from "./ui/button";

interface Props {
    children?: ReactNode;
}

interface State {
    hasError: boolean;
    error?: Error;
}

class ErrorBoundary extends Component<Props, State> {
    public state: State = {
        hasError: false
    };

    public static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error("Uncaught error:", error, errorInfo);
    }

    private handleRefresh = () => {
        this.setState({ hasError: false, error: undefined });
        window.location.reload();
    };

    private handleGoHome = () => {
        this.setState({ hasError: false, error: undefined });
        window.location.href = '/';
    };

    public render() {
        if (this.state.hasError) {
            return (
                <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-6 text-center">
                    <div className="w-20 h-20 bg-red-900/20 rounded-full flex items-center justify-center mb-6 border border-red-500/20">
                        <AlertTriangle className="w-10 h-10 text-red-500" />
                    </div>
                    <h1 className="text-2xl font-bold text-white mb-2">Something went wrong</h1>
                    <p className="text-zinc-400 max-w-md mb-8">
                        We&apos;ve encountered an unexpected error. This has been logged and we&apos;ll look into it.
                        In the meantime, you can try refreshing the page.
                    </p>
                    <div className="flex gap-4">
                        <Button
                            onClick={this.handleRefresh}
                            className="bg-orange-600 hover:bg-orange-500 text-white flex items-center gap-2"
                        >
                            <RefreshCcw className="w-4 h-4" />
                            Refresh Page
                        </Button>
                        <Button
                            variant="outline"
                            onClick={this.handleGoHome}
                            className="border-zinc-800 text-zinc-300 hover:bg-zinc-800 hover:text-white flex items-center gap-2"
                        >
                            <Home className="w-4 h-4" />
                            Go to Login
                        </Button>
                    </div>
                    {process.env.NODE_ENV === 'development' && this.state.error && (
                        <div className="mt-8 p-4 bg-zinc-900 rounded-lg border border-zinc-800 text-left w-full max-w-2xl overflow-auto max-h-40">
                            <p className="text-red-400 font-mono text-xs">{this.state.error.toString()}</p>
                        </div>
                    )}
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;