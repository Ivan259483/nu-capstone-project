import { cn } from '@/lib/utils';
import { useCustomerSidebarItemHover } from '@/components/customer/useCustomerSidebarItemHover';

/** Lucide Route path — snake travels along this curve */
const TRACKER_ROUTE_D = 'M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15';

type Props = {
    className?: string;
    size?: number;
};

/** Live Tracker icon — dot crawls along the route on menu-item hover (snake effect). */
export function CustomerSidebarTrackerIcon({ className, size = 20 }: Props) {
    const { ref, hovered } = useCustomerSidebarItemHover<HTMLSpanElement>();

    return (
        <span
            ref={ref}
            className={cn(
                'customer-sidebar-icon customer-sidebar-icon--tracker',
                hovered && 'is-snake-active',
                className
            )}
            aria-hidden
        >
            <svg
                className="customer-sidebar-icon-svg customer-sidebar-tracker-svg"
                width={size}
                height={size}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
            >
                <circle className="customer-sidebar-tracker-pin customer-sidebar-tracker-pin--start" cx="6" cy="19" r="3" />
                <path
                    className="customer-sidebar-tracker-route"
                    pathLength={100}
                    d={TRACKER_ROUTE_D}
                />
                <circle className="customer-sidebar-tracker-pin customer-sidebar-tracker-pin--end" cx="18" cy="5" r="3" />
                <circle className="customer-sidebar-tracker-snake" r="2.25" fill="currentColor" stroke="none">
                    {hovered ? (
                        <animateMotion
                            key="snake-motion"
                            dur="1.15s"
                            repeatCount="indefinite"
                            path={TRACKER_ROUTE_D}
                            rotate="auto"
                        />
                    ) : null}
                </circle>
            </svg>
        </span>
    );
}
