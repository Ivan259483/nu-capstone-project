/**
 * Bookable ceramic / detailing packages — single source for booking step 1
 * and the customer dashboard services showcase.
 */
export type VehiclePriceKey =
    | "hatchback"
    | "sedan"
    | "midsized"
    | "suv"
    | "pickup"
    | "largesuv"
    | "highend";

export type BookingPackage = {
    id: string;
    name: string;
    /** Short tagline shown under the title */
    duration: string;
    /** Longer customer-facing copy (web + mobile booking). */
    description: string;
    prices: Record<VehiclePriceKey, number>;
    features: string[];
};

export const RAW_SPF_PACKAGES: BookingPackage[] = [
    {
        id: "spf80",
        name: "SPF 80 — Essential",
        duration: "Perfect entry-level protection",
        description:
            "Give your car the protection it deserves with our essential ceramic coating package. We apply a high-quality protective layer that helps shield your paint from scratches, UV rays, dirt, and water so your vehicle stays glossier and easier to wash between visits.",
        prices: { hatchback: 7499, sedan: 7999, midsized: 7999, suv: 8999, pickup: 8499, largesuv: 12999, highend: 14999 },
        features: [
            "3 Layers Graphene Ceramic Coating (Canada)",
            "Graphene Sealant",
            "FREE 1 visit Signature AUTOSPF Carwash",
        ],
    },
    {
        id: "spf89",
        name: "SPF 89 — Advanced",
        duration: "Our most chosen package",
        description:
            "Step up to a deeper, longer-lasting ceramic stack built for daily drivers. Multiple graphene-rich layers add stronger UV and chemical resistance while keeping water beading tight—so your paint looks richer and stays protected through sun, rain, and road grime.",
        prices: { hatchback: 8999, sedan: 9999, midsized: 10999, suv: 11999, pickup: 10999, largesuv: 14999, highend: 17999 },
        features: [
            "4 Layers Graphene Ceramic Coating (Canada)",
            "Graphene Sealant",
            "FREE 1 visit Reboost/Maintenance (save ₱1,500)",
        ],
    },
    {
        id: "spf99",
        name: "SPF 99 — Premium",
        duration: "Maximum protection, best price-to-value",
        description:
            "Our premium coating program uses professional-grade SONAX Profiline layers for exceptional gloss and durability. Ideal if you want showroom depth, easier maintenance, and a documented maintenance path—including scheduled reboost visits to keep the film chemistry performing year after year.",
        prices: { hatchback: 13999, sedan: 13999, midsized: 15999, suv: 16999, pickup: 15999, largesuv: 19999, highend: 22999 },
        features: [
            "4 Layers SONAX Profiline CC EVO (Germany)",
            "FREE Full Recoat After 5 Years",
            "FREE 2 visits Reboost/Maintenance (save ₱3,000)",
        ],
    },
    {
        id: "spf101",
        name: "SPF 101 — Flagship ALL-IN",
        duration: "The complete transformation experience",
        description:
            "The ultimate AutoSPF+ experience: strategic PPF coverage for high-impact areas, flagship ceramic coating, full nano-ceramic tint, and bundled maintenance so your vehicle leaves protected from bumper to glass. Built for owners who want maximum resale appeal and peace of mind in one appointment.",
        prices: { hatchback: 39999, sedan: 39999, midsized: 46999, suv: 46999, pickup: 46999, largesuv: 49999, highend: 49999 },
        features: [
            "PPF Coverage (Hood, Bumper, Mirrors, Stepsils, Door Bowls, Lights)",
            "4 Layers SONAX Profiline CC EVO (Germany)",
            "FREE 5 visits Reboost/Maintenance (save ₱7,500)",
            "FREE Full Recoat After 5 Years",
            "Nano Ceramic Window Tint (Full Wrap — Any Shade)",
            "FREE Undercoating (Rust Proofing)",
        ],
    },
];

/** Labels for price tier selector (matches booking modal). */
export const CUSTOMER_BOOKING_PRICE_TIERS: { key: VehiclePriceKey; label: string }[] = [
    { key: "hatchback", label: "Hatchback" },
    { key: "sedan", label: "Sedan" },
    { key: "midsized", label: "Midsized" },
    { key: "suv", label: "SUV" },
    { key: "pickup", label: "Pick Up" },
    { key: "largesuv", label: "Large SUV / Van" },
    { key: "highend", label: "Highend Sedan" },
];

/** Signature menu items (marketing / booking catalog). */
export const HOMEPAGE_SERVICE_MENU: {
    name: string;
    desc: string;
    price: string;
    duration: string;
    accent: string;
}[] = [
    {
        name: "Exterior Wash",
        desc: "Give your car a fresh face with a careful hand wash, clay-bar prep, and spray wax finish. We lift bonded contamination safely so light reflects evenly again—perfect before events or as regular care between bigger treatments.",
        price: "₱499",
        duration: "~30 min",
        accent: "#ea580c",
    },
    {
        name: "Interior Detail",
        desc: "Restore cabin comfort with deep vacuuming, targeted steam cleaning, leather and trim conditioning, and odor control. Ideal after rainy season commutes or family trips when fabrics and vents need a true reset—not just a wipe-down.",
        price: "₱699",
        duration: "~2 hrs",
        accent: "#ea580c",
    },
    {
        name: "Paint Correction",
        desc: "Remove years of wash swirls, fine scratches, and oxidation using measured machine polishing stages. The goal is clarity and depth before any sealant or coating—so your color looks uniform under sunlight, not hazy or patchy.",
        price: "₱1,499",
        duration: "~4 hrs",
        accent: "#ea580c",
    },
    {
        name: "Ceramic Coating",
        desc: "Give your car the protection it deserves with our PREMIUM COATING service. We apply a high-quality protective layer that shields your paint from scratches, UV rays, dirt, and water damage—keeping your vehicle looking glossy and brand new for longer.",
        price: "₱3,999",
        duration: "~8 hrs",
        accent: "#ea580c",
    },
    {
        name: "Engine Bay Detail",
        desc: "Safely degrease and dress the engine bay so plastics and rubber look tidy without risking sensitive connectors. Great for resale photos, enthusiast meets, or simply knowing the heart of your car matches the shine on the outside.",
        price: "₱799",
        duration: "~1.5 hrs",
        accent: "#ea580c",
    },
    {
        name: "Full Detail Package",
        desc: "Combine exterior wash, interior reset, and paint refinement in one coordinated session. We sequence steps so each layer of cleaning supports the next—delivering a balanced transformation when you want the whole vehicle elevated at once.",
        price: "₱5,499",
        duration: "~6 hrs",
        accent: "#ea580c",
    },
];
