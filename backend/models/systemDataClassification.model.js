import mongoose from 'mongoose';

export const DATA_ENVIRONMENTS = Object.freeze(['demo', 'production', 'unclassified']);

const systemDataClassificationSchema = new mongoose.Schema(
  {
    collectionName: { type: String, required: true, index: true, immutable: true },
    documentId: { type: mongoose.Schema.Types.ObjectId, required: true, immutable: true },
    dataEnvironment: {
      type: String,
      enum: DATA_ENVIRONMENTS,
      default: 'unclassified',
      required: true,
      index: true,
    },
    label: { type: String, default: '', maxlength: 300 },
    classifiedAt: { type: Date, default: null },
    classifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    source: { type: String, enum: ['manual', 'mode_default', 'migration'], default: 'manual' },
    reviewed: { type: Boolean, default: false },
  },
  { timestamps: true },
);

systemDataClassificationSchema.index(
  { collectionName: 1, documentId: 1 },
  { unique: true, name: 'one_environment_classification_per_operational_root' },
);
systemDataClassificationSchema.index({ collectionName: 1, dataEnvironment: 1, documentId: 1 });

export default mongoose.model('SystemDataClassification', systemDataClassificationSchema);
