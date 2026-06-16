import { useEffect, useState } from 'react';
import type { ChatAgentIdentity } from './chat-utils';

interface ChatAgentAvatarProps {
    identity: ChatAgentIdentity;
    size?: 'sm' | 'md' | 'lg';
    className?: string;
}

export default function ChatAgentAvatar({
    identity,
    size = 'md',
    className = '',
}: ChatAgentAvatarProps) {
    const [imageFailed, setImageFailed] = useState(false);

    useEffect(() => {
        setImageFailed(false);
    }, [identity.avatarUrl]);

    const dim =
        size === 'sm'
            ? 'h-9 w-9 text-[11px]'
            : size === 'lg'
                ? 'h-14 w-14 text-[15px]'
                : 'h-11 w-11 text-[13px]';
    const showImage = identity.kind === 'human' && identity.avatarUrl && !imageFailed;

    if (showImage) {
        return (
            <div
                className={`${dim} shrink-0 overflow-hidden rounded-full bg-[#171717] ring-2 ring-[#F59E0B]/70 shadow-[0_8px_22px_rgba(15,23,42,0.16)] ${className}`}
                title={identity.displayName}
            >
                <img
                    src={identity.avatarUrl}
                    alt={identity.displayName}
                    className="h-full w-full object-cover"
                    onError={() => setImageFailed(true)}
                />
            </div>
        );
    }

    if (identity.kind === 'human') {
        return (
            <div
                className={`${dim} flex shrink-0 items-center justify-center rounded-full bg-[#171717] font-bold leading-none tracking-[0.02em] text-white ring-2 ring-[#F59E0B]/75 shadow-[0_8px_22px_rgba(15,23,42,0.16)] ${className}`}
                title={identity.displayName}
                aria-label={identity.displayName}
            >
                {identity.initials}
            </div>
        );
    }

    return (
        <div
            className={`${dim} flex shrink-0 items-center justify-center rounded-full bg-[#141414] font-black leading-none tracking-[-0.04em] text-white ring-2 ring-[#F97316]/65 shadow-[0_8px_22px_rgba(15,23,42,0.16)] ${className}`}
            title="AutoSPF+"
            aria-label="AutoSPF+"
        >
            <span>A</span>
            <span className="text-[#FF7A3D]">+</span>
        </div>
    );
}
