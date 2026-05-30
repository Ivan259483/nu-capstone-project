import type { QCJob } from '@/hooks/useQCData';

function toText(value: unknown): string {
  return String(value ?? '').trim();
}

function toSearch(value: unknown): string {
  return toText(value).toLowerCase();
}

/** Match jobs by ID, customer, vehicle, plate, service, technician, etc. */
export function filterQCJobsBySearch(jobs: QCJob[], query: string): QCJob[] {
  const q = query.trim().toLowerCase();
  if (!q) return jobs;

  return jobs.filter((job) =>
    [
      job.id,
      job.jobId,
      job.customer,
      job.customerName,
      job.vehicle,
      job.make,
      job.plate,
      job.service,
      job.serviceType,
      job.technician,
      job.vehicleYear,
      job.vehicleMake,
      job.vehicleModel,
      job.customerPhone,
      job.customerEmail,
    ].some((value) => toSearch(value).includes(q)),
  );
}

export function formatQCJobSearchResult(job: QCJob): { title: string; subtitle: string } {
  const vehicle =
    job.vehicle ||
    [job.vehicleYear, job.vehicleMake, job.vehicleModel].filter(Boolean).join(' ').trim();
  const title = toText(job.customerName || job.customer) || 'Unknown customer';
  const subtitle = [job.jobId, vehicle, job.plate].filter(Boolean).join(' · ');
  return { title, subtitle: subtitle || job.id };
}
