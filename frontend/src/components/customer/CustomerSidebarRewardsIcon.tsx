import { useId } from 'react';
import { cn } from '@/lib/utils';
import { useCustomerSidebarItemHover } from '@/components/customer/useCustomerSidebarItemHover';

const STAR_PATH =
    'M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z';

type Props = {
    className?: string;
    size?: number;
};

/** Rewards — premium star with orbiting points, shimmer, and soft fill on hover. */
export function CustomerSidebarRewardsIcon({ className, size = 20 }: Props) {
    const { ref, hovered } = useCustomerSidebarItemHover<HTMLSpanElement>();
    const clipId = useId().replace(/:/g, '');
    const fillId = useId().replace(/:/g, '');

    return (
        <span
            ref={ref}
            className={cn(
                'customer-sidebar-icon customer-sidebar-icon--rewards',
                hovered && 'is-rewards-active',
                className
            )}
            aria-hidden
        >
            <svg
                className="customer-sidebar-icon-svg customer-sidebar-rewards-svg"
                width={size}
                height={size}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
            >
                <defs>
                    <clipPath id={clipId}>
                        <path d={STAR_PATH} />
                    </clipPath>
                    <linearGradient id={fillId} x1="6" y1="4" x2="19" y2="21" gradientUnits="userSpaceOnUse">
                        <stop offset="0%" stopColor="currentColor" stopOpacity="0.26" />
                        <stop offset="58%" stopColor="currentColor" stopOpacity="0.12" />
                        <stop offset="100%" stopColor="currentColor" stopOpacity="0.04" />
                    </linearGradient>
                </defs>

                <g className={cn('customer-sidebar-rewards-orbit', hovered && 'is-active')}>
                    <circle className="customer-sidebar-rewards-orbit-ring" cx="12" cy="12" r="9.25" />
                    <circle className="customer-sidebar-rewards-orbit-dot customer-sidebar-rewards-orbit-dot--1" cx="12" cy="2.75" r="0.9" />
                    <circle className="customer-sidebar-rewards-orbit-dot customer-sidebar-rewards-orbit-dot--2" cx="21.25" cy="12" r="0.72" />
                    <circle className="customer-sidebar-rewards-orbit-dot customer-sidebar-rewards-orbit-dot--3" cx="5.45" cy="18.55" r="0.62" />
                </g>

                <g
                    className={cn('customer-sidebar-rewards-star', hovered && 'is-active')}
                    style={{ transformOrigin: '12px 12px' }}
                >
                    <path className="customer-sidebar-rewards-glow" d={STAR_PATH} />
                    <path className="customer-sidebar-rewards-core" d={STAR_PATH} fill={`url(#${fillId})`} />
                    <path
                        className="customer-sidebar-rewards-inner"
                        d="M12 7.25l1.18 2.42 2.68.39-1.94 1.88.46 2.66L12 13.35 9.62 14.6l.46-2.66-1.94-1.88 2.68-.39z"
                    />
                    <g clipPath={`url(#${clipId})`}>
                        <rect
                            className={cn('customer-sidebar-rewards-shine', hovered && 'is-active')}
                            x="-5"
                            y="2"
                            width="6"
                            height="22"
                            fill="currentColor"
                            stroke="none"
                        />
                    </g>
                </g>

                <g className={cn('customer-sidebar-rewards-sparkles', hovered && 'is-active')}>
                    <path
                        className="customer-sidebar-rewards-sparkle customer-sidebar-rewards-sparkle--1"
                        d="M20 3.65l.35.9.9.35-.9.35-.35.9-.35-.9-.9-.35.9-.35z"
                    />
                    <path
                        className="customer-sidebar-rewards-sparkle customer-sidebar-rewards-sparkle--2"
                        d="M4.15 4.85l.28.72.72.28-.72.28-.28.72-.28-.72-.72-.28.72-.28z"
                    />
                    <path
                        className="customer-sidebar-rewards-sparkle customer-sidebar-rewards-sparkle--3"
                        d="M19.05 19.05l.28.72.72.28-.72.28-.28.72-.28-.72-.72-.28.72-.28z"
                    />
                </g>
            </svg>
        </span>
    );
}
