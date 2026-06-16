import { HomeTabIcon, MessagesTabIcon } from './ChatIcons';
import { CHAT_BLUE } from './chat-theme';

interface ChatBottomNavProps {
    active: 'home' | 'messages';
    onHome: () => void;
    onMessages: () => void;
}

export default function ChatBottomNav({ active, onHome, onMessages }: ChatBottomNavProps) {
    return (
        <nav className="flex shrink-0 border-t !border-gray-200 bg-white shadow-[0_-1px_0_rgba(15,23,42,0.02)]">
            <button
                type="button"
                onClick={onHome}
                className="flex flex-1 flex-col items-center gap-1.5 py-3 transition-colors cursor-pointer"
                aria-current={active === 'home' ? 'page' : undefined}
            >
                <HomeTabIcon active={active === 'home'} className="h-6 w-6" />
                <span
                    className="text-[12px] font-semibold leading-none"
                    style={{ color: active === 'home' ? CHAT_BLUE : '#6B7280' }}
                >
                    Home
                </span>
            </button>
            <button
                type="button"
                onClick={onMessages}
                className="flex flex-1 flex-col items-center gap-1.5 py-3 transition-colors cursor-pointer"
                aria-current={active === 'messages' ? 'page' : undefined}
            >
                <MessagesTabIcon active={active === 'messages'} className="h-6 w-6" />
                <span
                    className="text-[12px] font-medium leading-none"
                    style={{ color: active === 'messages' ? CHAT_BLUE : '#6B7280' }}
                >
                    Messages
                </span>
            </button>
        </nav>
    );
}
