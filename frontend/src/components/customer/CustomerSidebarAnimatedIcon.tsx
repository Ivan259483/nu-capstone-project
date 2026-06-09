import {
    ScanLine,
    LogOut,
    ChevronLeft,
    Sparkles,
    Bell,
    Settings,
    type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { CustomerSidebarPaymentsIcon } from '@/components/customer/CustomerSidebarPaymentsIcon';
import { CustomerSidebarServicesIcon } from '@/components/customer/CustomerSidebarServicesIcon';
import { CustomerSidebarTrackerIcon } from '@/components/customer/CustomerSidebarTrackerIcon';
import { CustomerSidebarRewardsIcon } from '@/components/customer/CustomerSidebarRewardsIcon';
import { CustomerSidebarBookingsIcon } from '@/components/customer/CustomerSidebarBookingsIcon';
import { CustomerSidebarDocumentsIcon } from '@/components/customer/CustomerSidebarDocumentsIcon';
import { useCustomerSidebarItemHover } from '@/components/customer/useCustomerSidebarItemHover';

export type CustomerSidebarIconName =
    | 'dashboard'
    | 'scan'
    | 'bookings'
    | 'services'
    | 'tracker'
    | 'documents'
    | 'payments'
    | 'rewards'
    | 'logout'
    | 'collapse'
    | 'sparkles'
    | 'notifications'
    | 'settings';

const ICONS: Record<Exclude<CustomerSidebarIconName, 'dashboard' | 'tracker' | 'payments' | 'services' | 'rewards' | 'bookings' | 'documents'>, LucideIcon> = {
    scan: ScanLine,
    logout: LogOut,
    collapse: ChevronLeft,
    sparkles: Sparkles,
    notifications: Bell,
    settings: Settings,
};

type Props = {
    name: CustomerSidebarIconName;
    className?: string;
    size?: number;
};

function CustomerSidebarDashboardGridIcon({ className, size = 18 }: Pick<Props, 'className' | 'size'>) {
    const { ref, hovered } = useCustomerSidebarItemHover<HTMLSpanElement>();

    return (
        <span
            ref={ref}
            className={cn(
                'customer-sidebar-icon customer-sidebar-icon--dashboard-grid',
                'customer-sidebar-animated-icon',
                hovered && 'is-dashboard-active',
                className
            )}
            aria-hidden
        >
            <svg
                className="customer-sidebar-icon-svg"
                width={size}
                height={size}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.8}
                strokeLinecap="round"
                strokeLinejoin="round"
            >
                <rect className="customer-sidebar-dashboard-grid-cell customer-sidebar-dashboard-grid-cell--1" x="4" y="4" width="6" height="6" rx="1.4" />
                <rect className="customer-sidebar-dashboard-grid-cell customer-sidebar-dashboard-grid-cell--2" x="14" y="4" width="6" height="6" rx="1.4" />
                <rect className="customer-sidebar-dashboard-grid-cell customer-sidebar-dashboard-grid-cell--3" x="4" y="14" width="6" height="6" rx="1.4" />
                <rect className="customer-sidebar-dashboard-grid-cell customer-sidebar-dashboard-grid-cell--4" x="14" y="14" width="6" height="6" rx="1.4" />
            </svg>
        </span>
    );
}

/** Inline SVG icons with per-shape hover motion (see `.customer-sidebar-icon--*` in index.css). */
export function CustomerSidebarAnimatedIcon({ name, className, size = 18 }: Props) {
    if (name === 'dashboard') {
        return <CustomerSidebarDashboardGridIcon className={className} size={size} />;
    }
    if (name === 'tracker') {
        return <CustomerSidebarTrackerIcon className={className} size={size} />;
    }
    if (name === 'payments') {
        return <CustomerSidebarPaymentsIcon className={className} size={size} />;
    }
    if (name === 'services') {
        return <CustomerSidebarServicesIcon className={className} size={size} />;
    }
    if (name === 'bookings') {
        return <CustomerSidebarBookingsIcon className={className} size={size} />;
    }
    if (name === 'rewards') {
        return <CustomerSidebarRewardsIcon className={className} size={size} />;
    }
    if (name === 'documents') {
        return <CustomerSidebarDocumentsIcon className={className} size={size} />;
    }

    const Icon = ICONS[name];
    return (
        <span
            className={cn('customer-sidebar-icon customer-sidebar-animated-icon', `customer-sidebar-icon--${name}`, className)}
            aria-hidden
        >
            <Icon className="customer-sidebar-icon-svg" size={size} strokeWidth={1.8} />
        </span>
    );
}
