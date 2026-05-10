/**
 * Types and mapping helpers for the Ops Manager dashboard.
 * Maps the existing Booking/User models to the Job/Technician shapes
 * required by the design UI.
 */
import type { Booking, User } from '@/types';
import type { JobStatus, Priority } from './ui/OpsUIKit';

// ═══ Ops-specific types ═══
export interface OpsJob {
  id: string;
  jobNumber: string;
  customer: string;
  customerPhone: string;
  serviceType: string;
  priority: Priority;
  status: JobStatus;
  technicianId: string | null;
  area: string;
  address: string;
  /** Plain plate for display, or empty */
  plateLabel: string;
  /** Stored plate cannot be decrypted (wrong/missing LEGACY_ENCRYPTION_KEY) */
  plateLocked: boolean;
  scheduledAt: string;
  eta: string;
  slaDeadline: string;
  slaStatus: 'On Track' | 'At Risk' | 'Breached';
  notes: string;
  createdAt: string;
  updatedAt: string;
  history: { timestamp: string; event: string; actor: string }[];
  // Keep original booking reference
  _booking: Booking;
}

export interface OpsTechnician {
  id: string;
  name: string;
  initials: string;
  avatar: string;
  specialty: string;
  status: 'Available' | 'Busy' | 'Break' | 'Offline';
  activeJobs: number;
  maxJobs: number;
  utilization: number;
  area: string;
  phone: string;
  completedToday: number;
  rating: number;
}

// ═══ Mappers ═══

/** Map a Booking status to the design's JobStatus */
function mapBookingStatus(status: string): JobStatus {
  const map: Record<string, JobStatus> = {
    pending: 'Queued',
    pending_confirmation: 'Queued',
    confirmed: 'Assigned',
    assigned: 'Assigned',
    received: 'En Route',
    in_progress: 'Ongoing',
    completed: 'Completed',
    paid: 'Completed',
    released: 'Completed',
    cancelled: 'Cancelled',
    failed: 'Delayed',
  };
  return map[status] || 'Queued';
}

/** Derive a priority from the booking context */
function derivePriority(b: Booking): Priority {
  // If overdue > 2 hours → Critical; today → High; else Medium
  if (!b.date || !b.time) return 'Medium';
  try {
    const scheduled = new Date(`${b.date}T${b.time}`);
    const now = new Date();
    const diffMs = scheduled.getTime() - now.getTime();
    const diffHours = diffMs / (1000 * 60 * 60);
    if (diffHours < -2) return 'Critical';
    if (diffHours < 0) return 'High';
    if (diffHours < 2) return 'High';
    return 'Medium';
  } catch {
    return 'Medium';
  }
}

/** Compute SLA status — bookings older than estimated window are "At Risk" or "Breached" */
function deriveSLA(b: Booking): 'On Track' | 'At Risk' | 'Breached' {
  if (!b.date || !b.time) return 'On Track';
  try {
    const scheduled = new Date(`${b.date}T${b.time}`);
    const now = new Date();
    const diffHours = (now.getTime() - scheduled.getTime()) / (1000 * 60 * 60);
    if (['completed', 'paid', 'released'].includes(b.status)) return 'On Track';
    if (diffHours > 4) return 'Breached';
    if (diffHours > 2) return 'At Risk';
    return 'On Track';
  } catch {
    return 'On Track';
  }
}

function formatTime(dateStr?: string): string {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return dateStr;
  }
}

/** Parse various time formats into a clean display string */
function formatScheduledTime(dateStr?: string, timeStr?: string): string {
  if (!timeStr && !dateStr) return 'Unscheduled';

  // If we have a time string, use it directly
  if (timeStr) {
    const t = timeStr.trim();

    // Already formatted like "10:00 AM" or "2:00 PM" — just return it
    if (/^\d{1,2}:\d{2}\s*(AM|PM)$/i.test(t)) return t;

    // Range format "10:00 AM - 12:00 PM" — return the start
    if (/^\d{1,2}:\d{2}\s*(AM|PM)\s*-/i.test(t)) {
      return t.split('-')[0].trim();
    }

    // 24h format "14:30" — convert to 12h
    if (/^\d{1,2}:\d{2}$/.test(t)) {
      const [hh, mm] = t.split(':').map(Number);
      const ampm = hh >= 12 ? 'PM' : 'AM';
      const h12 = hh === 0 ? 12 : hh > 12 ? hh - 12 : hh;
      return `${h12}:${String(mm).padStart(2, '0')} ${ampm}`;
    }

    // ISO time "14:30:00" — convert to 12h
    if (/^\d{2}:\d{2}:\d{2}/.test(t)) {
      const [hh, mm] = t.split(':').map(Number);
      const ampm = hh >= 12 ? 'PM' : 'AM';
      const h12 = hh === 0 ? 12 : hh > 12 ? hh - 12 : hh;
      return `${h12}:${String(mm).padStart(2, '0')} ${ampm}`;
    }

    // Fallback: return the raw value
    return t || 'Unscheduled';
  }

  // No time, but we have a date — try to extract time from it
  if (dateStr) {
    try {
      const d = new Date(dateStr);
      if (!isNaN(d.getTime())) {
        return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
      }
    } catch { /* ignore */ }
  }

  return 'Unscheduled';
}

