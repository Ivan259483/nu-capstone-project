"use client";

import React, { type ReactNode, useState } from "react";
import {
    AnimatePresence,
    LayoutGroup,
    motion,
    useMotionValueEvent,
    useScroll,
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
    forceVisible?: boolean;
    renderNavItem?: (
        navItem: FloatingNavItem,
        className: string,
        children: ReactNode
    ) => ReactNode;
};

function NavActivePill({ layoutId }: { layoutId: string }) {
    return (
        <motion.span
            layoutId={layoutId}
            className="absolute inset-0 rounded-full bg-white/[0.09] shadow-[inset_0_1px_0_rgba(255,255,255,0.07)]"
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
    forceVisible = false,
    renderNavItem,
}: FloatingNavProps) => {
    const { scrollYProgress } = useScroll();
    const [visible, setVisible] = useState(true);

    useMotionValueEvent(scrollYProgress, "change", (current) => {
        if (typeof current !== "number") return;

        const previous = scrollYProgress.getPrevious();
        if (typeof previous !== "number") return;

        const direction = current - previous;

        if (scrollYProgress.get() < 0.01) {
            setVisible(true);
        } else if (direction < 0) {
            setVisible(true);
        } else if (direction > 0) {
            setVisible(false);
        }
    });

    const isVisible = forceVisible || visible;

    return (
        <AnimatePresence mode="wait">
            <motion.nav
                aria-label="Primary"
                initial={{
                    opacity: 1,
                    y: -100,
                }}
                animate={{
                    y: isVisible ? 0 : -120,
                    opacity: isVisible ? 1 : 0,
                }}
                transition={{
                    duration: 0.2,
                }}
                className={cn(
                    "fixed inset-x-0 top-4 z-[5000] mx-auto flex w-[calc(100%-1.5rem)] max-w-[72rem] items-center justify-center sm:top-6",
                    className
                )}
            >
                <div className="floating-nav-shell relative isolate flex min-h-[3.25rem] w-full items-center overflow-hidden rounded-full bg-[#070a12]/92 px-3 py-1.5 backdrop-blur-xl supports-[backdrop-filter]:bg-[#070a12]/88 sm:min-h-[3.5rem] sm:px-4 sm:py-2">
                    {logo && (
                        <div className="relative z-[2] flex shrink-0 items-center">{logo}</div>
                    )}

                    <div className="public-nav-links-group pointer-events-none absolute inset-0 z-[1] hidden items-center justify-center lg:flex">
                        <LayoutGroup id="public-nav-desktop">
                            <div className="pointer-events-auto flex items-center gap-0.5 rounded-full p-0.5">
                                {navItems.map((navItem) => {
                                    const itemClassName = cn(
                                        "public-nav-link relative flex items-center whitespace-nowrap rounded-full border-0 px-3.5 py-2 text-[0.8125rem] font-medium tracking-[0.01em] shadow-none outline-none",
                                        "no-underline decoration-transparent decoration-0 underline-offset-0",
                                        "transition-colors duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
                                        "focus:outline-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e0a020]/45 focus-visible:ring-offset-0",
                                        navItem.active && "public-nav-link--active z-[1] text-[#e0a020]",
                                        !navItem.active &&
                                            "z-[1] text-white/65 hover:bg-white/[0.06] hover:text-white"
                                    );

                                    const itemContent = (
                                        <>
                                            {navItem.active && (
                                                <NavActivePill layoutId="public-nav-active-pill" />
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

                    <div className="relative z-[2] ml-auto flex min-w-0 shrink-0 items-center gap-1.5 sm:gap-2">
                        {actions && (
                            <div className="hidden min-w-0 items-center gap-1.5 sm:gap-2 lg:flex">
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
