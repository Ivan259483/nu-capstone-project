import ChatAgentAvatar from './ChatAgentAvatar';
import { getRecentSenderLabel, type ChatAgentIdentity } from './chat-utils';

interface ChatConversationPreviewProps {
    preview: string;
    relativeTime: string;
    agent: ChatAgentIdentity;
    onClick?: () => void;
    as?: 'button' | 'div';
    className?: string;
}

/** Shared inbox row: name + time on one line, preview below */
export default function ChatConversationPreview({
    preview,
    relativeTime,
    agent,
    onClick,
    as = 'button',
    className = '',
}: ChatConversationPreviewProps) {
    const displayName = getRecentSenderLabel(agent);
    const showPreview = preview.trim().length > 0;

    const content = (
        <>
            <ChatAgentAvatar identity={agent} size="md" />
            <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2.5">
                    <p className="truncate text-[15px] font-semibold leading-tight text-[#15171C]">
                        {displayName}
                    </p>
                    <span className="shrink-0 text-[12px] font-medium tabular-nums text-[#9CA3AF]">
                        {relativeTime}
                    </span>
                </div>
                {showPreview && (
                    <p className="mt-1 truncate text-[13px] leading-tight text-[#6B7280]">{preview}</p>
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
    agent,
    onClick,
}: Pick<ChatConversationPreviewProps, 'preview' | 'relativeTime' | 'agent' | 'onClick'>) {
    return (
        <ChatConversationPreview
            preview={preview}
            relativeTime={relativeTime}
            agent={agent}
            onClick={onClick}
            className="cursor-pointer border-b !border-gray-100 px-4 py-3 transition-colors hover:bg-[#FAFAFA]"
        />
    );
}
