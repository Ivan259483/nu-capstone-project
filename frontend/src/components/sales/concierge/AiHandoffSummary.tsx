import { Sparkles } from 'lucide-react';

type AiHandoffSummaryProps = {
  summary: string;
  serviceInterest: string;
};

type SummaryEntry = {
  label: string;
  value: string;
};

const normalizeLabel = (label: string) => label.trim().toLowerCase();
const RESERVED_LABELS = new Set([
  'service',
  'service interest',
  'latest request',
  'customer concern',
  'concern',
  'question',
  'urgency',
  'priority',
]);

function parseSummary(summary: string): SummaryEntry[] {
  return summary
    .split('|')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const separator = part.indexOf(':');
      if (separator < 0) return { label: '', value: part };
      return {
        label: part.slice(0, separator).trim(),
        value: part.slice(separator + 1).trim(),
      };
    });
}

export default function AiHandoffSummary({
  summary,
  serviceInterest,
}: AiHandoffSummaryProps) {
  const entries = parseSummary(summary);
  const findEntry = (...labels: string[]) =>
    entries.find((entry) => labels.includes(normalizeLabel(entry.label)))?.value;
  const service =
    findEntry('service', 'service interest') ||
    (serviceInterest !== 'General inquiry' ? serviceInterest : '');
  const concern = findEntry('latest request', 'customer concern', 'concern', 'question');
  const urgency = findEntry('urgency', 'priority');
  const additionalContext = entries.filter(
    (entry) => entry.label && !RESERVED_LABELS.has(normalizeLabel(entry.label)),
  );
  const hasStructuredSummary =
    entries.length > 1 && Boolean(service || concern || urgency || additionalContext.length);

  return (
    <section
      className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5"
      aria-label="AI handoff summary"
    >
      <div className="flex items-center gap-2 text-blue-600">
        <Sparkles size={14} />
        <h3 className="text-[10px] font-bold uppercase tracking-[0.14em]">
          AI Handoff Summary
        </h3>
      </div>
      {hasStructuredSummary ? (
        <dl className="mt-3 space-y-2.5">
          {service ? (
            <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5">
              <dt className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                Service interest
              </dt>
              <dd className="mt-1 text-xs font-semibold leading-5 text-slate-700">{service}</dd>
            </div>
          ) : null}
          {concern ? (
            <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5">
              <dt className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                Customer concern or question
              </dt>
              <dd className="mt-1 text-xs font-semibold leading-5 text-slate-700">{concern}</dd>
            </div>
          ) : null}
          {urgency ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-2.5">
              <dt className="text-[10px] font-bold uppercase tracking-wide text-amber-600">
                Urgency
              </dt>
              <dd className="mt-1 text-xs font-semibold leading-5 text-amber-800">{urgency}</dd>
            </div>
          ) : null}
          {additionalContext.map((entry) => (
            <div
              key={`${entry.label}-${entry.value}`}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2.5"
            >
              <dt className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                {entry.label}
              </dt>
              <dd className="mt-1 text-xs font-semibold leading-5 text-slate-700">
                {entry.value}
              </dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="mt-3 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-xs font-medium leading-5 text-slate-600">
          {summary}
        </p>
      )}
    </section>
  );
}
