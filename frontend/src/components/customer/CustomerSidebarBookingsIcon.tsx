import { useId } from 'react';
import { cn } from '@/lib/utils';
import { useCustomerSidebarItemHover } from '@/components/customer/useCustomerSidebarItemHover';

type Props = {
    className?: string;
    size?: number;
};

/** My Bookings — monochrome calendar with page sweep, binder motion, and staggered date rows. */
export function CustomerSidebarBookingsIcon({ className, size = 20 }: Props) {
    const { ref, hovered } = useCustomerSidebarItemHover<HTMLSpanElement>();
    const clipId = useId().replace(/:/g, '');

    return (
        <span
            ref={ref}
            className={cn(
                'customer-sidebar-icon customer-sidebar-icon--bookings',
                hovered && 'is-bookings-active',
                className
            )}
            aria-hidden
        >
            <svg
                className="customer-sidebar-icon-svg customer-sidebar-bookings-svg"
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
                        <rect x="3" y="4.5" width="18" height="16" rx="3" />
                    </clipPath>
                </defs>

                <g className={cn('customer-sidebar-bookings-calendar', hovered && 'is-active')}>
                    <rect
                        className="customer-sidebar-bookings-page"
                        x="3"
                        y="4.5"
                        width="18"
                        height="16"
                        rx="3"
                    />
                    <path className="customer-sidebar-bookings-header" d="M3 9.25h18" />
                    <path className="customer-sidebar-bookings-ring customer-sidebar-bookings-ring--left" d="M8 2.75v4.4" />
                    <path className="customer-sidebar-bookings-ring customer-sidebar-bookings-ring--right" d="M16 2.75v4.4" />

                    <g clipPath={`url(#${clipId})`}>
                        <rect
                            className={cn('customer-sidebar-bookings-sweep', hovered && 'is-active')}
                            x="-3"
                            y="9.7"
                            width="5"
                            height="10.2"
                            fill="currentColor"
                            stroke="none"
                        />
                    </g>

                    <g className={cn('customer-sidebar-bookings-lines', hovered && 'is-active')}>
                        <path className="customer-sidebar-bookings-line customer-sidebar-bookings-line--1" d="M7 12.4h10" />
                        <path className="customer-sidebar-bookings-line customer-sidebar-bookings-line--2" d="M7 15h7.5" />
                        <path className="customer-sidebar-bookings-line customer-sidebar-bookings-line--3" d="M7 17.6h5" />
                    </g>

                    <g className={cn('customer-sidebar-bookings-dates', hovered && 'is-active')}>
                        <circle className="customer-sidebar-bookings-dot customer-sidebar-bookings-dot--1" cx="17.2" cy="14.9" r="0.72" />
                        <circle className="customer-sidebar-bookings-dot customer-sidebar-bookings-dot--2" cx="14.85" cy="17.55" r="0.62" />
                        <circle className="customer-sidebar-bookings-dot customer-sidebar-bookings-dot--3" cx="17.2" cy="17.55" r="0.62" />
                    </g>

                    <path
                        className="customer-sidebar-bookings-corner"
                        d="M18.05 17.2 20.2 19.35 18.05 19.35Z"
                    />
                </g>
            </svg>
        </span>
    );
}
