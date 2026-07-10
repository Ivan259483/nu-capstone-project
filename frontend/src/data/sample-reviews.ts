export type DemoReviewSource = "sample";

export type DemoReview = {
    id: string;
    rating: 3 | 4 | 5;
    name: string;
    vehicle: string;
    service: string;
    comment: string;
    date: string;
    isDemo: true;
    source: DemoReviewSource;
};

type ServiceReviewSet = {
    service: string;
    comments: string[];
};

export const DEMO_REVIEW_COUNT = 960;
export const REVIEWS_PER_TESTIMONIAL_PAGE = 6;

export const demoReviewSeedMeta = {
    purpose: "UI testing only",
    count: DEMO_REVIEW_COUNT,
    isDemo: true,
    source: "sample" as DemoReviewSource,
    disclaimer:
        "Sample-only review seed data. Do not present these comments as verified real customer reviews unless replaced by real customer feedback.",
};

const displayNames = [
    "Dianne",
    "Marco",
    "J.M.",
    "Rica",
    "Paolo",
    "Alyssa",
    "Renz",
    "Kaye",
    "Miguel",
    "Bea",
    "Chris",
    "Nico",
    "Mara",
    "Leo",
    "Trish",
    "Carlo",
    "A.C.",
    "Jonas",
    "Mika",
    "Ramon",
    "Ella",
    "R.V.",
    "Francis",
    "Gelo",
    "Mitch",
    "Tina",
    "Luis",
    "Ken",
    "Jessa",
    "Bryan",
    "Ian",
    "Sam",
    "Pat",
    "Celine",
    "Arvin",
    "Migs",
    "Lara",
    "Rhea",
    "Daniel",
    "Kris",
    "Sofia",
    "Ralph",
    "Maui",
    "Lance",
    "Gia",
    "Brix",
    "Nina",
    "Ced",
];

const vehicles = [
    "Toyota Fortuner Owner",
    "Honda Civic Owner",
    "Hyundai Tucson Owner",
    "Mitsubishi Montero Owner",
    "Ford Ranger Owner",
    "Toyota Vios Owner",
    "Honda City Owner",
    "Mazda CX-5 Owner",
    "Subaru Forester Owner",
    "Nissan Terra Owner",
    "Toyota Hilux Owner",
    "Mitsubishi Xpander Owner",
    "Kia Stonic Owner",
    "Hyundai Accent Owner",
    "Toyota Corolla Cross Owner",
    "Honda HR-V Owner",
    "Mazda 3 Owner",
    "Isuzu mu-X Owner",
    "Suzuki Jimny Owner",
    "Geely Coolray Owner",
    "BMW 3 Series Owner",
    "Mercedes-Benz C-Class Owner",
    "Audi Q3 Owner",
    "Porsche Macan Owner",
    "Lexus NX Owner",
    "Toyota Camry Owner",
    "Honda CR-V Owner",
    "Nissan Navara Owner",
    "Ford Everest Owner",
    "Mitsubishi Mirage Owner",
    "Toyota Raize Owner",
    "Kia Carnival Owner",
    "Hyundai Stargazer Owner",
    "MG ZS Owner",
    "Volkswagen T-Cross Owner",
    "Chevrolet Trailblazer Owner",
];

