const ROOT_ENVIRONMENTS = ['demo', 'production', 'unclassified'];

export const OPERATIONAL_ACTIVITY_TYPES = Object.freeze([
  'booking_created',
  'booking_updated',
  'booking_cancelled',
  'booking_completed',
  'booking_assigned',
  'booking_started',
  'new_booking',
  'status_change',
  'payment_success',
  'payment_failed',
  'payment_completed',
  'invoice_generated',
  'refund_processed',
  'pos_transaction',
  'price_override',
  'stock_in',
  'stock_out',
  'low_stock',
  'inventory_edit',
  'inventory_update',
  'inventory_deduction',
  'service_started',
  'service_progress',
  'service_completed',
  'started_job',
  'completed_job',
  'qc_approved',
  'qc_returned',
  'qc_stage_update',
  'qc_handoff_sheet',
  'customer_booking',
  'customer_payment',
  'customer_status_change',
  'generated_report',
]);

const environmentForMode = (mode) => (
  mode === 'production' || mode === 'archived' ? 'production' : 'demo'
);

const sessionFor = (document) => (
  typeof document?.$session === 'function' ? document.$session() : null
);

/**
 * Adds server-owned classification fields and synchronizes the authoritative
 * classification registry in the same Mongo session as ordinary document
 * saves. Existing raw documents have no field and therefore remain
 * unclassified until reviewed or migrated.
 */
export function operationalClassificationPlugin(schema, {
  collectionName,
  resolveCollectionName,
  label,
} = {}) {
  schema.add({
    dataEnvironment: {
      type: String,
      enum: ROOT_ENVIRONMENTS,
      default: 'unclassified',
      select: false,
    },
    classificationMetadata: {
      type: new schema.base.Schema({
        source: { type: String, enum: ['mode_default', 'manual', 'migration'], default: null },
        reviewed: { type: Boolean, default: false },
        classifiedAt: { type: Date, default: null },
        classifiedBy: { type: schema.base.Schema.Types.ObjectId, default: null },
        systemRevision: { type: Number, default: null },
      }, { _id: false }),
      default: undefined,
      select: false,
    },
  });
  schema.index({ dataEnvironment: 1, createdAt: -1 });

  const rootFor = (document) => (
    typeof resolveCollectionName === 'function'
      ? resolveCollectionName(document)
      : collectionName
  );

  schema.pre('validate', async function assignModeClassification() {
    const root = rootFor(this);
    if (!this.isNew || !root) return;

    const session = sessionFor(this);
    const state = await this.constructor.db.collection('systemstates').findOne(
      { key: 'primary' },
      session ? { session } : undefined,
    );
    const dataEnvironment = environmentForMode(state?.mode || (
      process.env.NODE_ENV === 'production' ? 'demo' : 'development'
    ));
    const classifiedAt = new Date();
    // Ignore any client-supplied classification on new documents.
    this.dataEnvironment = dataEnvironment;
    this.classificationMetadata = {
      source: 'mode_default',
      reviewed: true,
      classifiedAt,
      systemRevision: Number(state?.revision || 0),
    };
  });

  schema.post('save', async function synchronizeClassificationRegistry(document) {
    const root = rootFor(document);
    if (!root || !ROOT_ENVIRONMENTS.includes(document.dataEnvironment)) return;
    const metadata = document.classificationMetadata || {};
    const fallbackLabel = `${root} ${document._id}`;
    let resolvedLabel = fallbackLabel;
    try {
      resolvedLabel = String(typeof label === 'function' ? label(document) : fallbackLabel)
        .trim()
        .slice(0, 300) || fallbackLabel;
    } catch {
      resolvedLabel = fallbackLabel;
    }
    const session = sessionFor(document);
    await document.constructor.db.collection('systemdataclassifications').updateOne(
      { collectionName: root, documentId: document._id },
      {
        $setOnInsert: {
          collectionName: root,
          documentId: document._id,
          dataEnvironment: document.dataEnvironment,
          label: resolvedLabel,
          classifiedAt: metadata.classifiedAt || document.createdAt || new Date(),
          classifiedBy: null,
          source: metadata.source || 'mode_default',
          reviewed: metadata.reviewed !== false,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      },
      { upsert: true, ...(session ? { session } : {}) },
    );
  });
}

export default operationalClassificationPlugin;
