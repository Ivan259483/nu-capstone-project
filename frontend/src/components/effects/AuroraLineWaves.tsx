import type { CSSProperties } from "react";

type AuroraLineWavesProps = {
    className?: string;
    opacity?: number;
};

const WAVE_PATHS = [
    "M -120 236 C 16 176 108 288 238 236 S 476 162 604 236 840 314 1014 230 1168 154 1328 224",
    "M -116 282 C 42 218 126 334 264 282 S 488 202 626 282 862 352 1022 276 1166 208 1324 282",
    "M -112 330 C 48 268 154 382 292 330 S 514 250 654 330 876 392 1036 326 1174 266 1320 330",
    "M -108 382 C 36 326 164 438 318 382 S 536 306 680 382 900 444 1046 384 1184 328 1316 382",
    "M -104 436 C 52 374 182 490 340 436 S 562 360 704 436 922 500 1058 438 1194 382 1312 436",
    "M -100 494 C 72 428 204 550 366 494 S 590 416 732 494 948 558 1078 498 1202 448 1308 494",
    "M -96 554 C 82 494 226 606 392 554 S 614 476 760 554 972 618 1092 560 1212 512 1304 554",
    "M -92 614 C 98 560 248 664 418 614 S 640 540 786 614 994 676 1106 622 1222 578 1300 614",
    "M -88 674 C 116 630 270 724 448 674 S 668 600 816 674 1018 734 1124 684 1234 642 1296 674",
    "M -84 732 C 130 698 292 784 476 732 S 696 660 846 732 1044 792 1140 746 1244 708 1292 732",
];

const HALO_PATHS = [
    "M -160 188 C 52 72 220 300 404 190 S 694 40 884 188 1138 332 1360 154",
    "M -150 790 C 84 688 234 888 448 790 S 760 626 956 790 1196 930 1360 768",
];

const clampOpacity = (value: number) => Math.min(0.15, Math.max(0.08, value));

export function AuroraLineWaves({ className = "", opacity = 0.12 }: AuroraLineWavesProps) {
    const rootStyle = {
        opacity: clampOpacity(opacity),
    } satisfies CSSProperties;

    return (
        <div
            aria-hidden="true"
            className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}
            style={rootStyle}
        >
            <style>{`
                @keyframes autospf-aurora-line-drift {
                    0% { transform: translate3d(-2%, -1%, 0) rotate(-7deg) scale(1.08); }
                    100% { transform: translate3d(2%, 1.5%, 0) rotate(-7deg) scale(1.12); }
                }

                @keyframes autospf-aurora-line-counter {
                    0% { transform: translate3d(2%, 0, 0) rotate(8deg) scale(1.04); }
                    100% { transform: translate3d(-2%, -1.5%, 0) rotate(8deg) scale(1.08); }
                }

                .autospf-aurora-line-waves__primary {
                    animation: autospf-aurora-line-drift 24s ease-in-out infinite alternate;
                    transform-origin: 50% 50%;
                }

                .autospf-aurora-line-waves__secondary {
                    animation: autospf-aurora-line-counter 30s ease-in-out infinite alternate;
                    transform-origin: 50% 50%;
                }

                @media (prefers-reduced-motion: reduce) {
                    .autospf-aurora-line-waves__primary,
                    .autospf-aurora-line-waves__secondary {
                        animation: none;
                    }
                }
            `}</style>

            <svg
                className="absolute left-1/2 top-1/2 h-[130%] w-[150%] -translate-x-1/2 -translate-y-1/2"
                viewBox="0 0 1200 900"
                fill="none"
                preserveAspectRatio="xMidYMid slice"
            >
                <defs>
                    <linearGradient id="autospf-aurora-wave-stroke" x1="0" y1="0" x2="1200" y2="900" gradientUnits="userSpaceOnUse">
                        <stop offset="0%" stopColor="#09090b" />
                        <stop offset="32%" stopColor="#a1a1aa" />
                        <stop offset="54%" stopColor="#ffffff" />
                        <stop offset="76%" stopColor="#71717a" />
                        <stop offset="100%" stopColor="#111113" />
                    </linearGradient>
                    <linearGradient id="autospf-aurora-wave-soft" x1="0" y1="900" x2="1200" y2="0" gradientUnits="userSpaceOnUse">
                        <stop offset="0%" stopColor="#18181b" />
                        <stop offset="45%" stopColor="#ffffff" />
                        <stop offset="100%" stopColor="#27272a" />
                    </linearGradient>
                    <radialGradient id="autospf-aurora-wave-fade" cx="50%" cy="50%" r="65%">
                        <stop offset="0%" stopColor="#ffffff" stopOpacity="1" />
                        <stop offset="66%" stopColor="#ffffff" stopOpacity="0.72" />
                        <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
                    </radialGradient>
                    <mask id="autospf-aurora-wave-mask">
                        <rect width="1200" height="900" fill="url(#autospf-aurora-wave-fade)" />
                    </mask>
                </defs>

                <g mask="url(#autospf-aurora-wave-mask)">
                    <g className="autospf-aurora-line-waves__secondary" stroke="url(#autospf-aurora-wave-soft)" strokeLinecap="round">
                        {HALO_PATHS.map((path) => (
                            <path key={path} d={path} strokeWidth="1.15" strokeOpacity="0.36" />
                        ))}
                    </g>

                    <g className="autospf-aurora-line-waves__primary" stroke="url(#autospf-aurora-wave-stroke)" strokeLinecap="round">
                        {WAVE_PATHS.map((path, index) => (
                            <path
                                key={path}
                                d={path}
                                strokeWidth={index % 3 === 0 ? "0.95" : "0.7"}
                                strokeOpacity={index % 2 === 0 ? "0.92" : "0.68"}
                            />
                        ))}
                    </g>
                </g>
            </svg>
        </div>
    );
}

export default AuroraLineWaves;
