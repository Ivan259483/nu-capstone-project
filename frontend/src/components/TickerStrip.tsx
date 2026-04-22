const ITEMS = [
    "CERAMIC COATING",
    "FULL DETAIL",
    "PAINT CORRECTION",
    "PPF INSTALLATION",
    "WINDOW TINTING",
    "ENGINE BAY DETAIL",
    "FULL DETAIL PACKAGE",
    "EXTERIOR WASH",
];

export default function TickerStrip() {
    const doubled = [...ITEMS, ...ITEMS];

    return (
        <div
            className="overflow-hidden w-full py-2.5 relative"
            style={{
                background: "linear-gradient(90deg, #0a0a0a 0%, #111108 50%, #0a0a0a 100%)",
                borderTop: "1px solid rgba(212,175,55,0.18)",
                borderBottom: "1px solid rgba(212,175,55,0.18)",
            }}
        >
            <div className="flex w-max items-center gap-0 animate-ticker">
                {doubled.map((item, i) => (
                    <span key={i} className="flex items-center">
                        <span
                            className="font-black uppercase tracking-widest text-sm italic whitespace-nowrap px-6"
                            style={{ color: "#d4af37", letterSpacing: "0.18em" }}
                        >
                            {item}
                        </span>
                        <span
                            className="text-xs select-none"
                            style={{ color: "#E8650A", opacity: 0.8 }}
                        >
                            ◆
                        </span>
                    </span>
                ))}
            </div>
        </div>
    );
}
