import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";

const PANEL_EASE = [0.22, 1, 0.36, 1] as const;

const panelVariants = {
    enter: (direction: number) => ({
        opacity: 0,
        y: direction > 0 ? 10 : -10,
    }),
    center: {
        opacity: 1,
        y: 0,
    },
    exit: (direction: number) => ({
        opacity: 0,
        y: direction > 0 ? -8 : 8,
    }),
};

const panelTransition = {
    opacity: { duration: 0.32, ease: PANEL_EASE },
    y: { duration: 0.38, ease: PANEL_EASE },
};

type LoginAuthFormSwitcherProps = {
    activeTab: "login" | "register";
    visible: boolean;
    loginPanel: ReactNode;
    registerPanel: ReactNode;
};

export function LoginAuthFormSwitcher({
    activeTab,
    visible,
    loginPanel,
    registerPanel,
}: LoginAuthFormSwitcherProps) {
    const [direction, setDirection] = useState(0);
    const prevTab = useRef(activeTab);
    const measureRef = useRef<HTMLDivElement>(null);
    const [panelHeight, setPanelHeight] = useState<number | "auto">("auto");

    useLayoutEffect(() => {
        if (prevTab.current !== activeTab) {
            setDirection(activeTab === "register" ? 1 : -1);
            prevTab.current = activeTab;
        }
    }, [activeTab]);

    useLayoutEffect(() => {
        if (!visible || !measureRef.current) return;

        const el = measureRef.current;
        const measure = () => {
            const next = Math.ceil(el.scrollHeight) + 2;
            if (activeTab === "register") {
                setPanelHeight("auto");
                return;
            }
            setPanelHeight(next);
        };

        measure();
        const ro = new ResizeObserver(measure);
        ro.observe(el);
        return () => ro.disconnect();
    }, [activeTab, visible]);

    if (!visible) return null;

    const isRegister = activeTab === "register";

    return (
        <motion.div
            className="overflow-visible"
            animate={{ height: isRegister ? "auto" : panelHeight }}
            transition={{
                height: isRegister
                    ? { duration: 0 }
                    : { duration: 0.42, ease: PANEL_EASE },
            }}
        >
            <div ref={measureRef} className="relative w-full">
                <AnimatePresence initial={false} custom={direction} mode="wait">
                    {isRegister ? (
                        <motion.div
                            key="register-panel"
                            custom={direction}
                            variants={panelVariants}
                            initial="enter"
                            animate="center"
                            exit="exit"
                            transition={panelTransition}
                            className="relative w-full min-w-0 min-h-[min(26rem,calc(100dvh-15rem))]"
                        >
                            {registerPanel}
                        </motion.div>
                    ) : (
                        <motion.div
                            key="login-panel"
                            custom={direction}
                            variants={panelVariants}
                            initial="enter"
                            animate="center"
                            exit="exit"
                            transition={panelTransition}
                            className="relative w-full min-w-0"
                        >
                            {loginPanel}
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </motion.div>
    );
}
