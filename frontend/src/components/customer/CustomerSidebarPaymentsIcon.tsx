import { useId } from 'react';
import { cn } from '@/lib/utils';
import { useCustomerSidebarItemHover } from '@/components/customer/useCustomerSidebarItemHover';

type Props = {
    className?: string;
    size?: number;
};

/** Payment History — monochrome card stack, chip reveal, scan, and history flow on hover. */
export function CustomerSidebarPaymentsIcon({ className, size = 20 }: Props) {
    const { ref, hovered } = useCustomerSidebarItemHover<HTMLSpanElement>();
    const clipId = useId().replace(/:/g, '');

    return (
        <span
            ref={ref}
            className={cn(
                'customer-sidebar-icon customer-sidebar-icon--payments',
                hovered && 'is-payments-active',
                className
            )}
            aria-hidden
        >
            <svg
                className="customer-sidebar-icon-svg customer-sidebar-payments-svg"
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
                        <rect x="2" y="5" width="20" height="14" rx="2" />
                    </clipPath>
                </defs>

                <g
                    className={cn(
                        'customer-sidebar-payments-card',
                        hovered && 'is-active'
                    )}
                >
                    <rect
                        className="customer-sidebar-payments-shadow"
                        x="2"
                        y="5"
                        width="20"
                        height="14"
                        rx="2"
                    />
                    <rect
                        className="customer-sidebar-payments-card-back customer-sidebar-payments-card-back--1"
                        x="4.1"
                        y="3.35"
                        width="16.9"
                        height="12.6"
                        rx="1.8"
                    />
                    <rect
                        className="customer-sidebar-payments-card-back customer-sidebar-payments-card-back--2"
                        x="3.1"
                        y="4.1"
                        width="18.2"
                        height="13"
                        rx="1.9"
                    />
                    <rect
                        className="customer-sidebar-payments-body"
                        x="2"
                        y="5"
                        width="20"
                        height="14"
                        rx="2"
                    />
                    <line
                        className="customer-sidebar-payments-stripe"
                        x1="2"
                        y1="10"
                        x2="22"
                        y2="10"
                        pathLength={100}
                    />
                    <rect
                        className="customer-sidebar-payments-chip"
                        x="5"
                        y="12.5"
                        width="5.5"
                        height="4"
                        rx="0.6"
                        strokeWidth={1.5}
                    />
                    <path
                        className="customer-sidebar-payments-chip-grid customer-sidebar-payments-chip-grid--1"
                        d="M6.2 12.8v3.4M8.1 12.8v3.4"
                        strokeWidth={0.75}
                    />
                    <path
                        className="customer-sidebar-payments-chip-grid customer-sidebar-payments-chip-grid--2"
                        d="M5.4 14.5h4.6"
                        strokeWidth={0.75}
                    />
                    <g clipPath={`url(#${clipId})`}>
                        <rect
                            className={cn(
                                'customer-sidebar-payments-shine',
                                hovered && 'is-active'
                            )}
                            x="-3"
                            y="5"
                            width="6.5"
                            height="14"
                            fill="currentColor"
                            stroke="none"
                        />
                    </g>
                    <path
                        className="customer-sidebar-payments-ledger-line customer-sidebar-payments-ledger-line--1"
                        d="M13.2 13h5.6"
                        strokeWidth={1.35}
                    />
                    <path
                        className="customer-sidebar-payments-ledger-line customer-sidebar-payments-ledger-line--2"
                        d="M13.2 16.1h3.7"
                        strokeWidth={1.35}
                    />
                    <path
                        className="customer-sidebar-payments-wave customer-sidebar-payments-wave--1"
                        d="M15.9 7.25c.75.38 1.18 1 1.18 1.75s-.43 1.37-1.18 1.75"
                        strokeWidth={1.05}
                    />
                    <path
                        className="customer-sidebar-payments-wave customer-sidebar-payments-wave--2"
                        d="M17.9 6.35c1.05.7 1.65 1.58 1.65 2.65s-.6 1.95-1.65 2.65"
                        strokeWidth={1.05}
                    />
                    <circle className="customer-sidebar-payments-dot customer-sidebar-payments-dot--1" cx="14" cy="14.5" r="0.65" fill="currentColor" stroke="none" />
                    <circle className="customer-sidebar-payments-dot customer-sidebar-payments-dot--2" cx="16.5" cy="14.5" r="0.65" fill="currentColor" stroke="none" />
                    <circle className="customer-sidebar-payments-dot customer-sidebar-payments-dot--3" cx="19" cy="14.5" r="0.65" fill="currentColor" stroke="none" />
                    <path
                        className="customer-sidebar-payments-flow"
                        d="M4.1 20.75c2.8-1.2 5.1-1.15 7.05-.18 2.35 1.16 4.55.95 7.15-.45"
                        pathLength={100}
                        strokeWidth={1.2}
                    />
                </g>
            </svg>
        </span>
    );
}
