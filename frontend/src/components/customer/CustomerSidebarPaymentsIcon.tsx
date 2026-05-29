import { useId } from 'react';
import { cn } from '@/lib/utils';
import { useCustomerSidebarItemHover } from '@/components/customer/useCustomerSidebarItemHover';

type Props = {
    className?: string;
    size?: number;
};

/** Payment History — card tilt, chip reveal, stripe scan & shimmer on hover. */
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
                    <g clipPath={`url(#${clipId})`}>
                        <rect
                            className={cn(
                                'customer-sidebar-payments-shine',
                                hovered && 'is-active'
                            )}
                            x="0"
                            y="5"
                            width="5"
                            height="14"
                            fill="currentColor"
                            stroke="none"
                        />
                    </g>
                    <circle className="customer-sidebar-payments-dot customer-sidebar-payments-dot--1" cx="14" cy="14.5" r="0.65" fill="currentColor" stroke="none" />
                    <circle className="customer-sidebar-payments-dot customer-sidebar-payments-dot--2" cx="16.5" cy="14.5" r="0.65" fill="currentColor" stroke="none" />
                    <circle className="customer-sidebar-payments-dot customer-sidebar-payments-dot--3" cx="19" cy="14.5" r="0.65" fill="currentColor" stroke="none" />
                </g>
            </svg>
        </span>
    );
}
