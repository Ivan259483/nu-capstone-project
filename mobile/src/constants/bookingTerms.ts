/**
 * Booking flow — Terms & Conditions (sync with frontend `src/lib/booking-terms.ts`).
 */
export const BOOKING_TERMS_DOCUMENT_TITLE = 'AutoSPF+ Terms & Conditions';

export const BOOKING_TERMS_INTRO =
  'By booking a service with AutoSPF+, you enter a service relationship governed by the policies below. Please read each section before you accept.';

export const BOOKING_TERMS_SUMMARY: string[] = [
  'You confirm that service, vehicle, and schedule details are accurate; we perform booked work with reasonable care.',
  'A reservation fee secures your slot and applies toward service; the balance is due at the shop unless agreed otherwise.',
  'Cancel or reschedule as early as possible; late cancellations or no-shows may affect fees per our policy.',
  'Liability limits, privacy use of your data, and dispute handling are set out in the full terms below.',
];

export const BOOKING_TERMS_LAST_UPDATED = 'May 7, 2026';
export const BOOKING_TERMS_VERSION = '1.0';

export type BookingTermsSection = {
  id: string;
  title: string;
  body: string;
};

export const BOOKING_TERMS_SECTIONS: BookingTermsSection[] = [
  {
    id: 'service',
    title: '1. Service Agreement',
    body: 'By booking, you agree that the service description, vehicle information, and schedule you provide are accurate. AutoSPF+ will perform the selected detailing or protection services with reasonable skill and care. Estimated durations are indicative; complex vehicles or conditions may require additional time. You authorize us to perform the booked work and to contact you using the details you supplied.',
  },
  {
    id: 'payment',
    title: '2. Payment Policy',
    body: 'A downpayment or reservation fee is required to secure your slot, as shown at checkout. This amount is applied toward your service unless otherwise stated. The remaining balance is due at the shop on the day of service unless a different written arrangement applies. Payments are non-reversible once processing has started except where required by law or at AutoSPF+’s discretion for verified billing errors.',
  },
  {
    id: 'cancellation',
    title: '3. Cancellation Policy',
    body: 'Cancellations or reschedule requests must be made as early as possible through the same channel you used to book. Late cancellations or no-shows may result in forfeiture of the reservation fee or a rebooking fee, consistent with our posted policy at the time of booking. We may waive fees in cases of documented emergencies, solely at our discretion.',
  },
  {
    id: 'liability',
    title: '4. Liability',
    body: 'AutoSPF+ is not liable for indirect, incidental, or consequential damages, including lost profits or third-party claims, except where prohibited by law. Our liability for any claim arising from the service is limited to the amount you paid for the specific booking in dispute. Pre-existing vehicle damage, aftermarket parts, or undisclosed conditions may affect results; you remain responsible for disclosing material facts about your vehicle.',
  },
  {
    id: 'privacy',
    title: '5. Privacy Policy',
    body: 'Your contact details, vehicle data, and booking history are used to deliver the service, send confirmations, and improve operations. We do not sell your personal information. Technical logs and payment proofs may be retained for accounting, fraud prevention, and dispute resolution. For full privacy practices, refer to our published Privacy Policy on the website or ask staff for a copy.',
  },
];
