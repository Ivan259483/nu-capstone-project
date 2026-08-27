import mongoose from 'mongoose';

const systemMutationAdmissionSchema = new mongoose.Schema(
  {
    token: { type: String, required: true, unique: true, immutable: true },
    owner: { type: String, required: true, maxlength: 180, index: true },
    kind: { type: String, enum: ['http', 'scheduler', 'socket', 'internal'], default: 'internal' },
    requestId: { type: String, default: null, maxlength: 180 },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);

// Crash recovery only. Destructive operations query expiresAt directly and do
// not depend on the asynchronous TTL monitor having removed an expired row.
systemMutationAdmissionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model('SystemMutationAdmission', systemMutationAdmissionSchema);
