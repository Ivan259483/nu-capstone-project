/**
 * Service-Specific Configuration for AutoSPF+ Workflow
 * Dynamic checklists, waivers, and QC items per serviceCategory.
 */

export type ServiceCategory = 
  | 'ceramic_coating' | 'ppf' | 'tint' | 'undercoat' 
  | 'repaint' | 'latero' | 'full_exterior_ppf' | 'partial_ppf';

export const SERVICE_CATEGORIES: { value: ServiceCategory; label: string }[] = [
  { value: 'ceramic_coating', label: 'Ceramic Coating' },
  { value: 'ppf', label: 'PPF (Paint Protection Film)' },
  { value: 'tint', label: 'Window Tinting' },
  { value: 'undercoat', label: 'Undercoating' },
  { value: 'repaint', label: 'Repaint' },
  { value: 'latero', label: 'Latero' },
  { value: 'full_exterior_ppf', label: 'Full Exterior PPF' },
  { value: 'partial_ppf', label: 'Partial PPF' },
];

// ═══════ INGRESS CHECKLISTS (Step 2) ═══════
export const INGRESS_CHECKLISTS: Record<string, { category: string; name: string }[]> = {
  _default: [
    { category: 'Pre-Assessment', name: 'Conduct vehicle pre-assessment before any detailing service' },
    { category: 'Pre-Assessment', name: 'Document visible exterior, interior, glass, trim, wheel, and panel concerns' },
    { category: 'Pre-Assessment', name: 'Confirm pre-existing damage or issues with the customer before service proper' },
    { category: 'Vehicle Inspection', name: 'Verify vehicle matches job order (model, color, plate)' },
    { category: 'Vehicle Inspection', name: 'Check dashboard warning lights' },
    { category: 'Vehicle Inspection', name: 'Record odometer reading' },
    { category: 'Vehicle Inspection', name: 'Confirm fuel level' },
    { category: 'Vehicle Inspection', name: 'Verify no personal belongings left' },
    { category: 'Vehicle Inspection', name: 'Check existing key scratches / dents' },
    { category: 'Job Validation', name: 'Confirm customer name and contact' },
    { category: 'Job Validation', name: 'Confirm service type matches booking' },
    { category: 'Job Validation', name: 'Verify payment status' },
    { category: 'Customer Expectation', name: 'Explain estimated timeline to customer' },
    { category: 'Customer Expectation', name: 'Discuss any potential additional work' },
    { category: 'Customer Expectation', name: 'Confirm drop-off / pick-up arrangement' },
  ],
  ceramic_coating: [
    { category: 'Ceramic Prep', name: 'Check body paint condition (swirls, oxidation)' },
    { category: 'Ceramic Prep', name: 'Assess need for paint correction before coating' },
    { category: 'Ceramic Prep', name: 'Verify previous coating status (if recoat)' },
    { category: 'Ceramic Prep', name: 'Note any fresh paint or bodywork' },
  ],
  ppf: [
    { category: 'PPF Prep', name: 'Inspect coverage areas for chips / dents' },
    { category: 'PPF Prep', name: 'Verify if partial or full PPF coverage' },
    { category: 'PPF Prep', name: 'Check panel gaps and edges condition' },
    { category: 'PPF Prep', name: 'Assess complex curves (bumpers, mirrors)' },
  ],
  tint: [
    { category: 'Tint Prep', name: 'Check existing window film status' },
    { category: 'Tint Prep', name: 'Verify defogger lines condition (rear window)' },
    { category: 'Tint Prep', name: 'Measure window dimensions if custom cut needed' },
    { category: 'Tint Prep', name: 'Note any RFID stickers on windshield' },
  ],
  undercoat: [
    { category: 'Undercoat Prep', name: 'Inspect undercarriage for rust / corrosion' },
    { category: 'Undercoat Prep', name: 'Check for loose panels or shields' },
    { category: 'Undercoat Prep', name: 'Assess exhaust system heat shields' },
  ],
  repaint: [
    { category: 'Repaint Prep', name: 'Photograph affected panels' },
    { category: 'Repaint Prep', name: 'Check for filler or previous repaint' },
    { category: 'Repaint Prep', name: 'Confirm color code and match' },
  ],
  full_exterior_ppf: [
    { category: 'Full PPF Prep', name: 'Full body panel inspection' },
    { category: 'Full PPF Prep', name: 'Document every existing imperfection' },
    { category: 'Full PPF Prep', name: 'Check paint thickness readings' },
    { category: 'Full PPF Prep', name: 'Verify panel alignment for wrapping' },
  ],
  partial_ppf: [
    { category: 'Partial PPF Prep', name: 'Confirm specific coverage areas with customer' },
    { category: 'Partial PPF Prep', name: 'Inspect target panels for defects' },
  ],
  latero: [
    { category: 'Latero Prep', name: 'Inspect body side panels' },
    { category: 'Latero Prep', name: 'Check for deep scratches or gouges' },
  ],
};

