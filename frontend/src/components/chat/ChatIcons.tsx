import { CHAT_BLUE } from './chat-theme';

type IconProps = { className?: string; active?: boolean };

/** Launcher mark: white rounded chat bubble with a blue smile */
export function LauncherBubbleIcon({ className = 'h-12 w-12' }: IconProps) {
    return (
        <svg
            className={className}
            viewBox="0 0 40 40"
            fill="none"
            aria-hidden="true"
            shapeRendering="geometricPrecision"
        >
            <rect x="8" y="7.2" width="24.2" height="25.8" rx="6.2" fill="white" />
            <path
                fill="white"
                d="M27.2 29.2 34.2 34.1 30.8 26.35Z"
            />
            <path
                d="M14.6 23.1c2.9 2.25 8.75 2.25 11.7 0"
                stroke={CHAT_BLUE}
                strokeWidth="3"
                strokeLinecap="round"
                fill="none"
            />
        </svg>
    );
}

export function HomeTabIcon({ className = 'h-6 w-6', active }: IconProps) {
    const stroke = active ? CHAT_BLUE : '#9CA3AF';
    if (active) {
        return (
            <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                    d="M4.5 10.6 12 4.4l7.5 6.2v7.1a2.1 2.1 0 0 1-2.1 2.1H6.6a2.1 2.1 0 0 1-2.1-2.1v-7.1z"
                    fill={CHAT_BLUE}
                />
                <path
                    d="M8.2 14.6c1.1 1 2.4 1.5 3.8 1.5s2.7-.5 3.8-1.5"
                    stroke="white"
                    strokeWidth="1.7"
                    strokeLinecap="round"
                />
            </svg>
        );
    }

    return (
        <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
                d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-9.5z"
                stroke={stroke}
                strokeWidth="1.6"
                strokeLinejoin="round"
                fill="none"
            />
        </svg>
    );
}

export function MessagesTabIcon({ className = 'h-6 w-6', active }: IconProps) {
    const stroke = active ? CHAT_BLUE : '#9CA3AF';
    if (active) {
        return (
            <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                    d="M5 5.8h14a2.2 2.2 0 0 1 2.2 2.2v6.7a2.2 2.2 0 0 1-2.2 2.2h-7.3L7.6 20v-3.1H5A2.2 2.2 0 0 1 2.8 14.7V8A2.2 2.2 0 0 1 5 5.8z"
                    fill={CHAT_BLUE}
                />
                <path d="M8.2 10.4h7.6" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
                <path d="M8.2 13.3h5.2" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
        );
    }

    return (
        <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
                d="M5 6.5h14a2 2 0 0 1 2 2v6.5a2 2 0 0 1-2 2H11l-3.5 3v-3H5a2 2 0 0 1-2-2V8.5a2 2 0 0 1 2-2z"
                fill="none"
                stroke={stroke}
                strokeWidth="1.6"
                strokeLinejoin="round"
            />
        </svg>
    );
}

export function BotAvatarIcon({ className = 'h-5 w-5' }: IconProps) {
    return (
        <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="12" cy="8" r="3.5" fill="white" />
            <path
                d="M5 19c0-3.3 3.1-5 7-5s7 1.7 7 5"
                stroke="white"
                strokeWidth="1.8"
                strokeLinecap="round"
            />
        </svg>
    );
}

export function SendArrowIcon({ className = 'h-4 w-4' }: IconProps) {
    return (
        <svg className={className} viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path
                d="M8 13V3M8 3l-4 4M8 3l4 4"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </svg>
    );
}

export function PaperPlaneIcon({ className = 'h-4 w-4' }: IconProps) {
    return (
        <svg className={className} viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path
                d="M2.5 8.5 13 3 8.5 13.5l1.5-4.5L13 3 6.5 9 2.5 8.5z"
                fill="currentColor"
            />
        </svg>
    );
}

/** Four-arrow mark (Intercom Fin-style) */
export function BrandMarkIcon({ className = 'h-5 w-5' }: IconProps) {
    return (
        <svg className={className} viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <path
                d="M10 3.5 12.2 8.5 17.5 8.5 13.2 11.8 14.8 17 10 14 5.2 17 6.8 11.8 2.5 8.5 7.8 8.5 10 3.5z"
                fill="white"
            />
        </svg>
    );
}

export function PillChevronIcon({ className = 'h-4 w-4' }: IconProps) {
    return (
        <svg className={className} viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path
                d="M6 4l4 4-4 4"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </svg>
    );
}
