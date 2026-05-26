import ChatBrandAvatar from './ChatBrandAvatar';
import { CHAT_ASSISTANT_NAME, CHAT_INBOX_NAME } from './chat-theme';

interface ChatConversationPreviewProps {
    preview: string;
    relativeTime: string;
    onClick?: () => void;
    as?: 'button' | 'div';
    className?: string;
    /** Inbox uses short name; cards use full assistant name */
    variant?: 'inbox' | 'card';
}

/** Shared inbox row: name + time on one line, preview below */
export default function ChatConversationPreview({
    preview,
    relativeTime,
    onClick,
    as = 'button',
    className = '',
    variant = 'inbox',
}: ChatConversationPreviewProps) {
    const displayName = variant === 'inbox' ? CHAT_INBOX_NAME : CHAT_ASSISTANT_NAME;
    const showPreview = preview.trim().length > 0;

    const content = (
        <>
            <ChatBrandAvatar size={variant === 'inbox' ? 'lg' : 'md'} />
            <div className="min-w-0 flex-1 pt-px">
                <div className="flex items-center justify-between gap-3">
                    <p className="truncate text-[17px] font-semibold leading-none text-[#15171C]">
                        {displayName}
                    </p>
                    <span className="shrink-0 text-[15px] font-normal tabular-nums text-[#6B7280]">
                        {relativeTime}
                    </span>
                </div>
                {showPreview && (
                    <p className="mt-2 truncate text-[16px] leading-none text-[#6B7280]">{preview}</p>
                )}
            </div>
        </>
    );

    if (as === 'div') {
        return <div className={`flex items-center gap-3 ${className}`}>{content}</div>;
    }

    return (
        <button
            type="button"
            onClick={onClick}
            className={`flex w-full items-center gap-3 text-left ${className}`}
        >
            {content}
        </button>
    );
}

export function ChatInboxRow({
    preview,
    relativeTime,
    onClick,
}: Pick<ChatConversationPreviewProps, 'preview' | 'relativeTime' | 'onClick'>) {
    return (
        <ChatConversationPreview
            variant="inbox"
            preview={preview}
            relativeTime={relativeTime}
            onClick={onClick}
            className="cursor-pointer border-b !border-gray-200 px-6 py-5 transition-colors hover:bg-[#FAFAFA]"
        />
    );
}
