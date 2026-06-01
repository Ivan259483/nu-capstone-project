/**
 * Paint Protection Film General Terms and Conditions (customer registration).
 * Keep in sync with frontend/src/content/ppfRegistrationTerms.ts
 */

export const PPF_TERMS_BUSINESS = {
  name: 'AUTOSPF AUTOMOTIVE CAR CARE SERVICE',
  address: 'Marcos Alvarez Ave., Las Piñas City',
  phone: '+639176303116',
} as const;

export const PPF_TERMS_INTRO =
  "Paint protection film is a complicated installation procedure. This document serves to set expectations on your installation, and can serve as a reference point in the future.";

export type PpfTermsSection = { title: string; body: string };

export const PPF_TERMS_SECTIONS: PpfTermsSection[] = [
  {
    title: 'ABOUT PAINT PROTECTION FILM',
    body: "Paint protection film is a film designed to protect your vehicle's paint from future paint chip, scratches and swirl mark. It is applied to the exterior of your vehicle paint. The customer understands that PPF is a sacrificial layer of your vehicle, not a completely invisible or matte layer.",
  },
  {
    title: 'DRYING TIME',
    body: 'Your new paint protection film will take 3–4 weeks to fully cure depending on weather conditions. Do not wash the vehicle for the first 7 days. You may notice some telltale signs of water under the film. If you see some water spots under the film, avoid touching them. They will evaporate. Any air left behind we can easily remove once the film is fully dried.',
  },
  {
    title: 'WARRANTY',
    body: 'PPF installed on your vehicle carries a 5-year warranty against yellowing, cracking, and fading. All PPF will turn yellow eventually; it is the rate at which it turns yellow that the warranty covers. Warranty does NOT cover abuse (such as getting too close with a pressure washer, too much sun exposure, improper maintenance, negligence and cutting/lifting the film), accidents, or from debris. Yes, this film will protect from most rock chips. However, there is a chance that a sharp/large enough object traveling at a high rate of speed could chip or cut the paint protection film (this goes for any type of PPF, even the thickest types). This is not covered under warranty. The film is designed to sacrifice itself to save your paint.',
  },
  {
    title: 'EXISTING ROCK CHIPS',
    body: 'Please note that existing paint chips will appear as PPF imperfections if we install PPF over them. This is especially true on dark or black vehicles, as the dots show as a light gray/white spec. We have installed PPF on 5–7-year-old vehicles without issue, and we have installed it on cars with less than 1000 km that have had a ton of rock chip imperfections, or even some that have come straight from the dealership that already have chips.',
  },
  {
    title: 'BADGE AND TRIM REMOVAL',
    body: 'On certain installations we may have to remove badging or other parts of the car to provide the best experience for you, should you request it. For example, doing a full vehicle wrap or a wrap on the hood usually requires us to remove the hood emblem. All attempts will be made to retain all OEM badges and lettering unless the customer wishes otherwise. We make every attempt to NOT remove badging unless absolutely necessary or requested.',
  },
  {
    title: 'IMPERFECTIONS',
    body: 'We strive for perfection in our installations, but due to the nature of covering an entire vehicle in an adhesive film, it is likely that you will see some degree of dust, contamination, or other debris under the film after installing. We attempt to take every precaution possible to make a near-perfect install, with the understanding that no installation will actually be perfect. Please note that on used vehicles, the more likely it is to have dirt hidden in hard-to-access areas without a complete disassembly of the vehicle (which we do not do). This increases the odds of having slightly more specs of dirt under the film.',
  },
  {
    title: 'EXPECTATIONS',
    body: 'However, if the goal is to find an imperfection in the film, you will find something. We urge clients to consider that this is a protective film and not a completely invisible film with no imperfections.',
  },
  {
    title: 'PAINT',
    body: 'Paint may lift on repainted or factory paint if improperly prepped and painted. This includes dealership touchups prior to delivery, that are not always as evident. AUTOSPF will not be liable in the event that damage does occur during the installation process.',
  },
  {
    title: 'UNSUITABLE SURFACES',
    body: 'On our full body PPF jobs we strive to cover almost every surface. There are some surfaces that may not be suitable for PPF (any textured surface — be it plastic or otherwise), some trivial accent pieces such as grilles or chrome pieces.',
  },
  {
    title: 'LIFTING',
    body: "It is possible, and normal within the industry, to notice some minor lifting that needs to be trimmed at the two-week mark post installation. We make every attempt to avoid this situation but it is normal to have to trim some areas. Don't hesitate to contact us to have us trim these areas.",
  },
  {
    title: 'EXPOSED EDGES AND SEAM',
    body: 'Although we strive to wrap all edges, some cannot be wrapped as some cars or motorcycles have complicated body lines that require multiple pieces seamed together. You may notice some seams in certain areas. Unfortunately, PPF has difficulty bending/stretching over certain areas due to the thickness of the film. Debris build up over time on exposed edges/seams will be more visible on white/light colored vehicles. There is no warranty or reapplication of film due to debris build up.',
  },
  {
    title: 'PHOTO RELEASE',
    body: 'Unless otherwise discussed, bringing your vehicle authorizes AUTOSPF to use photos and videos for YouTube, social media, and advertisements.',
  },
  {
    title: 'PRE-EXISTING DAMAGE / LOST',
    body: "AUTOSPF shall not be held liable for any mechanical condition or pre-existing conditions such as dents, scratches and any other pre-existing damages to the vehicle's interior and exterior nor for the loss or damage of personal belongings.",
  },
  {
    title: 'TERMS AND CONDITIONS OF SERVICE',
    body: 'This Agreement for service is entered into between (client) and AUTOSPF AUTOMOTIVE CARE SERVICE. The above-mentioned parties hereby agree to these terms and conditions and (client) fully understands them.',
  },
];
