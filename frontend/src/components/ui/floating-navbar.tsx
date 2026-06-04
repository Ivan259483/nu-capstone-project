"use client";

import React, { type ReactNode } from "react";
import {
    AnimatePresence,
    LayoutGroup,
    motion,
} from "motion/react";
import { cn } from "@/lib/utils";

export type FloatingNavItem = {
    name: string;
    link: string;
    icon?: ReactNode;
    active?: boolean;
};

/** Shared spring for sliding active pill — tuned for a smooth, settled glide */
export const NAV_ACTIVE_PILL_TRANSITION = {
    type: "spring" as const,
    stiffness: 320,
    damping: 32,
    mass: 0.85,
};

type FloatingNavProps = {
    navItems: FloatingNavItem[];
    className?: string;
    logo?: ReactNode;
    actions?: ReactNode;
    mobileActions?: ReactNode;
    variant?: "glass" | "hero";
    renderNavItem?: (
        navItem: FloatingNavItem,
        className: string,
        children: ReactNode
    ) => ReactNode;
};

function NavActivePill({
    layoutId,
    variant,
}: {
    layoutId: string;
    variant: "glass" | "hero";
}) {
    return (
        <motion.span
            layoutId={layoutId}
            className={
                variant === "hero"
                    ? "absolute -bottom-1 left-3 right-3 h-px rounded-full bg-[#f4c96b] shadow-[0_0_14px_rgba(244,201,107,0.55)]"
                    : "absolute -bottom-1 left-2 right-2 h-px rounded-full bg-[#f4c96b] shadow-[0_0_12px_rgba(244,201,107,0.45)]"
            }
            transition={NAV_ACTIVE_PILL_TRANSITION}
            aria-hidden
        />
    );
}

export const FloatingNav = ({
    navItems,
    className,
    logo,
    actions,
    mobileActions,
    variant = "glass",
    renderNavItem,
}: FloatingNavProps) => {
    const isHero = variant === "hero";

    return (
        <AnimatePresence mode="wait">
            <motion.nav
                aria-label="Primary"
                initial={{
                    opacity: 1,
                    y: -100,
                }}
                animate={{
                    y: 0,
                    opacity: 1,
                }}
                transition={{
                    duration: 0.2,
                }}
                className={cn(
                    isHero
                        ? "absolute inset-x-0 top-0 z-[5000] h-[88px] w-full sm:h-24"
                        : "absolute inset-x-0 top-0 z-[5000] h-[88px] w-full sm:h-24",
                    className
                )}
            >
                {isHero && (
                    <div
                        className="pointer-events-none absolute inset-x-0 top-0 h-36 bg-gradient-to-b from-black/55 via-black/24 to-transparent"
                        aria-hidden
                    />
                )}
                {!isHero && (
                    <div
                        className="public-glass-nav-backdrop pointer-events-none absolute inset-0"
                        aria-hidden
                    />
                )}
                <div
                    className={cn(
                        isHero
                            ? "public-hero-nav-shell pointer-events-auto relative z-[1] mx-auto grid h-[88px] w-full max-w-[85rem] grid-cols-[auto_1fr_auto] items-center gap-6 px-6 sm:h-24 sm:px-8 lg:px-10"
                            : "public-glass-nav-shell pointer-events-auto relative z-[1] mx-auto grid h-[88px] w-full max-w-[85rem] grid-cols-[auto_1fr_auto] items-center gap-6 px-6 sm:h-24 sm:px-8 lg:px-10"
                    )}
                >
                    {logo && (
                        <div className="relative z-[2] flex shrink-0 items-center justify-self-start">{logo}</div>
                    )}

                    <div
                        className={cn(
                            "public-nav-links-group pointer-events-none absolute inset-y-0 left-0 right-0 z-[1] hidden min-w-0 items-center justify-center lg:flex",
                            !logo && "justify-self-start"
                        )}
                    >
                        <LayoutGroup id="public-nav-desktop">
                            <div className="pointer-events-auto flex items-center gap-10 xl:gap-12">
                                {navItems.map((navItem) => {
                                    const itemClassName = cn(
                                        "public-nav-link relative flex items-center whitespace-nowrap border-0 text-[0.8125rem] font-medium shadow-none outline-none",
                                        "no-underline decoration-transparent decoration-0 underline-offset-0",
                                        "transition-colors duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
                                        "focus:outline-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e0a020]/45 focus-visible:ring-offset-0",
                                        isHero
                                            ? cn(
                                                "rounded-none px-0 py-2 text-white/80 drop-shadow-[0_1px_8px_rgba(0,0,0,0.45)] hover:text-white",
                                                navItem.active && "public-nav-link--active z-[1] text-white",
                                                !navItem.active && "z-[1]"
                                            )
                                            : cn(
                                                "rounded-none px-0 py-2 text-white/78 hover:text-white",
                                                navItem.active && "public-nav-link--active z-[1] text-white",
                                                !navItem.active && "z-[1]"
                                            )
                                    );

                                    const itemContent = (
                                        <>
                                            {navItem.active && (
                                                <NavActivePill layoutId="public-nav-active-pill" variant={variant} />
                                            )}
                                            <span className="public-nav-link-label relative z-[2] border-0 decoration-0">
                                                <span className="block sm:hidden">{navItem.icon}</span>
                                                <span className="hidden sm:block">{navItem.name}</span>
                                            </span>
                                        </>
                                    );

                                    return (
                                        <React.Fragment key={navItem.link}>
                                            {renderNavItem ? (
                                                renderNavItem(navItem, itemClassName, itemContent)
                                            ) : (
                                                <a
                                                    href={navItem.link}
                                                    className={cn("public-nav-link", itemClassName)}
                                                >
                                                    {itemContent}
                                                </a>
                                            )}
                                        </React.Fragment>
                                    );
                                })}
                            </div>
                        </LayoutGroup>
                    </div>

                    <div className="relative z-[2] flex min-w-0 shrink-0 items-center justify-self-end">
                        {actions && (
                            <div className="hidden min-w-0 items-center gap-2.5 lg:flex">
                                {actions}
                            </div>
                        )}
                        {mobileActions && (
                            <div className="flex shrink-0 items-center gap-1.5 sm:gap-2 lg:hidden">
                                {mobileActions}
                            </div>
                        )}
                    </div>
                </div>
            </motion.nav>
        </AnimatePresence>
    );
};
