import { resolveReceiptPhoneForClient } from './phone-client.utils.js';

const asRecord = (value) =>
  value && typeof value === 'object' && !Array.isArray(value) ? value : {};

const firstText = (...values) => {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
    if (typeof value !== 'string') continue;
    const trimmed = value.trim();
    if (trimmed && !['null', 'undefined'].includes(trimmed.toLowerCase())) return trimmed;
  }
  return '';
};

export function hydrateReceiptSnapshot(snapshotValue, orderValue) {
  const snapshot = asRecord(snapshotValue);
  const order = asRecord(orderValue);
  const snapshotVehicle = asRecord(snapshot.vehicle);
  const linkedVehicle = asRecord(order.vehicle);
  const customerPhone = resolveReceiptPhoneForClient(snapshot, order);

  const vehicle = {
    ...snapshotVehicle,
    year: firstText(snapshotVehicle.year, order.vehicleYear, linkedVehicle.year),
    make: firstText(snapshotVehicle.make, order.vehicleMake, linkedVehicle.make),
    model: firstText(snapshotVehicle.model, order.vehicleModel, linkedVehicle.model),
    plate: firstText(snapshotVehicle.plate, snapshotVehicle.plateNumber, order.vehiclePlate, linkedVehicle.plateNumber),
    color: firstText(
      snapshotVehicle.color,
      snapshotVehicle.colorName,
      snapshotVehicle.paintColor,
      order.vehicleColor,
      linkedVehicle.color
    ),
    type: firstText(
      snapshotVehicle.type,
      snapshotVehicle.class,
      snapshotVehicle.vehicleType,
      snapshotVehicle.category,
      order.vehicleType,
      order.vehicleClass,
      order.vehicleCategory,
      linkedVehicle.vehicleType
    ),
  };

  const hydrated = { ...snapshot, vehicle };
  if (customerPhone) hydrated.customerPhone = customerPhone;
  else delete hydrated.customerPhone;
  return hydrated;
}
