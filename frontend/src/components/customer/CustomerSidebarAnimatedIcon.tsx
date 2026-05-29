import {
    ScanLine,
    FileText,
    LogOut,
    ChevronLeft,
    Sparkles,
    Bell,
    Settings,
    type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { CustomerSidebarDashboardIcon } from '@/components/customer/CustomerSidebarDashboardIcon';
import { CustomerSidebarPaymentsIcon } from '@/components/customer/CustomerSidebarPaymentsIcon';
import { CustomerSidebarServicesIcon } from '@/components/customer/CustomerSidebarServicesIcon';
import { CustomerSidebarTrackerIcon } from '@/components/customer/CustomerSidebarTrackerIcon';
import { CustomerSidebarRewardsIcon } from '@/components/customer/CustomerSidebarRewardsIcon';
import { CustomerSidebarBookingsIcon } from '@/components/customer/CustomerSidebarBookingsIcon';

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

const ICONS: Record<Exclude<CustomerSidebarIconName, 'dashboard' | 'tracker' | 'payments' | 'services' | 'rewards' | 'bookings'>, LucideIcon> = {
    scan: ScanLine,
    documents: FileText,
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

/** Inline SVG icons with per-shape hover motion (see `.customer-sidebar-icon--*` in index.css). */
export function CustomerSidebarAnimatedIcon({ name, className, size = 20 }: Props) {
    if (name === 'dashboard') {
        return <CustomerSidebarDashboardIcon className={className} size={size} />;
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

    const Icon = ICONS[name];
    return (
        <span
            className={cn('customer-sidebar-icon', `customer-sidebar-icon--${name}`, className)}
            aria-hidden
        >
            <Icon className="customer-sidebar-icon-svg" size={size} strokeWidth={2} />
        </span>
    );
}
