import { lazy, Suspense, useEffect, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import Navbar from "@/components/Navbar";
import Home from "@/pages/Home";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { chatLauncherClass } from "@/components/chat/chat-theme";

const About = lazy(() => import("@/pages/About"));
const Contact = lazy(() => import("@/pages/Contact"));
const Gallery = lazy(() => import("@/pages/Gallery"));
const Services = lazy(() => import("@/pages/Services"));
const ChatWidget = lazy(() => import("@/components/ChatWidget"));
const AuthenticatedApp = lazy(() => import("./AuthenticatedApp"));

const PUBLIC_ROUTE_RE = /^\/(?:$|about\/?$|contact\/?$|gallery\/?$|services\/?$)/;
const AUTH_HINT_KEYS = ["autospf_token", "autospf_session_cache", "autospf_backend_user"];

function hasLocalAuthHint() {
    try {
        return AUTH_HINT_KEYS.some((key) => Boolean(localStorage.getItem(key)));
    } catch {
        return false;
    }
}

function PublicRouteFallback() {
    return <div className="min-h-screen bg-[#07070A]" aria-hidden />;
}

function ChatLauncher({ onClick }: { onClick: () => void }) {
    return (
        <div className="fixed bottom-3 right-3 left-3 z-[60] flex flex-col items-end gap-3 sm:left-auto sm:bottom-4 sm:right-6">
            <button
                type="button"
                onClick={onClick}
                className={chatLauncherClass}
                aria-label="Open chat"
            >
                <svg aria-hidden="true" viewBox="0 0 24 24" className="h-7 w-7 fill-none stroke-current" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />
                    <path d="M8 10h.01M12 10h.01M16 10h.01" />
                </svg>
            </button>
        </div>
    );
}

function DeferredPublicChat() {
    const [requested, setRequested] = useState(false);

    if (!requested) return <ChatLauncher onClick={() => setRequested(true)} />;

    return (
        <Suspense fallback={<ChatLauncher onClick={() => undefined} />}>
            <ChatWidget initialOpen />
        </Suspense>
    );
}

function PublicApp() {
    return (
        <LanguageProvider>
            <Navbar />
            <Suspense fallback={<PublicRouteFallback />}>
                <Routes>
                    <Route path="/" element={<Home />} />
                    <Route path="/about" element={<About />} />
                    <Route path="/contact" element={<Contact />} />
                    <Route path="/gallery" element={<Gallery />} />
                    <Route path="/services" element={<Services />} />
                    <Route path="*" element={<Navigate to="/login" replace />} />
                </Routes>
            </Suspense>
            <DeferredPublicChat />
        </LanguageProvider>
    );
}

function AppSelector() {
    const { pathname } = useLocation();
    const [authHint, setAuthHint] = useState(hasLocalAuthHint);

    useEffect(() => {
        setAuthHint(hasLocalAuthHint());
    }, [pathname]);

    if (PUBLIC_ROUTE_RE.test(pathname) && !authHint) return <PublicApp />;

    return (
        <Suspense fallback={<PublicRouteFallback />}>
            <AuthenticatedApp />
        </Suspense>
    );
}

export default function App() {
    return (
        <BrowserRouter>
            <AppSelector />
        </BrowserRouter>
    );
}