const serviceReviewSets: ServiceReviewSet[] = [
    {
        service: "Paint Correction",
        comments: [
            "May swirls na visible sa sunlight dati. After paint correction, mas malinis na yung reflection at hindi mukhang pagod yung paint.",
            "I had light haze on the hood and roof. They explained what can be corrected and what should not be forced. Good result, realistic yung expectation.",
            "Akala ko repaint na kailangan. Na-improve nila yung gloss without overpromising. May konting deep marks pa, pero much better na tingnan.",
            "Okay yung paint correction nila. Hindi minadali, and the black paint looks deeper now. Medyo matagal lang pickup pero worth it.",
            "Nagpa-correct ako ng daily car, hindi show car. Sakto yung finish, clean and glossy pero hindi OA yung promise.",
            "May mga dating towel marks sa doors. Ngayon hindi na siya halata unless sobrang lapit tignan. Maayos yung handoff.",
            "Good improvement sa hood and fenders. They showed before and after under the light, kaya clear kung ano talaga naayos.",
            "Paint looked dull before. Mas buhay na yung kulay ngayon. Hindi perfect lahat ng scratches, but honest sila from the start.",
        ],
    },
    {
        service: "Ceramic Coating",
        comments: [
            "After ceramic coating, mas madali linisin yung kotse. Hindi ko masasabi na magic, pero ramdam yung difference after ulan.",
            "Gloss is nice and the surface feels slick. Staff gave simple care reminders, hindi overwhelming pakinggan.",
            "Nagpa-ceramic ako bago rainy season. Beading is good so far. Sana tumagal, pero initial result is clean.",
            "The coating finish looks premium. I liked that they did prep work first instead of applying right away.",
            "Mas sharp yung shine ng paint after coating. Booking was smooth, and updates were enough without being makulit.",
            "First time ko mag ceramic coating. They explained maintenance wash schedule in plain terms. Okay yung experience.",
            "Hindi naman sobrang bilis gawin, pero I prefer that. Pagkuha ko, pantay yung gloss at walang oily residue.",
            "Good coating job for my SUV. May konting waiting sa release, pero maayos yung final check.",
        ],
    },
    {
        service: "PPF / Paint Protection Film",
        comments: [
            "Nagpa-PPF ako sa high-touch areas. Clean yung edges and hindi halata from normal distance.",
            "The film install looks neat. May small bubble na nawala after a few days like they said, so okay naman.",
            "PPF on the bumper and hood came out clean. I appreciated the explanation on what panels are worth protecting.",
            "Hindi mukhang makapal yung film. Close inspection lang makikita yung edge. Good for daily use.",
            "I had PPF installed before a long drive. The handoff notes were clear, lalo na yung curing reminders.",
            "Maingat sila sa corners. May one area na pina-check ko, inayos naman before release.",
            "Good protection option for the front bumper. Hindi nila pinilit full car, they suggested practical coverage.",
            "The PPF finish is clean and subtle. No fake promises, just proper care instructions.",
        ],
    },
    {
        service: "Interior Detailing",
        comments: [
            "Interior was dusty and may amoy from daily use. After detailing, fresh na ulit without strong perfume smell.",
            "Seats and console looked cleaner. Hindi perfect yung old stain sa mat, pero sinabi naman nila beforehand.",
            "Nagpa-interior detail ako after beach trip. Sand in small areas was mostly removed. Big improvement.",
            "Good interior work. Dashboard, vents, cupholders, and door pockets were cleaner than my usual car wash.",
            "May toddler mess sa back seat. They cleaned it well and did not make me feel judged, haha.",
            "Leather felt cleaner but not greasy. I like that the finish stayed natural looking.",
            "Interior detail was worth it for an older car. Hindi brand new, pero mas maaliwalas gamitin.",
            "Okay yung cabin cleaning. May konting damp smell at first, nawala din after airing out.",
        ],
    },
    {
        service: "Full Detailing",
        comments: [
            "Full detail took time, pero kita yung difference inside and outside. Mas enjoyable gamitin yung car after.",
            "Exterior gloss and interior cleaning were both good. Hindi rushed yung release, they walked me around the car.",
            "Nagpa-full detail before selling the car. Presentation improved a lot, lalo na yung interior.",
            "Good all-around detailing. May ilang deep marks na hindi nawala, but overall clean and polished yung look.",
            "I liked the complete service. Paint, trims, glass, and cabin all felt refreshed.",
            "Full detailing made the car feel maintained again. Hindi siya exaggerated, just properly cleaned.",
            "Medyo matagal pero expected naman. Updates were clear and the final result looked neat.",
            "Great for my family car. Exterior shine improved and the inside smelled clean, not chemical-heavy.",
        ],
    },
    {
        service: "Maintenance Wash",
        comments: [
            "Maintenance wash was quick and careful. Hindi yung typical madaliang punas lang.",
            "Good wash for coated cars. They used the right process and avoided harsh wiping.",
            "Simple service but done properly. Paint looked clean without new towel marks.",
            "Nagpa-maintenance wash lang ako, pero maayos pa rin yung attention sa wheels and glass.",
            "Okay for regular upkeep. Staff reminded me not to use random shampoo at home.",
            "The wash was clean and organized. Waiting time was reasonable that day.",
            "Hindi flashy, pero consistent. Good option between bigger detailing sessions.",
            "Maintenance wash kept the coating looking fresh. No hard sell after the service.",
        ],
    },
    {
        service: "Scratch & Watermark Removal",
        comments: [
            "Watermarks on the glass and paint were bothering me. Hindi lahat nawala, pero malaking bawas.",
            "May light scratch sa door. After the service, hindi na siya halata unless hanapin mo talaga.",
            "Good correction for watermarks. They were honest about which marks were already etched.",
            "Nagpa-remove ako ng water spots after being parked outside. Mas malinaw na ulit yung finish.",
            "The scratch removal helped a lot. Hindi nila sinabi na 100% mawawala, which I appreciated.",
            "May marks from tree sap and water. Cleaner now, and the paint feels smoother.",
            "Okay yung result sa hood watermarks. Some deeper spots remain, pero acceptable na.",
            "Small scratches near the handle improved. Good job for a practical fix.",
        ],
    },
    {
        service: "Booking Experience",
        comments: [
            "Booking was easy. I picked a schedule and got confirmation without too much back and forth.",
            "Maayos yung booking flow. Clear yung service options and hindi nakakalito yung steps.",
            "I had to reschedule once and they handled it properly. No drama, just a new slot.",
            "The booking page was straightforward. I liked seeing the service details before submitting.",
            "Nag-book ako late night, then got a clear update the next day. Smooth enough.",
            "Good booking experience overall. May konting wait sa confirmation, pero okay naman.",
            "Madali maglagay ng vehicle details. Less explaining when I arrived at the shop.",
            "The schedule reminders helped. Hindi ko na kailangan magtanong ulit kung confirmed ba.",
        ],
    },
    {
        service: "Live Tracking Experience",
        comments: [
            "Live tracking helped me see where the car was in the process. Hindi na ako nangulit sa chat.",
            "Useful yung status updates. Simple lang, pero enough to know kung nasa detailing na or ready.",
            "I liked the tracker because I was at work while the car was being serviced.",
            "The live tracker made the wait easier. May times na delayed update, but still helpful.",
            "Good feature. Nakikita ko yung progress and photos without asking every hour.",
            "Tracking was clear and practical. Hindi fancy lang, useful talaga habang ginagawa yung car.",
            "May update nung ready for pickup, which saved me a call.",
            "The tracker gave confidence na gumagalaw yung job, not just waiting somewhere.",
        ],
    },
    {
        service: "Staff Communication",
        comments: [
            "Staff explained the options without making it feel like a sales pitch. Appreciated that.",
            "Maayos kausap. They told me what was realistic for the paint condition.",
            "Communication was good. Hindi sobrang daming message, pero enough updates.",
            "They answered my questions about coating maintenance in simple terms.",
            "Clear yung estimate and timeline. May small delay but they informed me early.",
            "Good staff communication. I felt comfortable leaving the car there.",
            "Hindi sila defensive when I asked about one area. They checked it and explained properly.",
            "Professional but casual kausap. Madaling maintindihan yung recommendations.",
        ],
    },
    {
        service: "Pickup & Payment Experience",
        comments: [
            "Pickup was organized. They showed the finished areas before payment, which I liked.",
            "Payment was smooth and the receipt was sent properly. No confusion sa balance.",
            "Pag-pickup ko, ready na yung car and the handoff was quick.",
            "Good pickup flow. They explained aftercare before releasing the vehicle.",
            "GCash payment was reviewed and confirmed without issue. Clear yung instructions.",
            "The final check was helpful. I saw the work before completing payment.",
            "Pickup took a few extra minutes, but it was because they were checking the finish.",
            "Payment and release were straightforward. No surprise charges on my visit.",
        ],
    },
    {
        service: "Before & After Result",
        comments: [
            "Before and after difference was obvious but still realistic. The car looked cared for, not artificially shiny.",
            "Photos helped me compare the result. Mas kita yung improvement sa hood and side panels.",
            "I liked seeing the before and after because I forgot how dull the paint was.",
            "The final look was clean. Hindi perfect-showroom, pero very good for a daily car.",
            "Before, the paint looked flat. After, mas may depth na yung color.",
            "Satisfying yung transformation. Not exaggerated, just a cleaner and glossier finish.",
            "The before and after view made the service feel worth it.",
            "Result was better than my usual wash. You can see the care in the small areas.",
        ],
    },
];

