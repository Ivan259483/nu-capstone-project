/**
 * Paint Protection Film General Terms and Conditions (customer registration).
 * Source: AUTOSPF+ printed agreement — keep in sync with shop documents.
 */

export const PPF_TERMS_BUSINESS = {
    name: "AUTOSPF AUTOMOTIVE CAR CARE SERVICE",
    address: "#7380 Marcos Alvarez Ave, Talon V, Las Piñas City",
    phone: "+639176303116",
} as const;

export const PPF_TERMS_INTRO =
    "Paint Protection Film is a precision-installed protective layer for painted surfaces. This brief explains what to expect during curing, what is covered by warranty, and how to care for the film so it can protect your vehicle properly.";

export const PPF_TERMS_HIGHLIGHTS = [
    {
        label: "Curing window",
        value: "3-4 weeks",
        detail: "Avoid washing for the first 7 days while the film settles.",
    },
    {
        label: "Warranty",
        value: "5 years",
        detail: "Coverage applies to yellowing, cracking, and fading under normal use.",
    },
    {
        label: "Follow-up care",
        value: "2-week check",
        detail: "Minor lifting or edge trimming can be reviewed after the film dries.",
    },
    {
        label: "Purpose",
        value: "Sacrificial layer",
        detail: "PPF absorbs daily impact; it is protective, not completely invisible.",
    },
] as const;

export const PPF_TERMS_ACCEPTANCE_NOTE =
    "By accepting, the client confirms that these PPF terms were reviewed and understood before registration continues.";

export type PpfTermsSection = {
    title: string;
    summary: string;
    body: string;
    bullets: string[];
};

