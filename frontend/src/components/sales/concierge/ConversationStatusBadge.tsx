import { CheckCircle2 } from 'lucide-react';
import type { ConversationStatus } from './conciergeTypes';

type ConversationStatusBadgeProps = {
  status: ConversationStatus;
  compact?: boolean;
  detail?: string;
};

const STATUS_CLASSES: Record<ConversationStatus, string> = {
  'Needs Sales': 'border-amber-200 bg-amber-50 text-amber-700',
  'In Conversation': 'border-blue-200 bg-blue-50 text-blue-700',
  Resolved: 'border-slate-200 bg-slate-100 text-slate-600',
  Converted: 'border-emerald-200 bg-emerald-50 text-emerald-700',
};

export default function ConversationStatusBadge({
  status,
  compact = false,
  detail,
}: ConversationStatusBadgeProps) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full border font-semibold ${STATUS_CLASSES[status]} ${
        compact ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-[11px]'
      }`}
    >
      {status === 'Resolved' ? <CheckCircle2 size={compact ? 11 : 12} className="text-emerald-600" /> : null}
      {status}
      {detail ? <span aria-hidden="true">·</span> : null}
      {detail ? <span>{detail}</span> : null}
    </span>
  );
}