// ═══════ WAIVER TERMS (Step 4) ═══════
export const WAIVER_TERMS: Record<string, string[]> = {
  _default: [
    'I understand that pre-existing damage, scratches, or imperfections will not be covered by the service warranty.',
    'I agree that the estimated completion time may change based on work conditions.',
    'I authorize AutoSPF+ to move or operate my vehicle within the facility as needed for the service.',
    'I confirm that I have removed all personal valuables from the vehicle.',
  ],
  ceramic_coating: [
    'I understand that ceramic coating requires a minimum 24-hour curing time and the vehicle must not be washed during this period.',
    'I acknowledge that the coating does not make the vehicle scratch-proof, only scratch-resistant.',
    'I understand maintenance washes are required every 2 weeks for optimal coating longevity.',
    'I agree that exposure to harsh chemicals (acid, alkaline cleaners) will void the coating warranty.',
    'I acknowledge that the coating must be inspected and maintained as per the AutoSPF+ aftercare guide.',
  ],
  ppf: [
    'I understand that PPF may show minor edge lifting on complex curves, which is considered normal behavior.',
    'I acknowledge that small bubbles may appear initially and will dissipate within 2-4 weeks.',
    'I agree that PPF does not prevent dents or structural damage — it protects paint surfaces only.',
    'I understand that improper pressure washing or using abrasive tools can damage the film.',
    'I acknowledge that aftermarket or non-OEM paint may not bond properly with PPF.',
  ],
  tint: [
    'I understand there is a mandatory 3-5 day window roll-down restriction after tint installation.',
    'I acknowledge that water bubbles during the curing period are normal and will disappear.',
    'I understand that RFID tollway stickers may need repositioning after windshield tinting.',
    'I agree that the rear window defogger lines may show slight visibility under certain lighting conditions.',
    'I acknowledge that tint shade selection is final once applied and removal costs are separate.',
  ],
  undercoat: [
    'I understand that undercoating requires 24-48 hours to fully cure.',
    'I acknowledge that undercoating does not repair existing rust — it prevents further corrosion.',
    'I agree that exhaust-adjacent areas may emit a temporary odor during the first heat cycle.',
  ],
  repaint: [
    'I understand that color matching is done on a best-effort basis using manufacturer codes.',
    'I acknowledge that curing takes 7-14 days, during which the vehicle should not be waxed.',
    'I agree that differences in paint appearance may occur due to aging of surrounding panels.',
  ],
  full_exterior_ppf: [
    'I understand that full exterior PPF installation takes 3-5 working days.',
    'I acknowledge that minor seam lines at panel edges are normal for full coverage.',
    'I agree that existing paint imperfections will be encapsulated under the film.',
    'I understand that PPF self-healing takes effect at temperatures above 60°C.',
  ],
  partial_ppf: [
    'I understand that partial PPF covers only the agreed-upon panels.',
    'I acknowledge edge lines will be visible where protected and unprotected areas meet.',
  ],
  latero: [
    'I understand that latero work addresses side-body panel damage only.',
    'I acknowledge that results depend on the severity of existing damage.',
  ],
};

