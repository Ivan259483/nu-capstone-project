import * as React from "react";
import { motion, useReducedMotion, useScroll, useTransform, useSpring, type MotionValue } from "framer-motion";
import { cn } from "@/lib/utils";
import { TRUSTED_BY_SECTION_BG, TrustedBySectionAmbient } from "@/components/TrustedBySectionSurface";

export type HeroParallaxProduct = {
    title: string;
    link: string;
    thumbnail: string;
};

const DEFAULT_TITLE = (
    <>
        The Ultimate <br /> development studio
    </>
);

const DEFAULT_DESCRIPTION =
    "We build beautiful products with the latest technologies and frameworks. We are a team of passionate developers and designers that love to build amazing products.";

/** Aceternity Hero Parallax demo spring — `bounce` is not a framer-motion option; stiffness/damping only */
const PARALLAX_SPRING = { stiffness: 120, damping: 28, mass: 0.7 };

export type HeroParallaxProps = {
    products: HeroParallaxProduct[];
    title?: React.ReactNode;
    description?: string;
    titleSerif?: boolean;
    className?: string;
    /** Anchor id for in-page links (e.g. hero “View work” → this section). */
    sectionId?: string;
};

/**
 * Aceternity UI “Hero Parallax” scroll rig: same transform curves (rotate / translateY / opacity / horizontal drift).
 * @see https://ui.aceternity.com/components/hero-parallax
 */
export function ProductCard({
    product,
    translate,
    reduceMotion = false,
}: {
    product: HeroParallaxProduct;
    translate: MotionValue<number>;
    reduceMotion?: boolean;
}) {
    return (
        <motion.div
            style={{ x: translate }}
            whileHover={reduceMotion ? undefined : { y: -8 }}
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
            className="group/product relative h-96 w-[30rem] shrink-0 overflow-hidden rounded-xl shadow-2xl will-change-transform"
        >
            <a href={product.link} className="block h-full w-full" aria-label={product.title}>
                <img
                    src={product.thumbnail}
                    alt={product.title}
                    height={600}
                    width={600}
                    className="absolute inset-0 h-full w-full object-cover object-left-top transition-transform duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover/product:scale-[1.025] motion-reduce:transform-none"
                    loading="lazy"
                />
            </a>
            <div className="pointer-events-none absolute inset-0 h-full w-full bg-gradient-to-t from-black/75 via-black/12 to-black/18 opacity-45 transition-opacity duration-500 group-hover/product:opacity-76" />
            <h2 className="absolute bottom-4 left-4 text-white opacity-0 transition-opacity duration-300 group-hover/product:opacity-100">
                {product.title}
            </h2>
        </motion.div>
    );
}

export function HeroParallax({
    products,
    title,
    description,
    titleSerif = false,
    className,
    sectionId,
}: HeroParallaxProps) {
    const firstRow = products.slice(0, 5);
    const secondRow = products.slice(5, 10);
    const thirdRow = products.slice(10, 15);

    const ref = React.useRef<HTMLDivElement>(null);
    const shouldReduceMotion = useReducedMotion();
    const { scrollYProgress } = useScroll({
        target: ref,
        offset: ["start start", "end start"],
    });

    const translateX = useSpring(useTransform(scrollYProgress, [0, 1], shouldReduceMotion ? [0, 0] : [0, 520]), PARALLAX_SPRING);
    const translateXReverse = useSpring(useTransform(scrollYProgress, [0, 1], shouldReduceMotion ? [0, 0] : [0, -520]), PARALLAX_SPRING);
    const rotateX = useSpring(useTransform(scrollYProgress, [0, 0.22], shouldReduceMotion ? [0, 0] : [8, 0]), PARALLAX_SPRING);
    const opacity = useSpring(useTransform(scrollYProgress, [0, 0.22], shouldReduceMotion ? [1, 1] : [0.42, 1]), PARALLAX_SPRING);
    const rotateZ = useSpring(useTransform(scrollYProgress, [0, 0.22], shouldReduceMotion ? [0, 0] : [8, 0]), PARALLAX_SPRING);
    const translateY = useSpring(useTransform(scrollYProgress, [0, 0.34], shouldReduceMotion ? [0, 0] : [-190, 74]), PARALLAX_SPRING);

    const resolvedTitle = title ?? DEFAULT_TITLE;
    const resolvedDescription = description ?? DEFAULT_DESCRIPTION;

    return (
        <div
            ref={ref}
            id={sectionId}
            className={cn(
                "relative flex min-h-[185vh] flex-col overflow-hidden py-16 antialiased md:py-28",
                "[perspective:1000px] [transform-style:preserve-3d]",
                sectionId && "scroll-mt-24 sm:scroll-mt-28",
                className,
            )}
            style={TRUSTED_BY_SECTION_BG}
        >
            <TrustedBySectionAmbient />
            <div
                className="pointer-events-none absolute inset-x-0 top-0 z-[1] h-[34rem] bg-gradient-to-b from-[#07070A]/92 via-[#07070A]/44 to-transparent"
                aria-hidden
            />

            {/* Copy — same flow as Aceternity Header (scrolls with section; parallax is on gallery block below) */}
            <div className="relative z-10 mx-auto w-full max-w-7xl px-4">
                <motion.h1
                    className={cn(
                        "text-2xl font-bold text-foreground md:text-7xl",
                        titleSerif && "font-serif",
                    )}
                    style={titleSerif ? { fontFamily: "Georgia, serif" } : undefined}
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, amount: 0.4 }}
                    transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                >
                    {resolvedTitle}
                </motion.h1>

                <motion.p
                    className="mt-8 max-w-2xl text-base text-muted-foreground md:text-xl"
                    initial={{ opacity: 0, y: 16 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, amount: 0.35 }}
                    transition={{ duration: 0.5, delay: 0.08, ease: [0.16, 1, 0.3, 1] }}
                >
                    {resolvedDescription}
                </motion.p>
            </div>

            {/* Core Aceternity motion shell — rotation + vertical sweep + fade + card X drift */}
            <motion.div
                style={{
                    rotateX,
                    rotateZ,
                    translateY,
                    opacity,
                    transformStyle: "preserve-3d",
                }}
                className="relative z-0 w-full"
            >
                <div className="mx-auto flex max-w-none flex-row-reverse gap-10 px-4 pb-14 md:gap-16">
                    {firstRow.map((product) => (
                        <ProductCard key={product.title} product={product} translate={translateX} reduceMotion={Boolean(shouldReduceMotion)} />
                    ))}
                </div>
                <div className="mx-auto flex max-w-none flex-row gap-10 px-4 pb-14 md:gap-16">
                    {secondRow.map((product) => (
                        <ProductCard key={product.title} product={product} translate={translateXReverse} reduceMotion={Boolean(shouldReduceMotion)} />
                    ))}
                </div>
                <div className="mx-auto flex max-w-none flex-row-reverse gap-10 px-4 pb-16 md:gap-16">
                    {thirdRow.map((product) => (
                        <ProductCard key={product.title} product={product} translate={translateX} reduceMotion={Boolean(shouldReduceMotion)} />
                    ))}
                </div>
            </motion.div>
        </div>
    );
}