const naturalClosers = [
    "",
    " Balik ako for maintenance wash.",
    " Sakto lang yung explanation, hindi confusing.",
    " Good for people na daily gamit ang car.",
    " May konting wait, pero okay yung result.",
    " I would book again if same quality.",
    " Hindi perfect lahat, pero honest yung team.",
    " Mas confident na ako gamitin ulit yung car.",
    " Simple update lang pero helpful.",
    " Sulit for the condition of the car.",
    " I liked the calm handoff after the service.",
    " Hindi siya rushed tingnan.",
];

function ratingForIndex(index: number): DemoReview["rating"] {
    const n = index + 1;
    if (n % 41 === 0) return 3;
    if (n % 9 === 0 || n % 16 === 0) return 4;
    return 5;
}

function dateForIndex(index: number): string {
    const start = Date.UTC(2025, 0, 8);
    const offsetDays = (index * 5) % 520;
    return new Date(start + offsetDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function commentForIndex(index: number, reviewSet: ServiceReviewSet): string {
    const base = reviewSet.comments[Math.floor(index / serviceReviewSets.length) % reviewSet.comments.length];
    const closer = naturalClosers[(index + reviewSet.service.length) % naturalClosers.length];
    return `${base}${closer}`.trim();
}

export const demoReviews: DemoReview[] = Array.from({ length: DEMO_REVIEW_COUNT }, (_, index) => {
    const reviewSet = serviceReviewSets[index % serviceReviewSets.length];

    return {
        id: `review_${String(index + 1).padStart(3, "0")}`,
        rating: ratingForIndex(index),
        name: displayNames[index % displayNames.length],
        vehicle: vehicles[(index * 7) % vehicles.length],
        service: reviewSet.service,
        comment: commentForIndex(index, reviewSet),
        date: dateForIndex(index),
        isDemo: true,
        source: "sample",
    };
});

export const featuredDemoReviews = demoReviews
    .filter((review) => review.rating === 5 && review.comment.length >= 110)
    .slice(0, 8);
