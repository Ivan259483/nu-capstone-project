export type CustomerTone = 'neutral' | 'active' | 'success' | 'warning' | 'danger';

export function getCustomerBookingTone(booking: { status?: unknown }): CustomerTone {
  const status = String(booking.status || '').toLowerCase().replace(/-/g, '_');
  if (['cancelled', 'rejected', 'not_approved', 'failed'].includes(status)) return 'danger';
  if (['completed', 'released', 'done', 'delivered', 'paid'].includes(status)) return 'success';
  if (['pending', 'pending_confirmation'].includes(status)) return 'warning';
  return status ? 'active' : 'neutral';
}

type VehicleReference = string | { id?: string; _id?: string } | null;
function identity(value: VehicleReference | undefined): string {
  return typeof value === 'string' ? value.trim() : String(value?._id || value?.id || '').trim();
}

export function belongsToHistoryVehicle(
  order: { vehicleId?: VehicleReference; vehicle?: VehicleReference; vehiclePlate?: string },
  vehicle: { id?: string; _id?: string; plate?: string; plateNumber?: string },
): boolean {
  const orderId = identity(order.vehicleId) || identity(order.vehicle);
  const vehicleId = identity(vehicle);
  if (orderId && vehicleId) return orderId === vehicleId;
  const normalizePlate = (plate?: string) => String(plate || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const plate = normalizePlate(vehicle.plate || vehicle.plateNumber);
  return Boolean(plate && normalizePlate(order.vehiclePlate) === plate);
}
