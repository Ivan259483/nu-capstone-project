import { X } from 'lucide-react';
import ChatBottomNav from './ChatBottomNav';
import { ChatInboxRow } from './ChatConversationPreview';
import { chatPillButtonClass, chatScreenHeaderClass } from './chat-theme';
import { PillChevronIcon } from './ChatIcons';

interface ChatMessagesScreenProps {
    preview: string;
    relativeTime: string;
    onClose: () => void;
    onOpenChat: () => void;
    onOpenHome: () => void;
}

export default function ChatMessagesScreen({
    preview,
    relativeTime,
    onClose,
    onOpenChat,
    onOpenHome,
}: ChatMessagesScreenProps) {
    return (
        <div className="flex min-h-0 flex-1 flex-col bg-white">
            <header className={`${chatScreenHeaderClass} py-5`}>
                <button
                    type="button"
                    onClick={onClose}
                    className="absolute right-4 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full text-[#6B7280] transition-colors hover:bg-[#F5F5F5] hover:text-[#15171C] cursor-pointer"
                    aria-label="Close chat"
                >
                    <X className="h-6 w-6" strokeWidth={2.1} />
                </button>
                <h2 className="text-center text-[21px] font-semibold tracking-[-0.01em] text-[#15171C]">
                    Messages
                </h2>
            </header>

            <div className="flex min-h-0 flex-1 flex-col">
                <ChatInboxRow preview={preview} relativeTime={relativeTime} onClick={onOpenChat} />

                <div className="flex flex-1 flex-col items-center justify-end px-6 pb-10 pt-6">
                    <p className="mb-5 max-w-[280px] text-center text-[13px] leading-relaxed text-[#9CA3AF]">
                        Pick up your AutoSPF+ conversation anytime, or start a fresh quote request.
                    </p>
                    <button type="button" onClick={onOpenChat} className={chatPillButtonClass}>
                        Ask a question
                        <PillChevronIcon className="h-4 w-4 text-white" />
                    </button>
                </div>
            </div>

            <ChatBottomNav active="messages" onHome={onOpenHome} onMessages={() => {}} />
        </div>
    );
}
