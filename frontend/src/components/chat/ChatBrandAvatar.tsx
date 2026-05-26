interface ChatBrandAvatarProps {
    size?: 'sm' | 'md' | 'lg';
}

export default function ChatBrandAvatar({ size = 'md' }: ChatBrandAvatarProps) {
    const dim =
        size === 'sm'
            ? 'h-9 w-9 rounded-[10px] text-[13px]'
            : size === 'lg'
                ? 'h-14 w-14 rounded-[15px] text-[18px]'
                : 'h-11 w-11 rounded-[12px] text-[15px]';

    return (
        <div
            className={`${dim} flex shrink-0 items-center justify-center bg-[#141414] font-black leading-none tracking-[-0.04em] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]`}
            aria-hidden="true"
        >
            <span className="text-white">A</span>
            <span className="text-[#FF6B35]">+</span>
        </div>
    );
}
