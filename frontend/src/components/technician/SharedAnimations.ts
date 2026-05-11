export const pageVariants = {
    initial: { opacity: 0, y: 20, scale: 0.99 },
    animate: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.5, ease: [0.25, 0.1, 0.25, 1] as const } },
    exit: { opacity: 0, y: -10, scale: 0.99, transition: { duration: 0.2 } }
};

export const staggerContainer = {
    initial: { opacity: 0 },
    animate: { opacity: 1, transition: { staggerChildren: 0.06, delayChildren: 0.04 } }
};

export const staggerItem = {
    initial: { opacity: 0, y: 16, scale: 0.98 },
    animate: { opacity: 1, y: 0, scale: 1, transition: { type: 'spring' as const, stiffness: 260, damping: 24 } }
};

export const cardHover = { scale: 1.015, transition: { type: 'spring' as const, stiffness: 400, damping: 25 } };
export const cardTap = { scale: 0.985, transition: { type: 'spring' as const, stiffness: 400, damping: 25 } };
export const btnHover = { scale: 1.03, transition: { type: 'spring' as const, stiffness: 400, damping: 20 } };
export const btnTap = { scale: 0.96, transition: { type: 'spring' as const, stiffness: 400, damping: 20 } };

export const modalSpring = {
    type: "spring" as const,
    stiffness: 300,
    damping: 30
};
