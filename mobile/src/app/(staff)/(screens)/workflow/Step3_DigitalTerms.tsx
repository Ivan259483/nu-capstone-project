import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Platform,
} from 'react-native';
import { useWorkflow } from './WorkflowContext';
import { useTheme } from '@/hooks/useThemeContext';
import { CheckCircle, Clock, CheckSquare, Square, Lock, FileText, User, Shield, DollarSign } from '@/components/ui/Icons';
import SignatureScreen from 'react-native-signature-canvas';
import { bookingService } from '@/services/api/bookingService';

// ─── Design Tokens ────────────────────────────────────────────────────────────
const ACCENT = '#f97316';
const ACCENT_DIM = 'rgba(249,115,22,0.10)';
const ACCENT_BORDER = 'rgba(249,115,22,0.25)';
const SUCCESS = '#22c55e';
const SUCCESS_DIM = 'rgba(34,197,94,0.08)';
const BG = '#050506';
const SURFACE = '#0E0E12';
const SURFACE_ALT = '#16161C';
const ELEVATED = '#1C1C24';
const BORDER = '#222228';
const TEXT_PRIMARY = '#F5F5F7';
const TEXT_SEC = '#A1A1AA';
const TEXT_MUT = '#71717A';
const TEXT_DIM = '#52525B';

// ─── Terms & Conditions ──────────────────────────────────────────────────────
const SERVICE_TERMS = [
  {
    id: 1,
    text: 'I agree to the selected detailing / PPF / tinting service and understand the scope of work included in the package.',
  },
  {
    id: 2,
    text: 'I understand that PPF, tint, and ceramic coating materials may require a curing period of up to 30 days before reaching maximum performance.',
  },
  {
    id: 3,
    text: 'I confirm that the vehicle condition has been inspected and documented during the ingress checklist.',
  },
  {
    id: 4,
    text: 'I authorize AUTOSPF+ staff and technicians to operate my vehicle within the facility premises as required for the service.',
  },
  {
    id: 5,
    text: 'I understand that pre-existing damages (scratches, dents, paint chips) documented during the ingress inspection are not the responsibility of the shop.',
  },
  {
    id: 6,
    text: 'I acknowledge that any changes in service scope after approval may result in additional charges and extended timeline.',
  },
];

