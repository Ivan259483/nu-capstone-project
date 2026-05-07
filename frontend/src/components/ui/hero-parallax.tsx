import * as React from "react";
import { motion, useScroll, useTransform, useSpring, type MotionValue } from "framer-motion";
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
const PARALLAX_SPRING = { stiffness: 300, damping: 30, mass: 0.45 };

export type HeroParallaxProps = {
    products: HeroParallaxProduct[];
    title?: React.ReactNode;
    description?: string;
    titleSerif?: boolean;
    className?: string;
};

/**
 * Aceternity UI “Hero Parallax” scroll rig: same transform curves (rotate / translateY / opacity / horizontal drift).
 * @see https://ui.aceternity.com/components/hero-parallax
 */
export function ProductCard({
    product,
    translate,
}: {
    product: HeroParallaxProduct;
    translate: MotionValue<number>;
}) {
    return (
        <motion.div
            style={{ x: translate }}
            whileHover={{ y: -20 }}
            className="group/product relative h-96 w-[30rem] shrink-0 overflow-hidden rounded-xl shadow-2xl"
        >
            <a href={product.link} className="block h-full w-full" aria-label={product.title}>
                <img
                    src={product.thumbnail}
                    alt={product.title}
                    height={600}
                    width={600}
                    className="absolute inset-0 h-full w-full object-cover object-left-top"
                    loading="lazy"
                />
            </a>
            <div className="pointer-events-none absolute inset-0 h-full w-full bg-black opacity-0 transition-opacity duration-300 group-hover/product:opacity-80" />
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
}: HeroParallaxProps) {
    const firstRow = products.slice(0, 5);
    const secondRow = products.slice(5, 10);
    const thirdRow = products.slice(10, 15);

    const ref = React.useRef<HTMLDivElement>(null);
    const { scrollYProgress } = useScroll({
        target: ref,
        offset: ["start start", "end start"],
    });

    const translateX = useSpring(useTransform(scrollYProgress, [0, 1], [0, 1000]), PARALLAX_SPRING);
    const translateXReverse = useSpring(useTransform(scrollYProgress, [0, 1], [0, -1000]), PARALLAX_SPRING);
    const rotateX = useSpring(useTransform(scrollYProgress, [0, 0.2], [15, 0]), PARALLAX_SPRING);
    const opacity = useSpring(useTransform(scrollYProgress, [0, 0.2], [0.2, 1]), PARALLAX_SPRING);
    const rotateZ = useSpring(useTransform(scrollYProgress, [0, 0.2], [20, 0]), PARALLAX_SPRING);
    const translateY = useSpring(useTransform(scrollYProgress, [0, 0.2], [-700, 500]), PARALLAX_SPRING);

    const resolvedTitle = title ?? DEFAULT_TITLE;
    const resolvedDescription = description ?? DEFAULT_DESCRIPTION;

    return (
        <div
            ref={ref}
            className={cn(
                "relative flex min-h-[300vh] flex-col overflow-hidden py-20 antialiased md:py-40",
                "[perspective:1000px] [transform-style:preserve-3d]",
                className,
            )}
            style={TRUSTED_BY_SECTION_BG}
        >
            <TrustedBySectionAmbient />

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
                <div className="mx-auto flex max-w-none flex-row-reverse gap-12 px-4 pb-20 md:gap-20">
                    {firstRow.map((product) => (
                        <ProductCard key={product.title} product={product} translate={translateX} />
                    ))}
                </div>
                <div className="mx-auto flex max-w-none flex-row gap-12 px-4 pb-20 md:gap-20">
                    {secondRow.map((product) => (
                        <ProductCard key={product.title} product={product} translate={translateXReverse} />
                    ))}
                </div>
                <div className="mx-auto flex max-w-none flex-row-reverse gap-12 px-4 pb-24 md:gap-20">
                    {thirdRow.map((product) => (
                        <ProductCard key={product.title} product={product} translate={translateX} />
                    ))}
                </div>
            </motion.div>
        </div>
    );
}
