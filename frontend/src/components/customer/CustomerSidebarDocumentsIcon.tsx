import { useId } from 'react';
import { cn } from '@/lib/utils';
import { useCustomerSidebarItemHover } from '@/components/customer/useCustomerSidebarItemHover';

type Props = {
    className?: string;
    size?: number;
};

/** Documents — monochrome document stack with page lift, scan sweep, fold, and line write. */
export function CustomerSidebarDocumentsIcon({ className, size = 20 }: Props) {
    const { ref, hovered } = useCustomerSidebarItemHover<HTMLSpanElement>();
    const clipId = useId().replace(/:/g, '');

    return (
        <span
            ref={ref}
            className={cn(
                'customer-sidebar-icon customer-sidebar-icon--documents',
                hovered && 'is-documents-active',
                className
            )}
            aria-hidden
        >
            <svg
                className="customer-sidebar-icon-svg customer-sidebar-documents-svg"
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
                        <path d="M6 3.5h8.2L20 9.3V20a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5.5a2 2 0 0 1 2-2Z" />
                    </clipPath>
                </defs>

                <g className={cn('customer-sidebar-documents-stack', hovered && 'is-active')}>
                    <path
                        className="customer-sidebar-documents-shadow"
                        d="M6 3.5h8.2L20 9.3V20a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5.5a2 2 0 0 1 2-2Z"
                    />
                    <path
                        className="customer-sidebar-documents-page-back customer-sidebar-documents-page-back--1"
                        d="M7.2 2.2h7.5l5.1 5.1v11.2a1.6 1.6 0 0 1-1.6 1.6H7.2a1.6 1.6 0 0 1-1.6-1.6V3.8a1.6 1.6 0 0 1 1.6-1.6Z"
                    />
                    <path
                        className="customer-sidebar-documents-page-back customer-sidebar-documents-page-back--2"
                        d="M5 4.2h8.4l5.3 5.3v10.2a1.7 1.7 0 0 1-1.7 1.7H5a1.7 1.7 0 0 1-1.7-1.7V5.9A1.7 1.7 0 0 1 5 4.2Z"
                    />
                    <path
                        className="customer-sidebar-documents-page"
                        d="M6 3.5h8.2L20 9.3V20a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5.5a2 2 0 0 1 2-2Z"
                    />
                    <path
                        className="customer-sidebar-documents-fold"
                        d="M14.2 3.5V8a1.3 1.3 0 0 0 1.3 1.3H20"
                    />

                    <g clipPath={`url(#${clipId})`}>
                        <rect
                            className={cn('customer-sidebar-documents-sweep', hovered && 'is-active')}
                            x="-3"
                            y="4"
                            width="6"
                            height="18"
                            fill="currentColor"
                            stroke="none"
                        />
                    </g>

                    <g className={cn('customer-sidebar-documents-lines', hovered && 'is-active')}>
                        <path className="customer-sidebar-documents-line customer-sidebar-documents-line--1" d="M7.4 12.1h8.8" />
                        <path className="customer-sidebar-documents-line customer-sidebar-documents-line--2" d="M7.4 15.1h9.7" />
                        <path className="customer-sidebar-documents-line customer-sidebar-documents-line--3" d="M7.4 18.1h6.4" />
                    </g>

                    <g className={cn('customer-sidebar-documents-stamp', hovered && 'is-active')}>
                        <circle className="customer-sidebar-documents-stamp-ring" cx="16.7" cy="17.1" r="1.65" />
                        <path className="customer-sidebar-documents-stamp-check" d="M15.95 17.1l.48.48 1-.98" />
                    </g>

                    <path
                        className={cn('customer-sidebar-documents-trail', hovered && 'is-active')}
                        d="M2.4 12.4h2.6M2.9 15.4h2.1"
                    />
                </g>
            </svg>
        </span>
    );
}
