import { X } from 'lucide-react';
import ChatBottomNav from './ChatBottomNav';
import ChatAgentAvatar from './ChatAgentAvatar';
import { chatCardClass, CHAT_BLUE } from './chat-theme';
import { PaperPlaneIcon } from './ChatIcons';
import type { ChatAgentIdentity } from './chat-utils';

interface ChatHomeScreenProps {
    recentAgent: ChatAgentIdentity;
    onClose: () => void;
    onAskQuestion: () => void;
    onOpenMessages: () => void;
}

export default function ChatHomeScreen({
    recentAgent,
    onClose,
    onAskQuestion,
    onOpenMessages,
}: ChatHomeScreenProps) {
    return (
        <div className="flex min-h-0 flex-1 flex-col bg-white">
            <div
                className="relative shrink-0 overflow-hidden bg-black px-6 pt-6"
                style={{ paddingBottom: 'clamp(46px, 7dvh, 58px)' }}
            >
                <div
                    className="pointer-events-none absolute inset-x-0 bottom-0 h-32"
                    style={{
                        background:
                            'linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.72) 35%, rgba(255,255,255,0.96) 100%)',
                    }}
                />
                <div className="relative z-10 flex min-h-12 items-start justify-between gap-4">
                    <img
                        src="/images/autospf-logo.png"
                        alt="AutoSPF+"
                        className="h-9 w-[86px] object-contain object-left drop-shadow-[0_8px_18px_rgba(0,0,0,0.35)]"
                    />
                    <div className="flex items-center gap-3">
                        <ChatAgentAvatar identity={recentAgent} size="md" />
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white transition-colors hover:bg-white/10 cursor-pointer"
                            aria-label="Close chat"
                        >
                            <X className="h-5 w-5" strokeWidth={1.85} />
                        </button>
                    </div>
                </div>
                <div
                    className="relative z-10"
                    style={{ marginTop: 'clamp(36px, 6dvh, 46px)' }}
                >
                    <h2 className="text-[25px] font-semibold leading-[1.12] text-white sm:text-[27px]">
                        Hi there 👋
                    </h2>
                    <p className="mt-1 text-[25px] font-semibold leading-[1.12] text-white sm:text-[27px]">
                        How can we help?
                    </p>
                </div>
            </div>

            <div className="relative z-20 flex min-h-0 flex-1 flex-col overflow-visible bg-white px-4 pb-5">
                <div className="-mt-9 flex flex-col gap-3">
                    <button
                        type="button"
                        onClick={onAskQuestion}
                        className={`${chatCardClass} flex min-h-[64px] w-full items-center justify-between gap-4 px-4 py-3.5`}
                    >
                        <span className="text-[15px] font-semibold text-[#15171C]">Ask a question</span>
                        <span className="shrink-0" style={{ color: CHAT_BLUE }}>
                            <PaperPlaneIcon className="h-5 w-5" />
                        </span>
                    </button>
                </div>
                <div className="min-h-[64px] flex-1" aria-hidden="true" />
            </div>

            <ChatBottomNav active="home" onHome={() => {}} onMessages={onOpenMessages} />
        </div>
    );
}
