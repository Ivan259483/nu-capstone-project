/** Official business details for invoices, receipts, and PDFs — keep in sync with backend/constants/companyBranding.js */
export const COMPANY_BRANDING = {
  brandName: 'AutoSPF+',
  tagline: 'PPF, Ceramic Coating & Window Tinting',
  address: 'Marcos Alvarez Ave., Las Piñas City',
  phone: '0917 630 3116',
  email: 'autospf2023@gmail.com',
  facebook: 'facebook.com/autospfmain',
} as const;

export const companyContactLine = (): string =>
  `${COMPANY_BRANDING.phone} · ${COMPANY_BRANDING.email}`;