// ─── Main Component ──────────────────────────────────────────────────────────
export default function Step3_DigitalTerms() {
  const { colors, isDark } = useTheme();
  const { job, saveStep, saving, completedSteps } = useWorkflow();
  const sigRef = useRef<any>(null);

  // ── State ──
  const [accepted, setAccepted] = useState<boolean[]>(SERVICE_TERMS.map(() => false));
  const [customerName, setCustomerName] = useState('');
  const [contactNumber, setContactNumber] = useState('');
  const [signature, setSignature] = useState('');
  const [sigMode, setSigMode] = useState(false);
  const [downPayment, setDownPayment] = useState('');

  const currentDate = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  // ── Hydrate from existing data ──
  useEffect(() => {
    if (!job) return;
    const waiver = job.customerWaiver as any;
    if (waiver?.termsAccepted?.length) {
      setAccepted(waiver.termsAccepted.map((t: any) => t.accepted ?? true));
    }
    setCustomerName(waiver?.customerFullName || String(job.customerName || ''));
    setContactNumber(waiver?.contactNumber || String(job.customerPhone || ''));
    setSignature(waiver?.digitalSignature || '');
  }, [job]);

  // ── Handlers ──
  const toggleTerm = (index: number) => {
    setAccepted(prev => {
      const next = [...prev];
      next[index] = !next[index];
      return next;
    });
  };

  const handleSigDone = (sig: string) => {
    if (sig && sig !== 'data:,') {
      setSignature(sig);
    }
    setSigMode(false);
  };

  const handleClearSig = () => {
    sigRef.current?.clearSignature();
    setSignature('');
  };

  // ── Validation ──
  const minDownPayment = (job?.totalPrice || 0) * 0.3;
  const isDownPaymentValid = job?.totalPrice ? (parseFloat(downPayment || '0') >= minDownPayment) : true;
  
  const allAccepted = accepted.every(Boolean);
  const hasName = customerName.trim().length > 0;
  const hasSig = signature.length > 0;
  const canAdvance = allAccepted && hasName && hasSig && isDownPaymentValid;
  const acceptedCount = accepted.filter(Boolean).length;
  const progress = Math.round((acceptedCount / SERVICE_TERMS.length) * 100);

  // ── Submit ──
  const handleAdvance = async () => {
    if (!canAdvance || !job?.id) return;
    
    try {
      await saveStep(3, {
        acceptedTerms: true,
        termsAccepted: SERVICE_TERMS.map((t, i) => ({ label: t.text, accepted: accepted[i] })),
        customerFullName: customerName.trim(),
        contactNumber: contactNumber.trim(),
        digitalSignature: signature,
        downPaymentCollected: parseFloat(downPayment || '0'),
        signedAt: new Date().toISOString(),
        dateSigned: new Date().toISOString(),
      }, false); // don't auto-advance yet

      // Trigger backend Check-in Endpoint!
      await bookingService.operateCheckIn(job.id, {
        downPaymentAmount: parseFloat(downPayment || '0'),
        releaseSignature: signature
      });
      
      saveStep(3, {}, true); // trigger context to advance to next route
    } catch (err) {
      console.error('[Check-in] Failed to record:', err);
    }
  };

  // ── Signature Canvas Styles (injected as HTML) ──
  const sigWebStyle = `
    .m-signature-pad { box-shadow: none; border: none; margin: 0; }
    .m-signature-pad--body { border: none; }
    .m-signature-pad--footer { display: none; }
    body { margin: 0; padding: 0; }
  `;

  return (
    <ScrollView
      style={s.screen}
      contentContainerStyle={s.content}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      {/* ══════ HEADER ══════ */}
      <View style={s.header}>
        <View style={s.headerBadge}>
          <FileText size={14} color={ACCENT} />
          <Text style={s.headerBadgeText}>STEP 3 OF 9</Text>
        </View>
        <Text style={s.title}>Digital Terms & Waiver</Text>
        <Text style={s.subtitle}>
          Please review and sign before service starts. Customer must accept all terms and provide a digital signature.
        </Text>
      </View>

      {/* ══════ PROGRESS BAR ══════ */}
      <View style={s.progressWrap}>
        <View style={s.progressRow}>
          <Text style={s.progressLabel}>Terms Accepted</Text>
          <Text style={s.progressValue}>{acceptedCount}/{SERVICE_TERMS.length}</Text>
        </View>
        <View style={s.progressTrack}>
          <View style={[s.progressFill, { width: `${progress}%` }]} />
        </View>
      </View>

      {/* ══════ TERMS & CONDITIONS ══════ */}
      <View style={s.section}>
        <View style={s.sectionHeaderRow}>
          <Shield size={16} color={ACCENT} />
          <Text style={s.sectionTitle}>TERMS & CONDITIONS</Text>
        </View>

        {SERVICE_TERMS.map((term, i) => {
          const isChecked = accepted[i];
          return (
            <TouchableOpacity
              key={term.id}
              style={[
                s.termRow,
                isChecked && s.termRowAccepted,
                i < SERVICE_TERMS.length - 1 && s.termBorder,
              ]}
              onPress={() => toggleTerm(i)}
              activeOpacity={0.7}
            >
              <View style={s.termCheckbox}>
                {isChecked
                  ? <CheckSquare color={ACCENT} size={22} />
                  : <Square color={TEXT_DIM} size={22} />
                }
              </View>
              <Text style={[s.termText, isChecked && s.termTextAccepted]}>
                {term.text}
              </Text>
            </TouchableOpacity>
          );
        })}

        {/* Accept All shortcut */}
        {!allAccepted && (
          <TouchableOpacity
            style={s.acceptAllBtn}
            onPress={() => setAccepted(SERVICE_TERMS.map(() => true))}
            activeOpacity={0.8}
          >
            <CheckSquare size={16} color={ACCENT} />
            <Text style={s.acceptAllText}>Accept All Terms</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* ══════ CUSTOMER INFORMATION ══════ */}
      <View style={s.section}>
        <View style={s.sectionHeaderRow}>
          <User size={16} color={ACCENT} />
          <Text style={s.sectionTitle}>CUSTOMER INFORMATION</Text>
        </View>

        {/* Full Name */}
        <Text style={s.fieldLabel}>FULL NAME <Text style={s.required}>*</Text></Text>
        <TextInput
          style={[s.input, hasName && s.inputFilled]}
          value={customerName}
          onChangeText={setCustomerName}
          placeholder="Enter customer's full legal name"
          placeholderTextColor={TEXT_DIM}
          autoCapitalize="words"
        />

        {/* Contact Number */}
        <Text style={s.fieldLabel}>CONTACT NUMBER <Text style={s.optional}>(Optional)</Text></Text>
        <TextInput
          style={s.input}
          value={contactNumber}
          onChangeText={setContactNumber}
          placeholder="+63 9XX XXX XXXX"
          placeholderTextColor={TEXT_DIM}
          keyboardType="phone-pad"
        />

        {/* Date */}
        <Text style={s.fieldLabel}>DATE</Text>
        <View style={s.dateField}>
          <Text style={s.dateText}>{currentDate}</Text>
        </View>
      </View>

      {/* ══════ DOWN PAYMENT ══════ */}
      {job?.totalPrice ? (
        <View style={s.section}>
          <View style={s.sectionHeaderRow}>
            <DollarSign size={16} color={ACCENT} />
            <Text style={s.sectionTitle}>DOWN PAYMENT DESK</Text>
          </View>
          
          <View style={{ marginBottom: 16 }}>
            <Text style={{ color: TEXT_SEC, fontSize: 13, marginBottom: 8 }}>
              Total Service Price: <Text style={{ color: '#fff', fontWeight: 'bold' }}>${job.totalPrice}</Text>
            </Text>
            <Text style={{ color: TEXT_SEC, fontSize: 13 }}>
              Minimum 30% Down Payment: <Text style={{ color: ACCENT, fontWeight: 'bold' }}>${minDownPayment.toFixed(2)}</Text>
            </Text>
          </View>

          <Text style={s.fieldLabel}>COLLECTED AMOUNT <Text style={s.required}>*</Text></Text>
          <TextInput
            style={[s.input, isDownPaymentValid && downPayment.length > 0 && s.inputFilled, !isDownPaymentValid && downPayment.length > 0 && { borderColor: '#ef4444' }]}
            value={downPayment}
            onChangeText={setDownPayment}
            placeholder={`Min. $${minDownPayment.toFixed(2)}`}
            placeholderTextColor={TEXT_DIM}
            keyboardType="decimal-pad"
          />
          {!isDownPaymentValid && downPayment.length > 0 && (
             <Text style={{ color: '#ef4444', fontSize: 11, marginTop: 6 }}>
               Amount must be at least ${minDownPayment.toFixed(2)}
             </Text>
          )}
        </View>
      ) : null}

      {/* ══════ DIGITAL SIGNATURE ══════ */}
      <View style={s.section}>
        <View style={s.sectionHeaderRow}>
          <FileText size={16} color={ACCENT} />
          <Text style={s.sectionTitle}>DIGITAL SIGNATURE</Text>
        </View>
        <Text style={s.sigInstruction}>
          Customer must sign below using their finger. This serves as a digital acknowledgment of the terms above.
        </Text>

        {sigMode ? (
          <View style={s.sigCanvasWrap}>
            <View style={s.sigCanvasInner}>
              <SignatureScreen
                ref={sigRef}
                onOK={handleSigDone}
                onEmpty={() => console.log('[Sig] Empty')}
                webStyle={sigWebStyle}
                backgroundColor="#111114"
                penColor={ACCENT}
                dotSize={2}
                minWidth={1.5}
                maxWidth={3}
                style={{ flex: 1 }}
              />
            </View>
            <View style={s.sigCanvasHint}>
              <Text style={s.sigHintText}>✍️ Sign above using your finger</Text>
            </View>
            <View style={s.sigActions}>
              <TouchableOpacity onPress={handleClearSig} style={s.sigClearBtn} activeOpacity={0.7}>
                <Text style={s.sigClearText}>Clear</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => sigRef.current?.readSignature()}
                style={s.sigConfirmBtn}
                activeOpacity={0.8}
              >
                <CheckCircle size={16} color="#fff" />
                <Text style={s.sigConfirmText}>Confirm Signature</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <TouchableOpacity
            style={[s.sigTapArea, hasSig && s.sigTapAreaSigned]}
            onPress={() => setSigMode(true)}
            activeOpacity={0.7}
          >
            {hasSig ? (
              <View style={s.sigDoneRow}>
                <CheckCircle size={20} color={SUCCESS} />
                <View style={{ marginLeft: 10, flex: 1 }}>
                  <Text style={s.sigDoneTitle}>Signature Captured</Text>
                  <Text style={s.sigDoneSub}>Tap to re-sign if needed</Text>
                </View>
                <View style={s.sigDoneBadge}>
                  <Text style={s.sigDoneBadgeText}>SIGNED</Text>
                </View>
              </View>
            ) : (
              <View style={s.sigEmptyRow}>
                <View style={s.sigEmptyIcon}>
                  <FileText size={24} color={TEXT_DIM} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.sigEmptyTitle}>Tap to Sign</Text>
                  <Text style={s.sigEmptySub}>A digital signature is required to proceed</Text>
                </View>
              </View>
            )}
          </TouchableOpacity>
        )}
      </View>

      {/* ══════ VALIDATION STATUS ══════ */}
      <View style={s.validationCard}>
        <Text style={s.validationTitle}>SUBMISSION REQUIREMENTS</Text>
        <View style={s.valRow}>
          {allAccepted
            ? <CheckCircle size={16} color={SUCCESS} />
            : <Lock size={16} color={TEXT_DIM} />}
          <Text style={[s.valText, allAccepted && s.valTextDone]}>
            All {SERVICE_TERMS.length} terms accepted
          </Text>
        </View>
        <View style={s.valRow}>
          {hasName
            ? <CheckCircle size={16} color={SUCCESS} />
            : <Lock size={16} color={TEXT_DIM} />}
          <Text style={[s.valText, hasName && s.valTextDone]}>Customer name provided</Text>
        </View>
        <View style={s.valRow}>
          {hasSig
            ? <CheckCircle size={16} color={SUCCESS} />
            : <Lock size={16} color={TEXT_DIM} />}
          <Text style={[s.valText, hasSig && s.valTextDone]}>Digital signature captured</Text>
        </View>
        {job?.totalPrice ? (
          <View style={s.valRow}>
            {isDownPaymentValid && downPayment.trim() !== ''
              ? <CheckCircle size={16} color={SUCCESS} />
              : <Lock size={16} color={TEXT_DIM} />}
            <Text style={[s.valText, isDownPaymentValid && downPayment.trim() !== '' && s.valTextDone]}>Min 30% Down Payment (${minDownPayment.toFixed(2)})</Text>
          </View>
        ) : null}
      </View>

      {/* ══════ SUBMIT BUTTON ══════ */}
      <TouchableOpacity
        style={[
          s.submitBtn,
          !canAdvance && s.submitBtnDisabled,
          saving && { opacity: 0.7 },
        ]}
        onPress={handleAdvance}
        disabled={!canAdvance || saving}
        activeOpacity={0.85}
      >
        {!canAdvance ? (
          <>
            <Lock color="#fff" size={20} style={{ marginRight: 10 }} />
            <Text style={s.submitBtnText}>Complete All Requirements</Text>
          </>
        ) : saving ? (
          <>
            <Clock color="#fff" size={20} style={{ marginRight: 10 }} />
            <Text style={s.submitBtnText}>Saving Waiver…</Text>
          </>
        ) : (
          <>
            <CheckCircle color="#fff" size={20} style={{ marginRight: 10 }} />
            <Text style={s.submitBtnText}>Submit Waiver & Proceed</Text>
          </>
        )}
      </TouchableOpacity>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: BG,
  },
  content: {
    padding: 24,
    paddingBottom: 80,
  },

  // Header
  header: {
    marginBottom: 24,
  },
  headerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    backgroundColor: ACCENT_DIM,
    borderWidth: 1,
    borderColor: ACCENT_BORDER,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 4,
    marginBottom: 16,
  },
  headerBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: ACCENT,
    letterSpacing: 1.5,
  },
  title: {
    fontSize: 26,
    fontWeight: '900',
    color: TEXT_PRIMARY,
    letterSpacing: -0.3,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: TEXT_SEC,
    lineHeight: 20,
  },

  // Progress
  progressWrap: {
    marginBottom: 24,
    backgroundColor: SURFACE,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 16,
  },
  progressRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  progressLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: TEXT_MUT,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  progressValue: {
    fontSize: 13,
    fontWeight: '800',
    color: ACCENT,
  },
  progressTrack: {
    height: 6,
    backgroundColor: '#1A1A20',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: ACCENT,
    borderRadius: 3,
  },

  // Sections
  section: {
    backgroundColor: SURFACE,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 20,
    marginBottom: 20,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: ACCENT,
    letterSpacing: 1.5,
  },

  // Terms
  termRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 14,
    gap: 12,
  },
  termRowAccepted: {
    // subtle highlight
  },
  termBorder: {
    borderBottomWidth: 1,
    borderBottomColor: '#1A1A20',
  },
  termCheckbox: {
    marginTop: 1,
  },
  termText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 21,
    fontWeight: '500',
    color: TEXT_MUT,
  },
  termTextAccepted: {
    color: TEXT_PRIMARY,
  },

  // Accept All
  acceptAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 16,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: ACCENT_BORDER,
    backgroundColor: ACCENT_DIM,
  },
  acceptAllText: {
    fontSize: 13,
    fontWeight: '700',
    color: ACCENT,
  },

  // Fields
  fieldLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: TEXT_MUT,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 8,
    marginTop: 16,
  },
  required: {
    color: '#ef4444',
  },
  optional: {
    color: TEXT_DIM,
    fontWeight: '500',
    textTransform: 'none',
    letterSpacing: 0,
  },
  input: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    backgroundColor: SURFACE_ALT,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    color: TEXT_PRIMARY,
    fontWeight: '500',
  },
  inputFilled: {
    borderColor: ACCENT_BORDER,
  },
  dateField: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    backgroundColor: SURFACE_ALT,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  dateText: {
    fontSize: 14,
    color: TEXT_SEC,
    fontWeight: '500',
  },

  // Signature
  sigInstruction: {
    fontSize: 13,
    color: TEXT_MUT,
    lineHeight: 19,
    marginBottom: 16,
  },
  sigCanvasWrap: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: ACCENT_BORDER,
    overflow: 'hidden',
    backgroundColor: '#111114',
  },
  sigCanvasInner: {
    height: 200,
  },
  sigCanvasHint: {
    alignItems: 'center',
    paddingVertical: 6,
    backgroundColor: 'rgba(249,115,22,0.05)',
    borderTopWidth: 1,
    borderTopColor: '#1A1A20',
  },
  sigHintText: {
    fontSize: 11,
    color: TEXT_DIM,
    fontWeight: '600',
  },
  sigActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#0A0A0E',
    borderTopWidth: 1,
    borderTopColor: '#1A1A20',
  },
  sigClearBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: BORDER,
  },
  sigClearText: {
    color: TEXT_SEC,
    fontWeight: '600',
    fontSize: 13,
  },
  sigConfirmBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: ACCENT,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
  },
  sigConfirmText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 13,
  },

  // Signature tap area (collapsed state)
  sigTapArea: {
    borderRadius: 14,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: BORDER,
    padding: 20,
    backgroundColor: SURFACE_ALT,
  },
  sigTapAreaSigned: {
    borderColor: SUCCESS,
    borderStyle: 'solid',
    backgroundColor: SUCCESS_DIM,
  },
  sigDoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sigDoneTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: SUCCESS,
  },
  sigDoneSub: {
    fontSize: 12,
    color: TEXT_MUT,
    marginTop: 2,
  },
  sigDoneBadge: {
    backgroundColor: 'rgba(34,197,94,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.25)',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  sigDoneBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: SUCCESS,
    letterSpacing: 1,
  },
  sigEmptyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  sigEmptyIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: ELEVATED,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sigEmptyTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: TEXT_SEC,
  },
  sigEmptySub: {
    fontSize: 12,
    color: TEXT_DIM,
    marginTop: 2,
  },

  // Validation Card
  validationCard: {
    backgroundColor: SURFACE,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 18,
    marginBottom: 24,
  },
  validationTitle: {
    fontSize: 10,
    fontWeight: '800',
    color: TEXT_DIM,
    letterSpacing: 1.5,
    marginBottom: 14,
  },
  valRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
  },
  valText: {
    fontSize: 13,
    fontWeight: '500',
    color: TEXT_DIM,
  },
  valTextDone: {
    color: TEXT_PRIMARY,
  },

  // Submit Button
  submitBtn: {
    backgroundColor: ACCENT,
    paddingVertical: 18,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: ACCENT,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 8,
  },
  submitBtnDisabled: {
    backgroundColor: '#333338',
    shadowOpacity: 0,
    elevation: 0,
  },
  submitBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
  },
});
