import { useId } from 'react';
import { cn } from '@/lib/utils';
import { useCustomerSidebarItemHover } from '@/components/customer/useCustomerSidebarItemHover';

const TAG_PATH =
    'M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z';

type Props = {
    className?: string;
    size?: number;
};

/** Services price tag — premium swing, shimmer, fold detail & catalog lines on hover. */
export function CustomerSidebarServicesIcon({ className, size = 20 }: Props) {
    const { ref, hovered } = useCustomerSidebarItemHover<HTMLSpanElement>();
    const clipId = useId().replace(/:/g, '');
    const gradId = useId().replace(/:/g, '');

    return (
        <span
            ref={ref}
            className={cn(
                'customer-sidebar-icon customer-sidebar-icon--services',
                hovered && 'is-services-active',
                className
            )}
            aria-hidden
        >
            <svg
                className="customer-sidebar-icon-svg customer-sidebar-services-svg"
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
                        <path d={TAG_PATH} />
                    </clipPath>
                    <linearGradient id={gradId} x1="4" y1="2" x2="22" y2="22" gradientUnits="userSpaceOnUse">
                        <stop offset="0%" stopColor="currentColor" stopOpacity="0.18" />
                        <stop offset="55%" stopColor="currentColor" stopOpacity="0.08" />
                        <stop offset="100%" stopColor="currentColor" stopOpacity="0.03" />
                    </linearGradient>
                </defs>

                <g
                    className={cn('customer-sidebar-services-tag', hovered && 'is-active')}
                    style={{ transformOrigin: '8px 8px' }}
                >
                    <path
                        className="customer-sidebar-services-body"
                        d={TAG_PATH}
                        strokeWidth={2.25}
                        fill={`url(#${gradId})`}
                    />
                    <path
                        className="customer-sidebar-services-fold"
                        d="M18.8 18.2 22.2 22.2 18.8 22.2Z"
                        strokeWidth={1.5}
                    />
                    <circle
                        className="customer-sidebar-services-ring"
                        cx="7.5"
                        cy="7.5"
                        r="2.35"
                        strokeWidth={1.25}
                    />
                    <circle
                        className="customer-sidebar-services-hole"
                        cx="7.5"
                        cy="7.5"
                        r="1.1"
                        strokeWidth={1}
                    />
                    <path
                        className="customer-sidebar-services-string"
                        d="M7.5 6.2V3.8M6.1 4.1l1.4-.9"
                        strokeWidth={1.35}
                    />
                    <g clipPath={`url(#${clipId})`}>
                        <rect
                            className={cn('customer-sidebar-services-shine', hovered && 'is-active')}
                            x="-2"
                            y="2"
                            width="6"
                            height="22"
                            fill="currentColor"
                            stroke="none"
                        />
                    </g>
                    <path
                        className="customer-sidebar-services-sparkle"
                        d="M20.2 5.2 20.55 6.1 21.45 6.45 20.55 6.8 20.2 7.7 19.85 6.8 19 6.45 19.85 6.1Z"
                        strokeWidth={1.25}
                    />
                    <line
                        className="customer-sidebar-services-line customer-sidebar-services-line--1"
                        x1="9"
                        y1="12"
                        x2="14.5"
                        y2="12"
                        strokeWidth={1.85}
                    />
                    <line
                        className="customer-sidebar-services-line customer-sidebar-services-line--2"
                        x1="9.5"
                        y1="14.5"
                        x2="13.5"
                        y2="14.5"
                        strokeWidth={1.85}
                    />
                    <line
                        className="customer-sidebar-services-line customer-sidebar-services-line--3"
                        x1="10"
                        y1="17"
                        x2="12.5"
                        y2="17"
                        strokeWidth={1.85}
                    />
                </g>
            </svg>
        </span>
    );
}
