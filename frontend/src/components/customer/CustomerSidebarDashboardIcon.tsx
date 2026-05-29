import { useId, type CSSProperties } from 'react';
import { cn } from '@/lib/utils';
import { useCustomerSidebarItemHover } from '@/components/customer/useCustomerSidebarItemHover';

const TILES = [
    { key: 'tl', x: 3, y: 3, delay: 0, shift: '-1.55px, -1.55px' },
    { key: 'tr', x: 14, y: 3, delay: 1, shift: '1.55px, -1.55px' },
    { key: 'br', x: 14, y: 14, delay: 2, shift: '1.55px, 1.55px' },
    { key: 'bl', x: 3, y: 14, delay: 3, shift: '-1.55px, 1.55px' },
] as const;

type Props = {
    className?: string;
    size?: number;
};

type DashboardTileStyle = CSSProperties & {
    '--dashboard-tile-shift'?: string;
};

/** Dashboard grid — monochrome premium tile choreography on hover/focus. */
export function CustomerSidebarDashboardIcon({ className, size = 20 }: Props) {
    const { ref, hovered } = useCustomerSidebarItemHover<HTMLSpanElement>();
    const clipId = useId().replace(/:/g, '');

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
                <defs>
                    <clipPath id={clipId}>
                        <rect x="2" y="2" width="20" height="20" rx="2.75" />
                    </clipPath>
                </defs>

                <g className={cn('customer-sidebar-dashboard-grid', hovered && 'is-active')}>
                    {TILES.map((tile) => (
                        <g
                            key={tile.key}
                            className={cn(
                                'customer-sidebar-dashboard-tile',
                                `customer-sidebar-dashboard-tile--${tile.key}`,
                                hovered && 'is-active'
                            )}
                            style={{
                                animationDelay: hovered ? `${tile.delay * 0.1}s` : undefined,
                                '--dashboard-tile-shift': tile.shift,
                            } as DashboardTileStyle}
                        >
                            <rect
                                className="customer-sidebar-dashboard-tile-frame"
                                x={tile.x}
                                y={tile.y}
                                width={7}
                                height={7}
                                rx={1.25}
                            />
                            <rect
                                className="customer-sidebar-dashboard-tile-fill"
                                x={tile.x + 1.6}
                                y={tile.y + 1.6}
                                width={3.8}
                                height={3.8}
                                rx={0.8}
                            />
                        </g>
                    ))}

                    <g clipPath={`url(#${clipId})`}>
                        <rect
                            className={cn('customer-sidebar-dashboard-scanline', hovered && 'is-active')}
                            x="2"
                            y="-3"
                            width="20"
                            height="4"
                            fill="currentColor"
                            stroke="none"
                        />
                    </g>

                    <path
                        className={cn('customer-sidebar-dashboard-trace', hovered && 'is-active')}
                        d="M6.6 15.8 9.4 13.3 12.1 15.2 17.5 9.4"
                        pathLength={100}
                    />
                    <circle
                        className={cn('customer-sidebar-dashboard-pulse', hovered && 'is-active')}
                        cx="17.5"
                        cy="9.4"
                        r="1"
                    />
                    <circle
                        className={cn('customer-sidebar-dashboard-runner', hovered && 'is-active')}
                        cx="5.7"
                        cy="5.7"
                        r="1"
                    />

                    <g clipPath={`url(#${clipId})`}>
                        <rect
                            className={cn('customer-sidebar-dashboard-sweep', hovered && 'is-active')}
                            x="-5"
                            y="2"
                            width="5"
                            height="20"
                            fill="currentColor"
                            stroke="none"
                        />
                    </g>

                    <path
                        className={cn('customer-sidebar-dashboard-outline', hovered && 'is-active')}
                        d="M3 10V5a2 2 0 0 1 2-2h5M14 3h5a2 2 0 0 1 2 2v5M21 14v5a2 2 0 0 1-2 2h-5M10 21H5a2 2 0 0 1-2-2v-5"
                        pathLength={100}
                    />
                </g>
            </svg>
        </span>
    );
}