// ═══════ SERVICE CHECKLISTS (Step 5) ═══════
export const SERVICE_CHECKLISTS: Record<string, string[]> = {
  _default: [
    'Pre-wash / Decontamination',
    'Clay bar treatment',
    'Surface preparation',
    'Product application',
    'Quality inspection (mid-process)',
    'Final detailing / cleanup',
  ],
  ceramic_coating: [
    'Full vehicle wash and decontamination',
    'Iron remover / fallout removal',
    'Clay bar treatment',
    'Paint correction — Level 1 (machine polish)',
    'Paint correction — Level 2 (fine polish)',
    'IPA wipe-down (surface prep)',
    'Ceramic coating base layer application',
    'Ceramic coating top layer application',
    'Infrared curing (if applicable)',
    'Trim and glass coating',
    'Final inspection under LED lights',
  ],
  ppf: [
    'Full vehicle wash and decontamination',
    'Surface clay bar treatment',
    'Pattern cutting / alignment on panels',
    'PPF application — front bumper',
    'PPF application — hood',
    'PPF application — fenders',
    'PPF application — mirrors',
    'PPF application — door edges / cups',
    'Squeegee and heat forming',
    'Edge sealing and trimming',
    'Final inspection for bubbles / debris',
  ],
  tint: [
    'Clean all window surfaces',
    'Remove existing film (if applicable)',
    'Cut film to window templates',
    'Apply tint — front windshield (if applicable)',
    'Apply tint — front side windows',
    'Apply tint — rear side windows',
    'Apply tint — rear window',
    'Squeegee air and water bubbles',
    'Edge trimming and final seal',
    'Verify visibility and shade consistency',
  ],
  undercoat: [
    'Lift vehicle and inspect undercarriage',
    'Pressure wash underside',
    'Rust treatment (if applicable)',
    'Mask off exhaust and heat shields',
    'Apply undercoat layer 1',
    'Allow flash time',
    'Apply undercoat layer 2',
    'Lower vehicle and final inspection',
  ],
  repaint: [
    'Sand affected panels',
    'Apply primer',
    'Color base coat application',
    'Clear coat application',
    'Wet sand and buff',
    'Final polish and blend',
  ],
  full_exterior_ppf: [
    'Full vehicle wash and decontamination',
    'Clay bar all panels',
    'Pattern preparation — all panels',
    'PPF application — hood + fenders',
    'PPF application — doors',
    'PPF application — quarter panels',
    'PPF application — trunk / tailgate',
    'PPF application — roof',
    'PPF application — bumpers',
    'PPF application — mirrors + handles',
    'Edge sealing — all panels',
    'Full body inspection for debris / bubbles',
  ],
  partial_ppf: [
    'Clean target panels',
    'Clay bar treatment on target panels',
    'Pattern cutting for target areas',
    'PPF application on selected panels',
    'Edge sealing and trimming',
    'Inspection for bubbles / debris',
  ],
  latero: [
    'Sand affected side panels',
    'Apply body filler (if needed)',
    'Prime and seal',
    'Spot paint application',
    'Clear coat and blend',
    'Final buff and polish',
  ],
};

