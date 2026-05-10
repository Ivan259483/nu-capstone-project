import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion, type Variants } from 'framer-motion';
import { ArrowRight, Check, Crown, Shield, Star, Zap } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { cn } from '@/lib/utils';
import type { SPFPackage, VehicleType } from './services-catalog-data';

const EASE = [0.16, 1, 0.3, 1] as const;

const priceFlip: Variants = {
    exit: { opacity: 0, y: -8, scale: 0.96, transition: { duration: 0.1 } },
    enter: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.2, ease: EASE } },
};

export interface LuxuryServiceCardProps {
    pkg: SPFPackage;
    index: number;
    vehicleType: VehicleType;
    /** Admin: ring the card for the package being edited */
    adminHighlight?: boolean;
    /** Admin: Book Now is non-navigating (preview only) */
    adminPreview?: boolean;
}

export function LuxuryServiceCard({
    pkg,
    index,
    vehicleType,
    adminHighlight = false,
    adminPreview = false,
}: LuxuryServiceCardProps) {
    const { t } = useLanguage();
    const Icon = pkg.icon;
    const [hovered, setHovered] = useState(false);

    const price = pkg.prices[vehicleType];
    const tintPrice = pkg.tintPrices[vehicleType];
    const originalPrice = pkg.originalPrices?.[vehicleType] ?? (price ? price * pkg.originalPriceMultiplier : null);
    if (price === null) return null;

    const discountLabel =
        pkg.discountBadge?.trim()
        || (originalPrice != null && price != null && originalPrice > price
            ? `${Math.round((1 - price / originalPrice) * 100)}% OFF`
            : '50% OFF');
    const addonLine = pkg.addonLabel?.trim() || '+ Nano Ceramic Window Tint';

    const isFlagship = pkg.flagship;
    const isPopular = pkg.popular;
    const isHighlighted = isPopular || isFlagship;

    return (
        <motion.div
            custom={index}
            initial={{ opacity: 0, y: 40, scale: 0.97 }}
            whileInView={{ opacity: 1, y: 0, scale: 1 }}
            viewport={{ once: true, margin: '-30px' }}
            transition={{ duration: 0.6, ease: EASE, delay: index * 0.08 }}
            whileHover={
                adminPreview
                    ? undefined
                    : { y: -12, scale: 1.025, transition: { duration: 0.35, ease: EASE } }
            }
            onHoverStart={() => setHovered(true)}
            onHoverEnd={() => setHovered(false)}
            className={cn(
                'group relative flex flex-col rounded-[24px] overflow-hidden w-full transition-all duration-300 ease-in-out',
                isHighlighted && 'lg:scale-[1.03] z-10',
                adminHighlight && 'ring-2 ring-amber-400/90 ring-offset-2 ring-offset-[#0a0f1c] z-20 rounded-[24px]',
            )}
            style={{
                willChange: 'transform',
                filter: hovered ? `drop-shadow(0 20px 50px ${pkg.accentFrom}25)` : 'none',
                transition: 'filter 0.4s ease',
            }}
        >
            <motion.div
                className="absolute -inset-[1.5px] rounded-[25px] z-0 pointer-events-none"
                animate={{
                    opacity: hovered ? 1 : isHighlighted ? 0.6 : 0,
                    background: `linear-gradient(135deg, ${pkg.accentFrom}60 0%, transparent 40%, ${pkg.accentTo}40 70%, transparent 100%)`,
                }}
                transition={{ duration: 0.5 }}
            />

            <div
                className="relative z-10 rounded-[24px] flex flex-col h-full overflow-hidden"
                style={{
                    background: `linear-gradient(170deg, 
                        ${hovered ? `${pkg.accentFrom}12` : `${pkg.accentFrom}08`} 0%, 
                        rgba(12,17,29,0.97) 35%, 
                        rgba(8,12,24,0.99) 100%)`,
                    border: `1px solid ${
                        hovered
                            ? `${pkg.accentFrom}45`
                            : isHighlighted
                                ? `${pkg.accentFrom}30`
                                : 'rgba(255,255,255,0.08)'
                    }`,
                    transition: 'all 0.5s ease',
                }}
            >
                <div className="h-[3px] w-full relative overflow-hidden">
                    <motion.div
                        className="absolute inset-0"
                        style={{ background: `linear-gradient(90deg, ${pkg.accentFrom}, ${pkg.accentMid}, ${pkg.accentTo})` }}
                        initial={{ scaleX: 0 }}
                        whileInView={{ scaleX: 1 }}
                        viewport={{ once: true }}
                        transition={{ duration: 1, delay: index * 0.12, ease: EASE }}
                    />
                    <motion.div
                        className="absolute inset-0 w-1/3 bg-gradient-to-r from-transparent via-white/40 to-transparent"
                        animate={{ x: ['-100%', '400%'] }}
                        transition={{ duration: 3, repeat: Infinity, repeatDelay: 5, ease: 'easeInOut' }}
                    />
                </div>

                <div className="px-7 pt-6 pb-0 flex items-center justify-between">
                    <motion.span
                        initial={{ opacity: 0, scale: 0.9 }}
                        whileInView={{ opacity: 1, scale: 1 }}
                        viewport={{ once: true }}
                        transition={{ delay: 0.3 + index * 0.08, type: 'spring', stiffness: 300 }}
                        className="inline-flex items-center gap-1.5 px-3.5 py-[6px] rounded-full text-[9px] font-black uppercase tracking-[0.25em]"
                        style={{
                            background: `linear-gradient(135deg, ${pkg.accentFrom}20, ${pkg.accentTo}10)`,
                            border: `1px solid ${pkg.accentFrom}30`,
                            color: pkg.accentFrom,
                        }}
                    >
                        {isFlagship ? <Crown className="w-3 h-3" /> : isPopular ? <Star className="w-3 h-3 fill-current" /> : <Zap className="w-3 h-3" />}
                        {pkg.badge}
                    </motion.span>

                    <div className="flex items-center gap-1.5 px-3 py-[5px] rounded-full bg-white/[0.06] border border-white/[0.08]">
                        <Shield className="w-2.5 h-2.5 text-white/50" />
                        <span className="text-[9px] font-bold uppercase tracking-[0.15em] text-white/50">{pkg.years}</span>
                    </div>
                </div>

                <div className="px-7 pt-6 pb-5 flex flex-col items-center text-center">
                    <motion.div
                        className="relative w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
                        animate={hovered ? { rotate: [0, -3, 3, 0], scale: 1.08 } : { rotate: 0, scale: 1 }}
                        transition={{ duration: 0.4, ease: EASE }}
                        style={{
                            background: `linear-gradient(145deg, ${pkg.accentFrom}, ${pkg.accentTo})`,
                            boxShadow: hovered
                                ? `0 12px 40px ${pkg.accentFrom}40, 0 0 0 1px ${pkg.accentFrom}20`
                                : `0 6px 25px ${pkg.accentFrom}20`,
                            transition: 'box-shadow 0.5s ease',
                        }}
                    >
                        <Icon className="w-7 h-7 text-white relative z-10" />
                        <div className="absolute inset-0 rounded-2xl bg-gradient-to-tr from-white/25 via-transparent to-transparent" />
                        {isHighlighted && (
                            <motion.div
                                className="absolute -inset-2 rounded-2xl border pointer-events-none"
                                style={{ borderColor: `${pkg.accentFrom}20` }}
                                animate={{ scale: [1, 1.15, 1], opacity: [0.3, 0, 0.3] }}
                                transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                            />
                        )}
                    </motion.div>

                    <h3
                        className="text-[22px] font-black tracking-tight mb-1 transition-all duration-300"
                        style={{ color: hovered ? pkg.accentFrom : '#ffffff' }}
                    >
                        {pkg.label}
                    </h3>
                    <p className="text-[12px] text-white/45 font-medium tracking-wide italic">{pkg.tagline}</p>
                </div>

                <div
                    className="mx-5 sm:mx-6 rounded-2xl p-5 mb-2 relative overflow-hidden"
                    style={{
                        background: `linear-gradient(135deg, ${pkg.accentFrom}08, ${pkg.accentTo}04, rgba(0,0,0,0.2))`,
                        border: `1px solid ${pkg.accentFrom}15`,
                    }}
                >
                    <div
                        className="absolute inset-0 opacity-[0.03]"
                        style={{
                            backgroundImage: `radial-gradient(circle at 20% 50%, ${pkg.accentFrom} 1px, transparent 1px), radial-gradient(circle at 80% 50%, ${pkg.accentTo} 1px, transparent 1px)`,
                            backgroundSize: '20px 20px',
                        }}
                    />

                    <div className="relative z-10">
                        <div className="flex items-center justify-center gap-2.5 mb-3">
                            <span className="text-[10px] text-white/30 uppercase tracking-[0.15em] font-medium">{t('services.startingAt')}</span>
                            <span className="text-xs text-white/30 line-through font-medium">₱{originalPrice?.toLocaleString()}</span>
                            <motion.span
                                initial={{ scale: 0.9 }}
                                whileInView={{ scale: 1 }}
                                animate={{ scale: [1, 1.05, 1] }}
                                viewport={{ once: true }}
                                className="text-[10px] px-2.5 py-[4px] rounded-full font-black uppercase tracking-wider"
                                style={{
                                    background: 'linear-gradient(135deg, #ef4444, #dc2626)',
                                    color: '#fff',
                                    boxShadow: '0 4px 16px rgba(239,68,68,0.4)',
                                }}
                                transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                            >
                                {discountLabel}
                            </motion.span>
                        </div>

                        <AnimatePresence mode="wait">
                            <motion.div
                                key={price}
                                variants={priceFlip}
                                initial="exit"
                                animate="enter"
                                exit="exit"
                                className="flex items-baseline justify-center gap-1"
                            >
                                <span className="text-lg font-bold text-white/50">₱</span>
                                <span
                                    className="text-[52px] font-black tracking-tight leading-none"
                                    style={{
                                        backgroundImage: `linear-gradient(135deg, ${pkg.accentFrom}, ${pkg.accentMid}, ${pkg.accentTo})`,
                                        WebkitBackgroundClip: 'text',
                                        WebkitTextFillColor: 'transparent',
                                        filter: `drop-shadow(0 2px 8px ${pkg.accentFrom}30)`,
                                    }}
                                >
                                    {price?.toLocaleString()}
                                </span>
                                <span className="text-sm font-medium text-white/25 self-end mb-1.5">.00</span>
                            </motion.div>
                        </AnimatePresence>

                        {tintPrice ? (
                            <div
                                className="flex items-center justify-center gap-2 mt-3 pt-3 border-t"
                                style={{ borderColor: `${pkg.accentFrom}20` }}
                            >
                                <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: `${pkg.accentFrom}90` }}>
                                    {addonLine}
                                </span>
                                <AnimatePresence mode="wait">
                                    <motion.span
                                        key={tintPrice}
                                        variants={priceFlip}
                                        initial="exit"
                                        animate="enter"
                                        exit="exit"
                                        className="text-sm font-bold"
                                        style={{ color: pkg.accentFrom }}
                                    >
                                        ₱{tintPrice.toLocaleString()}
                                    </motion.span>
                                </AnimatePresence>
                            </div>
                        ) : null}
                    </div>
                </div>

                <div className="px-5 sm:px-7 pb-5 flex-1">
                    <div className="flex items-center gap-2 mb-4 pt-4 border-t" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                        <div className="h-px flex-1" style={{ background: `linear-gradient(90deg, ${pkg.accentFrom}20, transparent)` }} />
                        <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-white/50">What&apos;s included</span>
                        <div className="h-px flex-1" style={{ background: `linear-gradient(90deg, transparent, ${pkg.accentFrom}20)` }} />
                    </div>
                    <ul className="space-y-2.5">
                        {pkg.features.map((feat, i) => {
                            const isHighlightedFeat = pkg.highlighted.some((h) => feat.includes(h));
                            return (
                                <motion.li
                                    key={feat}
                                    className="flex items-start gap-3"
                                    initial={{ opacity: 0, x: -12 }}
                                    whileInView={{ opacity: 1, x: 0 }}
                                    viewport={{ once: true }}
                                    transition={{ delay: 0.3 + i * 0.06, duration: 0.4, ease: EASE }}
                                >
                                    <div
                                        className="w-5 h-5 rounded-lg flex items-center justify-center shrink-0 mt-0.5 transition-all duration-300"
                                        style={{
                                            background:
                                                hovered || isHighlightedFeat ? `${pkg.accentFrom}22` : 'rgba(255,255,255,0.06)',
                                            border: `1px solid ${
                                                hovered || isHighlightedFeat ? `${pkg.accentFrom}45` : 'rgba(255,255,255,0.10)'
                                            }`,
                                        }}
                                    >
                                        <Check
                                            className="w-3 h-3 transition-colors duration-300"
                                            style={{
                                                color: hovered || isHighlightedFeat ? pkg.accentFrom : 'rgba(255,255,255,0.50)',
                                            }}
                                        />
                                    </div>
                                    <span
                                        className={cn(
                                            'text-[13px] font-medium leading-snug transition-colors duration-300',
                                            isHighlightedFeat ? 'text-white/85' : 'text-white/60',
                                            'group-hover:text-white/80',
                                        )}
                                    >
                                        {feat}
                                    </span>
                                </motion.li>
                            );
                        })}
                    </ul>
                </div>

                <div className="px-5 sm:px-7 pb-6 mt-auto pt-3">
                    {adminPreview ? (
                        <motion.button
                            type="button"
                            disabled
                            className="w-full h-[52px] rounded-xl font-bold text-[13px] flex items-center justify-center gap-2 cursor-default opacity-90 relative overflow-hidden"
                            style={{
                                background: isHighlighted
                                    ? `linear-gradient(135deg, ${pkg.accentFrom}, ${pkg.accentTo})`
                                    : `linear-gradient(135deg, ${pkg.accentFrom}18, ${pkg.accentTo}0a)`,
                                color: isHighlighted ? '#fff' : 'rgba(255,255,255,0.80)',
                                border: isHighlighted ? `1px solid ${pkg.accentFrom}50` : `1px solid ${pkg.accentFrom}25`,
                                letterSpacing: '0.08em',
                            }}
                        >
                            <span className="relative z-10 uppercase tracking-wider">{t('services.bookNow')} · preview</span>
                            <ArrowRight className="w-4 h-4 relative z-10 opacity-60" />
                        </motion.button>
                    ) : (
                        <Link to="/login">
                            <motion.button
                                whileHover={{ scale: 1.03 }}
                                whileTap={{ scale: 0.97 }}
                                className="w-full h-[52px] rounded-xl font-bold text-[13px] flex items-center justify-center gap-2 transition-all duration-300 ease-in-out group/btn cursor-pointer relative overflow-hidden hover:brightness-110"
                                style={{
                                    background: isHighlighted
                                        ? `linear-gradient(135deg, ${pkg.accentFrom}, ${pkg.accentTo})`
                                        : `linear-gradient(135deg, ${pkg.accentFrom}18, ${pkg.accentTo}0a)`,
                                    color: isHighlighted ? '#fff' : 'rgba(255,255,255,0.80)',
                                    border: isHighlighted ? `1px solid ${pkg.accentFrom}50` : `1px solid ${pkg.accentFrom}25`,
                                    boxShadow: isHighlighted ? `0 8px 30px ${pkg.accentFrom}30` : `0 2px 12px ${pkg.accentFrom}08`,
                                    letterSpacing: '0.08em',
                                }}
                            >
                                <span className="absolute inset-0 -translate-x-full group-hover/btn:translate-x-full transition-transform duration-700 bg-gradient-to-r from-transparent via-white/25 to-transparent" />
                                <span className="relative z-10 uppercase tracking-wider">{t('services.bookNow')}</span>
                                <ArrowRight className="w-4 h-4 relative z-10 group-hover/btn:translate-x-1.5 transition-transform duration-300" />
                            </motion.button>
                        </Link>
                    )}
                </div>

                <div
                    className="absolute top-0 right-0 w-56 h-56 rounded-full blur-[100px] pointer-events-none transition-opacity duration-700"
                    style={{
                        background: `radial-gradient(circle, ${pkg.accentFrom}${hovered ? '18' : '08'}, transparent)`,
                        opacity: hovered ? 1 : 0.5,
                    }}
                />
                <div
                    className="absolute bottom-0 left-0 w-40 h-40 rounded-full blur-[80px] pointer-events-none transition-opacity duration-700"
                    style={{
                        background: `radial-gradient(circle, ${pkg.accentTo}${hovered ? '12' : '04'}, transparent)`,
                        opacity: hovered ? 1 : 0.3,
                    }}
                />
            </div>
        </motion.div>
    );
}

export default LuxuryServiceCard;
