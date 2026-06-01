/** Official business details — keep in sync with backend/constants/companyBranding.js */
export const COMPANY_BRANDING = {
  brandName: 'AutoSPF+',
  /** Facebook page title line */
  tagline: 'PPF, Ceramic Coating & Window Tinting',
  /** Cover photo tagline */
  marketingTagline: 'Your trusted shop in Automotive Protection Solution!',
  /** Facebook Intro / bio (plain text) */
  facebookBio:
    'Premium Paint Protection & Detailing. Ceramic Coating, PPF, Nano Ceramic Tint, and Auto Detailing — trusted by car owners for quality, durability, and expert service. Protect your ride with us.',
  category: 'Automotive Service',
  address: 'Marcos Alvarez Ave., Las Piñas City',
  addressShort: 'Marcos Alvarez Ave., Las Piñas City',
  phone: '0917 630 3116',
  phoneTel: '09176303116',
  phoneE164: '+639176303116',
  email: 'autospf2023@gmail.com',
  facebook: 'facebook.com/autospfmain',
  facebookUrl: 'https://www.facebook.com/autospfmain',
  facebookFollowers: '45K+',
  recommendPercent: '100%',
  reviewCount: 68,
  services: [
    'Paint Protection Film',
    'Car Foil',
    'Ceramic Coating',
    'Nano Ceramic Tint',
    'Auto Detailing',
  ] as const,
} as const;

export const companyContactLine = (): string =>
  `${COMPANY_BRANDING.phone} · ${COMPANY_BRANDING.email}`;