// ═══════ QC CHECKLISTS (Step 6) ═══════
export const QC_CHECKLISTS: Record<string, string[]> = {
  _default: [
    'Surface is smooth and free from debris',
    'No visible scratches or swirl marks',
    'Even finish on all treated areas',
    'Edges properly sealed and finished',
    'No water spots or smudges',
    'Vehicle interior is clean and undamaged',
  ],
  ceramic_coating: [
    'Coating is evenly applied — no high spots',
    'Water beading test — proper hydrophobic behavior',
    'No streaks or hazing visible under LED inspection',
    'Glass and trim coated evenly',
    'No product residue on rubber or trim',
    'Gloss level is uniform across all panels',
    'Infrared curing completed (if applicable)',
  ],
  ppf: [
    'No air bubbles trapped under film',
    'No debris or dust particles under film',
    'Film edges are properly wrapped and sealed',
    'No edge lifting on any panel',
    'Self-healing works properly (heat test)',
    'Film is aligned correctly with panel lines',
    'No orange peel from incorrect stretching',
  ],
  tint: [
    'Shade is consistent across all windows',
    'No air bubbles visible',
    'No water pockets between glass and film',
    'Film edges are cleanly trimmed',
    'Defogger lines not damaged (rear window)',
    'Visibility from inside is acceptable',
    'No dust particles trapped under film',
  ],
  undercoat: [
    'Complete coverage on undercarriage',
    'No drips or uneven application',
    'Exhaust and brake components not coated',
    'Even thickness throughout',
  ],
  repaint: [
    'Color match is acceptable',
    'No runs or sags in clear coat',
    'Blend line is invisible',
    'Orange peel removed',
    'Surface is buffed to factory finish',
  ],
  full_exterior_ppf: [
    'All panels covered without gaps',
    'No air bubbles on any panel',
    'Film edges wrapped and sealed on all panels',
    'No debris under film',
    'Panel alignment is correct',
    'Self-healing test passed',
  ],
  partial_ppf: [
    'Target panels fully covered',
    'No bubbles or debris under film',
    'Edges properly trimmed and sealed',
    'Transition line is clean',
  ],
  latero: [
    'Surface is smooth and even',
    'Color match is acceptable',
    'No visible filler lines',
    'Clear coat is even',
  ],
};

// ═══════ AFTERCARE CHECKLISTS (Step 7) ═══════
export const AFTERCARE_CHECKLISTS: Record<string, string[]> = {
  _default: [
    'Aftercare instructions provided to customer',
    'Warranty card / certificate prepared',
    'Final photos taken and archived',
  ],
  ceramic_coating: [
    'Explain 24-hour no-wash curing requirement',
    'Provide maintenance wash schedule (every 2 weeks)',
    'Hand over aftercare product kit (if included)',
    'Explain warranty terms and coverage',
    'Schedule first maintenance wash appointment',
  ],
  ppf: [
    'Explain 48-hour curing requirement',
    'Demonstrate self-healing with hot water',
    'Explain proper washing technique',
    'Provide warranty documentation',
  ],
  tint: [
    'Explain 3-5 day window roll-down restriction',
    'Inform about normal bubble disappearance during curing',
    'Provide shade certification documentation',
    'Confirm RFID re-positioning (if applicable)',
  ],
  undercoat: [
    'Explain curing time (24-48 hours)',
    'Advise to avoid water exposure during curing',
    'Provide care instructions',
  ],
  repaint: [
    'Explain 7-14 day curing for new paint',
    'Advise against waxing during curing period',
    'Provide color code documentation',
  ],
  full_exterior_ppf: [
    'Provide full PPF aftercare guide',
    'Explain maintenance schedule',
    'Demonstrate self-healing',
    'Provide warranty documentation with coverage map',
  ],
  partial_ppf: [
    'Explain partial coverage limitations',
    'Provide aftercare instructions for protected areas',
    'Provide warranty documentation',
  ],
  latero: [
    'Explain paint curing timeline',
    'Advise gentle washing for first week',
  ],
};

/**
 * Gets combined checklist for a service category by merging _default + category-specific items.
 */
export function getIngressChecklist(category: string) {
  const defaults = INGRESS_CHECKLISTS._default || [];
  const specific = INGRESS_CHECKLISTS[category] || [];
  return [...defaults, ...specific];
}

export function getWaiverTerms(category: string) {
  const defaults = WAIVER_TERMS._default || [];
  const specific = WAIVER_TERMS[category] || [];
  return [...defaults, ...specific];
}

export function getServiceChecklist(category: string) {
  return SERVICE_CHECKLISTS[category] || SERVICE_CHECKLISTS._default || [];
}

export function getQCChecklist(category: string) {
  return QC_CHECKLISTS[category] || QC_CHECKLISTS._default || [];
}

export function getAftercareChecklist(category: string) {
  const defaults = AFTERCARE_CHECKLISTS._default || [];
  const specific = AFTERCARE_CHECKLISTS[category] || [];
  return [...defaults, ...specific];
}