/** Encrypted plate blob (iv:ciphertext hex) — never show as plate text if decrypt failed upstream */
const VEHICLE_PLATE_CIPHER_PATTERN = /^[0-9a-f]{32}:[0-9a-f]+$/i;

function displayableVehiclePlate(plate: string | undefined): string {
  const p = String(plate ?? '').trim();
  if (!p || VEHICLE_PLATE_CIPHER_PATTERN.test(p)) return '';
  return p;
}

/** Format a date string into a short display like "Apr 27" */
function formatScheduledDate(dateStr?: string): string {
  if (!dateStr) return '';
  try {
    // Handle "2026-04-27" or full ISO strings
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

export function mapBookingToJob(b: Booking, index: number): OpsJob {
  const status = mapBookingStatus(b.status);
  const detailerName =
    typeof b.assignedDetailer === 'object' && b.assignedDetailer
      ? (b.assignedDetailer as User).name || 'Staff'
      : null;
  const detailerId =
    typeof b.assignedDetailer === 'object' && b.assignedDetailer
      ? ((b.assignedDetailer as User)._id || (b.assignedDetailer as User).id)
      : (typeof b.assignedDetailer === 'string' ? b.assignedDetailer : null);

  // Build history from what we have
  const history: OpsJob['history'] = [];
  if (b.createdAt) history.push({ timestamp: formatTime(b.createdAt), event: 'Job created', actor: 'System' });
  if (detailerName) history.push({ timestamp: formatTime(b.updatedAt || b.createdAt), event: `Assigned to ${detailerName}`, actor: 'Operations' });
  if (b.status === 'in_progress') history.push({ timestamp: formatTime(b.updatedAt), event: 'Status changed to Ongoing', actor: detailerName || 'Staff' });
  if (['completed', 'paid', 'released'].includes(b.status)) history.push({ timestamp: formatTime(b.updatedAt), event: 'Job completed', actor: detailerName || 'Staff' });

  // Robust time parsing — handles "10:00 AM", "14:30", "10:00 AM - 12:00 PM", etc.
  const scheduledTime = formatScheduledTime(b.date, b.time);
  const scheduledDate = formatScheduledDate(b.date);

  const plateForUi = displayableVehiclePlate(b.vehiclePlate);
  const plateLocked = Boolean(b.vehiclePlateDecryptFailed);

  return {
    id: b.id,
    jobNumber: b.orderNumber || `JOB-${String(index + 1).padStart(4, '0')}`,
    customer: b.customerName || 'Customer',
    customerPhone: b.customerPhone || '',
    serviceType: b.serviceName || b.serviceType || 'Auto Detailing',
    priority: derivePriority(b),
    status,
    technicianId: detailerId,
    area: b.vehicleInfo || 'On-site',
    plateLabel: plateForUi,
    plateLocked,
    address: plateForUi
      ? `Plate: ${plateForUi}`
      : plateLocked
        ? 'Plate: unavailable (encryption key)'
        : '',
    scheduledAt: scheduledDate ? `${scheduledDate} ${scheduledTime}`.trim() : scheduledTime,
    eta: status === 'Completed' ? 'Done' : (status === 'Delayed' ? 'Overdue' : scheduledTime),
    slaDeadline: scheduledTime,
    slaStatus: deriveSLA(b),
    notes: b.notes || '',
    createdAt: b.createdAt,
    updatedAt: b.updatedAt || b.createdAt,
    history,
    _booking: b,
  };
}

const AVATAR_COLORS = [
  'bg-indigo-100 text-indigo-700',
  'bg-purple-100 text-purple-700',
  'bg-green-100 text-green-700',
  'bg-rose-100 text-rose-700',
  'bg-amber-100 text-amber-700',
  'bg-teal-100 text-teal-700',
  'bg-cyan-100 text-cyan-700',
  'bg-orange-100 text-orange-700',
];

const SPECIALTIES = ['Detailing', 'Coating', 'PPF', 'Tinting', 'Full Detail'];

export function mapUserToTechnician(u: User, allJobs: OpsJob[], index: number): OpsTechnician {
  const activeJobs = allJobs.filter(
    j => j.technicianId === (u._id || u.id) && !['Completed', 'Cancelled'].includes(j.status)
  ).length;
  const completedToday = allJobs.filter(
    j => j.technicianId === (u._id || u.id) && j.status === 'Completed'
  ).length;
  const maxJobs = 4;
  const utilization = Math.min(100, Math.round((activeJobs / maxJobs) * 100));

  const nameParts = (u.name || 'Unknown').split(' ');
  const initials = nameParts.map(n => n[0]?.toUpperCase() || '').join('').slice(0, 2);

  let techStatus: OpsTechnician['status'] = 'Available';
  if (!u.isActive) techStatus = 'Offline';
  else if (activeJobs >= maxJobs) techStatus = 'Busy';
  else if (activeJobs > 0) techStatus = 'Busy';

  return {
    id: u._id || u.id,
    name: u.name || 'Staff',
    initials,
    avatar: AVATAR_COLORS[index % AVATAR_COLORS.length],
    specialty: SPECIALTIES[index % SPECIALTIES.length],
    status: techStatus,
    activeJobs,
    maxJobs,
    utilization,
    area: 'On-site',
    phone: u.phone || '',
    completedToday,
    rating: 4.5 + (index % 5) * 0.1,
  };
}