export const PPF_TERMS_SECTIONS: PpfTermsSection[] = [
    {
        title: "Protection Scope",
        summary: "PPF is built to protect the paint, not replace careful ownership.",
        body: "Paint Protection Film is applied to exterior painted surfaces to reduce damage from everyday road wear.",
        bullets: [
            "Helps protect against minor paint chips, scratches, and swirl marks.",
            "Acts as a sacrificial layer so the film absorbs impact before the paint does.",
            "May still be visible on close inspection; it is not guaranteed to look completely invisible or matte.",
        ],
    },
    {
        title: "Curing and First Week Care",
        summary: "The film needs time to settle before it reaches its best finish.",
        body: "Your new PPF usually takes 3-4 weeks to fully cure, depending on weather and vehicle use.",
        bullets: [
            "Do not wash the vehicle for the first 7 days after installation.",
            "Small water pockets, haze, or moisture marks under the film can appear during curing.",
            "Avoid pressing or picking at these areas; moisture normally evaporates on its own.",
            "Any remaining air or small touch-up concerns can be addressed once the film is fully dried.",
        ],
    },
    {
        title: "Warranty Coverage",
        summary: "Warranty protects against material concerns under normal conditions.",
        body: "PPF installed by AUTOSPF+ carries a 5-year warranty against yellowing, cracking, and fading.",
        bullets: [
            "All PPF can naturally age over time; the warranty covers abnormal or premature yellowing.",
            "Warranty does not cover abuse, improper maintenance, negligence, cutting, lifting, or accidents.",
            "Avoid pressure washing too close to film edges, especially during the curing period.",
            "Sharp or large road debris can still cut or chip the film; this is considered impact damage, not a warranty defect.",
        ],
    },
    {
        title: "Existing Paint Chips",
        summary: "The film protects what is there; it does not erase what is already underneath.",
        body: "Existing chips, scratches, dents, or paint defects may remain visible after PPF is installed over them.",
        bullets: [
            "On dark vehicles, old rock chips can appear as light gray or white dots under the film.",
            "Even low-mileage or newly delivered vehicles may already have chips or dealer touch-ups.",
            "Pre-installation inspection helps set expectations before the film is applied.",
        ],
    },
    {
        title: "Badges, Trim, and Access",
        summary: "Some parts may need extra access for a cleaner installation.",
        body: "Certain installations may require badge, emblem, or trim removal to improve film placement and edge quality.",
        bullets: [
            "We avoid removing badges unless needed or requested.",
            "OEM badges and lettering will be preserved whenever reasonably possible.",
            "If removal is recommended, we will handle it with care and explain why it helps the finish.",
        ],
    },
    {
        title: "Installation Finish",
        summary: "We aim for a premium finish while being honest about real-world film behavior.",
        body: "We take every precaution to deliver a clean installation, but adhesive film work can still show minor dust, contamination, or small debris under close inspection.",
        bullets: [
            "No PPF installation can be guaranteed to be 100% free of tiny specs or imperfections.",
            "Used vehicles may have dirt hidden in tight areas that are not fully disassembled.",
            "The goal is a clean, professional protective install that performs well in daily use.",
        ],
    },
    {
        title: "Realistic Expectations",
        summary: "PPF is premium protection first, cosmetic perfection second.",
        body: "If someone looks closely enough for imperfections, small details may be found.",
        bullets: [
            "The film is designed to protect the paint from daily road exposure.",
            "It should be viewed as a protective layer, not as a completely invisible finish.",
            "Our team will always work toward the cleanest install possible within the limits of the material and vehicle condition.",
        ],
    },
    {
        title: "Paint Condition",
        summary: "Paint quality affects how safely film can bond and be handled.",
        body: "Factory paint, repainted panels, and dealership touch-ups can react differently during installation or future film removal.",
        bullets: [
            "Weak, improperly prepped, or repainted surfaces may lift.",
            "Some touch-ups are not obvious before work begins.",
            "AUTOSPF+ is not liable for damage caused by pre-existing or weak paint conditions during normal installation work.",
        ],
    },
    {
        title: "Coverage Limits and Surfaces",
        summary: "Not every surface is ideal for PPF adhesion or appearance.",
        body: "For full-body PPF, we aim to cover as many suitable surfaces as possible.",
        bullets: [
            "Textured plastic, some grilles, chrome pieces, and small accent parts may not be suitable for film.",
            "Certain surfaces may be excluded if film adhesion or appearance would be poor.",
            "Coverage will depend on the selected package, vehicle design, and installer assessment.",
        ],
    },
    {
        title: "Lifting and Two-Week Check",
        summary: "Minor edge lifting can happen and is usually easy to address early.",
        body: "It is normal in the PPF industry for a few areas to need trimming or touch-up after the film settles.",
        bullets: [
            "Minor lifting may appear during the first two weeks.",
            "Contact AUTOSPF+ so we can inspect and trim affected areas properly.",
            "Please do not pick, pull, or cut lifted film yourself.",
        ],
    },
    {
        title: "Edges, Seams, and Debris",
        summary: "Complex body lines can require visible seams or exposed edges.",
        body: "We wrap edges whenever possible, but some vehicles require multiple film pieces because of curves, panel gaps, or body design.",
        bullets: [
            "Seams may be visible in certain areas, especially on complex bumpers or motorcycles.",
            "Exposed edges can collect debris over time, more noticeably on white or light-colored vehicles.",
            "Debris buildup on exposed edges or seams is not covered by warranty or automatic reapplication.",
        ],
    },
    {
        title: "Photo and Video Release",
        summary: "Finished work may be documented for portfolio and marketing use.",
        body: "Unless discussed before service, bringing the vehicle authorizes AUTOSPF+ to capture and use photos or videos of the vehicle.",
        bullets: [
            "Media may be used for social media, YouTube, portfolio posts, and advertisements.",
            "If you prefer privacy, please inform the team before the service begins.",
        ],
    },
    {
        title: "Pre-Existing Damage and Belongings",
        summary: "Vehicle condition and personal items should be checked before service.",
        body: "AUTOSPF+ is not liable for mechanical issues, pre-existing damage, or personal belongings left in the vehicle.",
        bullets: [
            "This includes existing dents, scratches, interior wear, exterior damage, and mechanical conditions.",
            "Please remove valuables and personal items before the appointment.",
            "Pre-service documentation helps protect both the client and the shop.",
        ],
    },
    {
        title: "Service Acknowledgement",
        summary: "Acceptance confirms that the client understands the PPF terms before continuing.",
        body: "This service agreement is entered into between the client and AUTOSPF AUTOMOTIVE CAR CARE SERVICE.",
        bullets: [
            "The client confirms that the terms were presented for review.",
            "The client agrees to the expectations, warranty limits, aftercare instructions, and service conditions listed here.",
            "Acceptance of this document allows registration to continue.",
        ],
    },
];
