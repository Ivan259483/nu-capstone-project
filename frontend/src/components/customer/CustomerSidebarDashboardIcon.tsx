import { cn } from '@/lib/utils';
import { useCustomerSidebarItemHover } from '@/components/customer/useCustomerSidebarItemHover';

const TILES = [
    { key: 'tl', x: 3, y: 3, delay: 0 },
    { key: 'tr', x: 14, y: 3, delay: 1 },
    { key: 'br', x: 14, y: 14, delay: 2 },
    { key: 'bl', x: 3, y: 14, delay: 3 },
] as const;

type Props = {
    className?: string;
    size?: number;
};

/** Dashboard grid — tiles pulse in a wave while the menu item is hovered. */
export function CustomerSidebarDashboardIcon({ className, size = 20 }: Props) {
    const { ref, hovered } = useCustomerSidebarItemHover<HTMLSpanElement>();

    return (
        <span
            ref={ref}
            className={cn(
                'customer-sidebar-icon customer-sidebar-icon--dashboard',
                hovered && 'is-dashboard-active',
                className
            )}
            aria-hidden
        >
            <svg
                className="customer-sidebar-icon-svg customer-sidebar-dashboard-svg"
                width={size}
                height={size}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
            >
                {TILES.map((tile) => (
                    <rect
                        key={tile.key}
                        className={cn(
                            'customer-sidebar-dashboard-tile',
                            `customer-sidebar-dashboard-tile--${tile.key}`,
                            hovered && 'is-active'
                        )}
                        style={{ animationDelay: hovered ? `${tile.delay * 0.12}s` : undefined }}
                        x={tile.x}
                        y={tile.y}
                        width={7}
                        height={7}
                        rx={1}
                    />
                ))}
            </svg>
        </span>
    );
}
