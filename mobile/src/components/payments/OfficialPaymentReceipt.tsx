import React, { useMemo } from 'react';
import { Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { PaymentReceipt } from '@/services/api/paymentService';
import {
  formatPeso,
  formatReceiptDateTime,
  isPaidReceiptStatus,
  receiptPaymentMethodLabel,
  receiptPaymentStatusLabel,
  receiptPresentation,
  type ReceiptSummaryRow,
} from '@/lib/receipt-presentation';

const NAVY = '#13243D';
const NAVY_DEEP = '#25334A';
const BLUE_ACCENT = '#3569B8';
const ORANGE = '#F97316';
const BORDER = '#DCE3EB';
const HAIRLINE = '#E9EDF2';
const MUTED = '#7A8696';
const MUTED_SOFT = '#98A2B3';

function DetailLine({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <View style={styles.line}>
      <Text style={styles.lineLabel}>{label}</Text>
      <Text style={styles.lineValue}>{value}</Text>
    </View>
  );
}

function SummaryRowView({ label, value, negative, emphasize, highlight }: ReceiptSummaryRow & { highlight?: boolean }) {
  return (
    <View style={[styles.summaryRow, emphasize && styles.summaryRowTotal, highlight && styles.summaryRowCollected]}>
      <Text style={[styles.summaryLabel, (emphasize || highlight) && styles.summaryLabelStrong, highlight && styles.summaryCollectedText]}>
        {label}
      </Text>
      <Text style={[styles.summaryValue, (emphasize || highlight) && styles.summaryLabelStrong, highlight && styles.summaryCollectedText]}>
        {negative && value ? '−' : ''}
        {formatPeso(value)}
      </Text>
    </View>
  );
}

/**
 * Native "paper" presentation of the canonical GET /api/payments/my/:paymentId/receipt
 * response. Structure, section order, wording and styling intentionally mirror the web
 * app's official receipt document (frontend/src/lib/receipt-document.ts) so the two stay
 * one visual design system — values are never derived from booking data on the device.
 */
export function OfficialPaymentReceipt({ receipt }: { receipt: PaymentReceipt }) {
  const presentation = useMemo(() => receiptPresentation(receipt), [receipt]);
  const issued = useMemo(
    () => formatReceiptDateTime(receipt.issuedAt || receipt.paymentDate),
    [receipt.issuedAt, receipt.paymentDate],
  );
  const paid = useMemo(() => formatReceiptDateTime(receipt.paymentDate), [receipt.paymentDate]);
  const paymentStatus = receiptPaymentStatusLabel(receipt.paymentStatus);
  const paidStatus = isPaidReceiptStatus(receipt.paymentStatus);
  const bookingReference = receipt.bookingReference || receipt.orderNumber || '—';
  const companyName = receipt.company?.name || 'AutoSPF+';

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
      <View style={styles.paper}>
        <View style={styles.brandRow}>
          <View style={styles.logoPlate}>
            <Image
              source={require('../../../assets/images/autospf-logo.png')}
              style={styles.logoImage}
              resizeMode="contain"
            />
          </View>
          <View style={styles.brandCopy}>
            <Text style={styles.brandName}>{companyName}</Text>
            <Text style={styles.brandCategory}>AUTOMOTIVE SERVICE</Text>
            {receipt.company?.address ? <Text style={styles.brandMeta}>{receipt.company.address}</Text> : null}
            {(receipt.company?.phone || receipt.company?.email) && (
              <Text style={styles.brandMeta}>
                {[receipt.company?.phone, receipt.company?.email].filter(Boolean).join(' · ')}
              </Text>
            )}
          </View>
        </View>

        <View style={styles.divider} />

        <View style={styles.receiptHeading}>
          <View style={styles.receiptHeadingBar} />
          <Text style={styles.eyebrow}>{presentation.eyebrow}</Text>
          <Text style={styles.receiptTitle}>{presentation.title}</Text>
          <Text style={styles.digitalCopy}>Digital Copy</Text>
          <View style={styles.metaBlock}>
            <DetailLine label="Receipt Number" value={receipt.receiptNumber} />
            <DetailLine label="Booking Reference" value={bookingReference} />
            <DetailLine label="Date Issued" value={issued.date} />
          </View>
        </View>

        <View style={styles.sectionStack}>
          <View style={styles.box}>
            <Text style={styles.boxHeader}>Transaction Details</Text>
            <View style={styles.boxBody}>
              <DetailLine label="Date Issued" value={issued.date} />
              <DetailLine label="Time Issued" value={issued.time} />
              {receipt.paymentDate ? <DetailLine label="Payment Date" value={`${paid.date} ${paid.time}`} /> : null}
              <DetailLine label="Order Number" value={receipt.orderNumber} />
              <DetailLine label="Served By" value={receipt.staffName || companyName} />
            </View>
          </View>

          <View style={styles.box}>
            <Text style={styles.boxHeader}>Customer & Vehicle</Text>
            <View style={styles.boxBody}>
              <DetailLine label="Customer" value={receipt.customer?.name} />
              <DetailLine label="Phone" value={receipt.customer?.phone} />
              <DetailLine label="Plate Number" value={receipt.vehicle?.plate} />
              <DetailLine label="Vehicle" value={receipt.vehicle?.description} />
              <DetailLine label="Color" value={receipt.vehicle?.color} />
              <DetailLine label="Class" value={receipt.vehicle?.classification} />
            </View>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Services & Charges</Text>
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={[styles.tableHeaderText, styles.colService]}>SERVICE DESCRIPTION</Text>
            <Text style={[styles.tableHeaderText, styles.colQty]}>QTY</Text>
            <Text style={[styles.tableHeaderText, styles.colUnit]}>UNIT PRICE</Text>
            <Text style={[styles.tableHeaderText, styles.colAmount]}>AMOUNT</Text>
          </View>
          {receipt.lineItems.map((line, index) => (
            <View
              key={`${line.name}-${index}`}
              style={[styles.tableRow, index === receipt.lineItems.length - 1 && styles.tableRowLast]}
            >
              <Text style={[styles.tableServiceText, styles.colService]}>{line.name}</Text>
              <Text style={[styles.tableCellText, styles.colQty]}>{line.quantity}</Text>
              <Text style={[styles.tableCellText, styles.colUnit]}>{formatPeso(line.unitPrice)}</Text>
              <Text style={[styles.tableAmountText, styles.colAmount]}>{formatPeso(line.amount)}</Text>
            </View>
          ))}
        </View>

        <View style={[styles.sectionStack, styles.lowerStack]}>
          <View style={styles.box}>
            <Text style={styles.boxHeader}>Payment Details</Text>
            <View style={styles.paymentGrid}>
              <View style={styles.paymentItem}>
                <Text style={styles.paymentItemLabel}>Payment Method</Text>
                <Text style={styles.paymentItemValue}>{receiptPaymentMethodLabel(receipt.paymentMethod)}</Text>
              </View>
              <View style={[styles.paymentItem, styles.paymentItemBordered]}>
                <Text style={styles.paymentItemLabel}>Payment Status</Text>
                <View style={[styles.statusPill, paidStatus && styles.statusPillPaid]}>
                  <Text style={[styles.statusPillText, paidStatus && styles.statusPillTextPaid]}>{paymentStatus}</Text>
                </View>
              </View>
            </View>
          </View>

          {receipt.notes ? (
            <View style={styles.notes}>
              <Text style={styles.notesText}>
                <Text style={styles.notesLabel}>Notes: </Text>
                {receipt.notes}
              </Text>
            </View>
          ) : null}

          <View style={styles.summaryCard}>
            <Text style={[styles.sectionTitle, styles.summaryTitle]}>Billing Summary</Text>
            {presentation.rows.map((row) => (
              <SummaryRowView key={row.label} {...row} />
            ))}
            <SummaryRowView label={presentation.collectedLabel} value={presentation.collectedAmount} highlight />
            {receipt.balanceDue ? <SummaryRowView label="Remaining Balance" value={receipt.balanceDue} /> : null}
          </View>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerStrong}>Thank you for trusting {companyName} with your vehicle.</Text>
          <Text style={styles.footerText}>
            This digital receipt confirms your payment record. Please keep this copy for your records.
          </Text>
          <Text style={styles.systemNote}>GENERATED BY AUTOSPF+ MANAGEMENT SYSTEM</Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: '#F1F4F8' },
  scrollContent: { padding: 16, paddingBottom: 40 },

  paper: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 18,
    padding: 18,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.08,
    shadowRadius: 20,
    elevation: 2,
  },

  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  logoPlate: {
    width: 70,
    height: 52,
    borderRadius: 10,
    backgroundColor: NAVY,
    borderWidth: 1,
    borderColor: '#243C5C',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 7,
  },
  logoImage: { width: '100%', height: '100%' },
  brandCopy: { flex: 1, minWidth: 0 },
  brandName: { color: NAVY, fontSize: 17, fontWeight: '800', letterSpacing: -0.3 },
  brandCategory: { color: BLUE_ACCENT, fontSize: 9.5, fontWeight: '800', letterSpacing: 1.1, marginTop: 3, marginBottom: 5 },
  brandMeta: { color: '#667085', fontSize: 10.5, lineHeight: 15, marginTop: 1 },

  divider: { height: 1, backgroundColor: '#DFE6EE', marginVertical: 16 },

  receiptHeading: { position: 'relative', paddingLeft: 14 },
  receiptHeadingBar: { position: 'absolute', left: 0, top: 1, bottom: 1, width: 3, borderRadius: 99, backgroundColor: ORANGE },
  eyebrow: { color: BLUE_ACCENT, fontSize: 9.5, fontWeight: '800', letterSpacing: 1.4, textTransform: 'uppercase' },
  receiptTitle: { color: NAVY, fontSize: 21, fontWeight: '800', letterSpacing: -0.4, marginTop: 4, marginBottom: 2 },
  digitalCopy: { color: '#7B8797', fontSize: 9, fontWeight: '800', letterSpacing: 1.4, textTransform: 'uppercase', marginBottom: 10 },
  metaBlock: { marginTop: 2 },

  sectionStack: { marginTop: 18, gap: 12 },
  box: { borderWidth: 1, borderColor: BORDER, borderRadius: 11, backgroundColor: '#FBFCFE', overflow: 'hidden' },
  boxHeader: {
    paddingHorizontal: 13,
    paddingVertical: 8,
    backgroundColor: '#EEF3F8',
    borderBottomWidth: 1,
    borderBottomColor: '#DFE6EE',
    color: '#2C5F9F',
    fontSize: 9.5,
    fontWeight: '800',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  boxBody: { paddingHorizontal: 13, paddingTop: 8, paddingBottom: 10 },
  line: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 4 },
  lineLabel: { color: MUTED, fontSize: 11 },
  lineValue: { color: NAVY_DEEP, fontSize: 11, fontWeight: '700', textAlign: 'right', flexShrink: 1 },

  sectionTitle: { color: '#344054', fontSize: 10.5, fontWeight: '800', letterSpacing: 1.3, textTransform: 'uppercase', marginTop: 22, marginBottom: 9 },

  table: { borderWidth: 1, borderColor: '#D8E0E9', borderRadius: 11, overflow: 'hidden' },
  tableHeader: { flexDirection: 'row', backgroundColor: '#EAF0F6', borderBottomWidth: 1, borderBottomColor: '#D8E0E9', paddingHorizontal: 9, paddingVertical: 9 },
  tableHeaderText: { color: '#475467', fontSize: 8, fontWeight: '800', letterSpacing: 0.5, textTransform: 'uppercase' },
  tableRow: { flexDirection: 'row', paddingHorizontal: 9, paddingVertical: 11, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: HAIRLINE },
  tableRowLast: { borderBottomWidth: 0 },
  tableServiceText: { color: NAVY_DEEP, fontSize: 11, fontWeight: '700', lineHeight: 15 },
  tableCellText: { color: '#344054', fontSize: 10.5 },
  tableAmountText: { color: NAVY_DEEP, fontSize: 11, fontWeight: '700' },
  colService: { flex: 1.9, textAlign: 'left', paddingRight: 6 },
  colQty: { width: 26, textAlign: 'right' },
  colUnit: { flex: 0.95, textAlign: 'right' },
  colAmount: { flex: 1.05, textAlign: 'right' },

  lowerStack: { marginTop: 4 },
  paymentGrid: { flexDirection: 'row' },
  paymentItem: { flex: 1, padding: 13 },
  paymentItemBordered: { borderLeftWidth: 1, borderLeftColor: '#DFE6EE' },
  paymentItemLabel: { color: '#7B8797', fontSize: 8.5, fontWeight: '800', letterSpacing: 0.9, textTransform: 'uppercase', marginBottom: 7 },
  paymentItemValue: { color: NAVY_DEEP, fontSize: 12.5, fontWeight: '700' },
  statusPill: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: '#BFD3EF',
    backgroundColor: '#EDF5FF',
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  statusPillText: { color: '#285EAA', fontSize: 9.5, fontWeight: '800', letterSpacing: 0.5, textTransform: 'uppercase' },
  statusPillPaid: { borderColor: '#A7E3C5', backgroundColor: '#ECFDF3' },
  statusPillTextPaid: { color: '#087A55' },

  notes: { marginTop: 12, padding: 12, borderLeftWidth: 3, borderLeftColor: '#9BBBE5', backgroundColor: '#F7F9FC', borderRadius: 8 },
  notesLabel: { fontWeight: '800', color: '#526074' },
  notesText: { color: '#526074', fontSize: 11, lineHeight: 16 },

  summaryCard: { marginTop: 12, borderWidth: 1, borderColor: '#D8E0E9', borderRadius: 11, backgroundColor: '#FFFFFF', padding: 13, paddingBottom: 14 },
  summaryTitle: { marginTop: 0, marginBottom: 9 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 14, paddingVertical: 5.5 },
  summaryRowTotal: { marginTop: 4, paddingTop: 9, borderTopWidth: 1, borderTopColor: '#D8E0E9' },
  summaryRowCollected: {
    marginTop: 9,
    marginHorizontal: -3,
    marginBottom: -3,
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderLeftWidth: 3,
    borderLeftColor: ORANGE,
    backgroundColor: '#EDF5FF',
  },
  summaryLabel: { color: '#526074', fontSize: 10.5, flexShrink: 1 },
  summaryValue: { color: '#526074', fontSize: 10.5, fontWeight: '700' },
  summaryLabelStrong: { color: NAVY_DEEP, fontWeight: '700' },
  summaryCollectedText: { color: '#214F8F', fontSize: 12.5, fontWeight: '800' },

  footer: { marginTop: 22, paddingTop: 16, borderTopWidth: 1, borderTopColor: '#D8E0E9', alignItems: 'center' },
  footerStrong: { color: NAVY_DEEP, fontSize: 11.5, fontWeight: '800', textAlign: 'center', marginBottom: 4 },
  footerText: { color: '#667085', fontSize: 10.5, lineHeight: 16, textAlign: 'center' },
  systemNote: { color: MUTED_SOFT, fontSize: 8.5, fontWeight: '700', letterSpacing: 0.6, textAlign: 'center', marginTop: 6, textTransform: 'uppercase' },
});
