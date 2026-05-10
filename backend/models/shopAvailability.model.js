import mongoose from 'mongoose';

export const buildDefaultRecurringSchedule = () => ([
  { dow: 0, open: false, from: '08:00', to: '17:00', slots: 10 },
  { dow: 1, open: true,  from: '08:00', to: '17:00', slots: 10 },
  { dow: 2, open: true,  from: '08:00', to: '17:00', slots: 10 },
  { dow: 3, open: true,  from: '08:00', to: '17:00', slots: 10 },
  { dow: 4, open: true,  from: '08:00', to: '17:00', slots: 10 },
  { dow: 5, open: true,  from: '08:00', to: '17:00', slots: 10 },
  { dow: 6, open: true,  from: '08:00', to: '17:00', slots: 7 },
]);

const recurringScheduleSchema = new mongoose.Schema(
  {
    dow: { type: Number, required: true, min: 0, max: 6 },
    open: { type: Boolean, default: true },
    from: { type: String, default: '08:00' },
    to: { type: String, default: '17:00' },
    slots: { type: Number, default: 10, min: 0 },
  },
  { _id: false }
);

const shopAvailabilitySchema = new mongoose.Schema(
  {
    emergencyClosed: { type: Boolean, default: false },
    recurringSchedule: {
      type: [recurringScheduleSchema],
      default: buildDefaultRecurringSchedule,
    },
    updatedAt: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

shopAvailabilitySchema.pre('save', function syncUpdatedAt(next) {
  this.updatedAt = new Date();
  next();
});

shopAvailabilitySchema.statics.getSingleton = async function getSingleton() {
  let doc = await this.findOne();
  if (!doc) {
    doc = await this.create({
      recurringSchedule: buildDefaultRecurringSchedule(),
    });
  }
  return doc;
};

const ShopAvailability = mongoose.model('ShopAvailability', shopAvailabilitySchema);
export default ShopAvailability;
