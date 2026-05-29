import { X } from 'lucide-react';
import ChatBottomNav from './ChatBottomNav';
import ChatConversationPreview from './ChatConversationPreview';
import { chatPillButtonClass, chatScreenHeaderClass } from './chat-theme';
import { PillChevronIcon } from './ChatIcons';
import {
    formatRelativeTime,
    getThreadPreview,
    type ChatConversationThread,
    type RegistrationStep,
} from './chat-utils';

interface ChatMessagesScreenProps {
    conversations: ChatConversationThread[];
    registrationStep: RegistrationStep;
    onClose: () => void;
    onSelectConversation: (conversationId: string) => void;
    onAskQuestion: () => void;
    onOpenHome: () => void;
}

export default function ChatMessagesScreen({
    conversations,
    registrationStep,
    onClose,
    onSelectConversation,
    onAskQuestion,
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

            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
                {conversations.length > 0 ? (
                    <div className="shrink-0">
                        {conversations.map((thread) => (
                            <ChatConversationPreview
                                key={thread.conversationId}
                                variant="inbox"
                                preview={getThreadPreview(thread, registrationStep)}
                                relativeTime={formatRelativeTime(thread.lastMessageAt)}
                                onClick={() => onSelectConversation(thread.conversationId)}
                                className="cursor-pointer border-b !border-gray-200 px-6 py-5 transition-colors hover:bg-[#FAFAFA]"
                            />
                        ))}
                    </div>
                ) : (
                    <div className="flex flex-1 flex-col items-center justify-center px-6 py-10">
                        <p className="max-w-[280px] text-center text-[14px] leading-relaxed text-[#9CA3AF]">
                            No conversations yet. Start a fresh thread with AutoSPF+ Concierge.
                        </p>
                    </div>
                )}

                <div className="mt-auto flex flex-col items-center px-6 pb-10 pt-6">
                    <p className="mb-5 max-w-[280px] text-center text-[13px] leading-relaxed text-[#9CA3AF]">
                        Each question opens a new support thread so your context stays clean and focused.
                    </p>
                    <button type="button" onClick={onAskQuestion} className={chatPillButtonClass}>
                        Ask a question
                        <PillChevronIcon className="h-4 w-4 text-white" />
                    </button>
                </div>
            </div>

            <ChatBottomNav active="messages" onHome={onOpenHome} onMessages={() => {}} />
        </div>
    );
}
