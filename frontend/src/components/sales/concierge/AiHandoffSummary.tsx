import { Sparkles } from 'lucide-react';
import type { ConciergeConversation } from './conciergeTypes';

type Entry = { label: string; value: string };
const normalize = (value: string) => value.trim().toLowerCase();

function parseSummary(summary: string): Entry[] {
  return summary
    .split('|')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const separator = part.indexOf(':');
      return separator < 0
        ? { label: '', value: part }
        : {
            label: part.slice(0, separator).trim(),
            value: part.slice(separator + 1).trim(),
          };
    });
}

export default function AiHandoffSummary({
  conversation,
}: {
  conversation: ConciergeConversation;
}) {
  const entries = parseSummary(conversation.aiSummary);
  const find = (...labels: string[]) =>
    entries.find((entry) => labels.includes(normalize(entry.label)))?.value;
  const unstructured =
    entries.length === 1 && !entries[0].label ? entries[0].value : '';
  const missing = [
    conversation.phone === 'Not provided' ? 'Phone/contact' : '',
    conversation.vehicle === 'Not provided'
      ? 'Vehicle make, model, and year'
      : '',
    !conversation.plate ? 'Plate number' : '',
  ]
    .filter(Boolean)
    .join(', ');
  const fields = [
    {
      label: 'Customer intent',
      value: find('customer intent', 'intent', 'purpose') || unstructured,
    },
    {
      label: 'Latest customer request',
      value:
        find('latest request', 'customer request', 'concern', 'question') ||
        conversation.lastMessagePreview,
    },
    {
      label: 'Interested service',
      value:
        find('service', 'service interest') ||
        (conversation.serviceInterest === 'General inquiry'
          ? ''
          : conversation.serviceInterest),
    },
    {
      label: 'Vehicle information',
      value:
        conversation.vehicle === 'Not provided' ? '' : conversation.vehicle,
    },
    { label: 'Plate number', value: conversation.plate },
    {
      label: 'Preferred schedule',
      value: find(
        'preferred schedule',
        'schedule',
        'preferred date',
        'availability',
      ),
    },
    {
      label: 'Pricing question',
      value: find('pricing question', 'price question', 'pricing'),
    },
    {
      label: 'Missing information',
      value:
        find('missing information', 'missing info') ||
        missing ||
        'None identified from the available structured fields',
    },
    {
      label: 'Suggested next action',
      value: find('suggested next action', 'recommended action', 'next action'),
    },
  ];
  const knownLabels = new Set([
    'customer intent',
    'intent',
    'purpose',
    'latest request',
    'customer request',
    'concern',
    'question',
    'service',
    'service interest',
    'vehicle',
    'plate',
    'plate number',
    'preferred schedule',
    'schedule',
    'preferred date',
    'availability',
    'pricing question',
    'price question',
    'pricing',
    'missing information',
    'missing info',
    'suggested next action',
    'recommended action',
    'next action',
  ]);
  const additional = entries.filter(
    (entry) => entry.label && !knownLabels.has(normalize(entry.label)),
  );

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
      <dl className="mt-3 divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200 bg-white">
        {fields.map((field) => (
          <div key={field.label} className="px-3 py-2.5">
            <dt className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
              {field.label}
            </dt>
            <dd
              className={`mt-1 text-xs font-semibold leading-5 ${field.value ? 'text-slate-700' : 'text-slate-400'}`}
            >
              {field.value || 'Not provided'}
            </dd>
          </div>
        ))}
        {additional.map((entry) => (
          <div key={`${entry.label}-${entry.value}`} className="px-3 py-2.5">
            <dt className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
              {entry.label}
            </dt>
            <dd className="mt-1 text-xs font-semibold leading-5 text-slate-700">
              {entry.value || 'Not provided'}
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-2 text-[10px] leading-4 text-slate-400">
        Only information captured by the chatbot or customer record is shown.
      </p>
    </section>
  );
}
