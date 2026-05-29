import { X } from 'lucide-react';
import ChatBottomNav from './ChatBottomNav';
import ChatBrandAvatar from './ChatBrandAvatar';
import { chatCardClass, CHAT_BLUE } from './chat-theme';
import { PaperPlaneIcon } from './ChatIcons';

interface ChatHomeScreenProps {
    preview: string;
    relativeTime: string;
    hasRecentThread: boolean;
    currentUserName?: string;
    onClose: () => void;
    onOpenRecent: () => void;
    onAskQuestion: () => void;
    onOpenMessages: () => void;
}

export default function ChatHomeScreen({
    preview,
    relativeTime,
    currentUserName,
    onClose,
    hasRecentThread,
    onOpenRecent,
    onAskQuestion,
    onOpenMessages,
}: ChatHomeScreenProps) {
    const previewText = preview.trim() || (hasRecentThread ? 'Tap to continue' : 'We typically reply in minutes');
    const avatarLabel = currentUserName ? currentUserName.charAt(0).toUpperCase() : null;

    return (
        <div className="flex min-h-0 flex-1 flex-col bg-white">
            <div
                className="relative shrink-0 overflow-hidden bg-black px-8 pt-8"
                style={{ paddingBottom: 'clamp(58px, 9dvh, 74px)' }}
            >
                <div
                    className="pointer-events-none absolute inset-x-0 bottom-0 h-40"
                    style={{
                        background:
                            'linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.72) 35%, rgba(255,255,255,0.96) 100%)',
                    }}
                />
                <div className="relative z-10 flex min-h-12 items-start justify-between gap-4">
                    <img
                        src="/images/autospf-logo.png"
                        alt="AutoSPF+"
                        className="h-10 w-[94px] object-contain object-left drop-shadow-[0_8px_18px_rgba(0,0,0,0.35)]"
                    />
                    <div className="flex items-center gap-4">
                        {avatarLabel ? (
                            <div
                                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#1DA1FF] text-[14px] font-semibold text-white ring-2 ring-white/10"
                                title={currentUserName}
                            >
                                {avatarLabel}
                            </div>
                        ) : (
                            <div
                                className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#21A8FF] text-[15px] font-black tracking-[-0.04em] text-white ring-2 ring-white/10"
                                aria-hidden="true"
                            >
                                <span>A</span>
                                <span className="text-[#FFB454]">+</span>
                                <span className="absolute bottom-0.5 right-0.5 h-3 w-3 rounded-full border-2 border-black bg-[#FFCA3A]" />
                            </div>
                        )}
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white transition-colors hover:bg-white/10 cursor-pointer"
                            aria-label="Close chat"
                        >
                            <X className="h-6 w-6" strokeWidth={1.85} />
                        </button>
                    </div>
                </div>
                <div
                    className="relative z-10"
                    style={{ marginTop: 'clamp(44px, 7dvh, 56px)' }}
                >
                    <h2 className="text-[28px] font-semibold leading-[1.12] text-white sm:text-[30px]">
                        Hi there 👋
                    </h2>
                    <p className="mt-1 text-[28px] font-semibold leading-[1.12] text-white sm:text-[30px]">
                        How can we help?
                    </p>
                </div>
            </div>

            <div className="relative z-20 flex min-h-0 flex-1 flex-col overflow-visible bg-white px-5 pb-6">
                <div className="-mt-[54px] flex flex-col gap-4">
                    <button
                        type="button"
                        onClick={onOpenRecent}
                        disabled={!hasRecentThread}
                        className={`${chatCardClass} min-h-[120px] w-full px-5 py-5 disabled:opacity-60`}
                    >
                        <p className="text-[16px] font-semibold leading-none text-[#15171C] sm:text-[17px]">
                            Recent message
                        </p>
                        <div className="mt-5 flex items-center gap-3.5">
                            <ChatBrandAvatar size="lg" />
                            <div className="min-w-0 flex-1">
                                <div className="flex items-center justify-between gap-3">
                                    <p className="truncate text-[17px] font-semibold leading-none text-[#15171C] sm:text-[18px]">
                                        AutoSPF+
                                    </p>
                                    <span className="shrink-0 text-[16px] font-normal tabular-nums text-[#6B7280] sm:text-[17px]">
                                        {relativeTime}
                                    </span>
                                </div>
                                <p className="mt-2.5 truncate text-[16px] leading-none text-[#6B7280] sm:text-[17px]">
                                    {previewText}
                                </p>
                            </div>
                        </div>
                    </button>

                    <button
                        type="button"
                        onClick={onAskQuestion}
                        className={`${chatCardClass} flex min-h-[74px] w-full items-center justify-between gap-4 px-5 py-4`}
                    >
                        <span className="text-[17px] font-semibold text-[#15171C]">Ask a question</span>
                        <span className="shrink-0" style={{ color: CHAT_BLUE }}>
                            <PaperPlaneIcon className="h-5 w-5" />
                        </span>
                    </button>
                </div>
                <div className="min-h-[96px] flex-1" aria-hidden="true" />
            </div>

            <ChatBottomNav active="home" onHome={() => {}} onMessages={onOpenMessages} />
        </div>
    );
}
