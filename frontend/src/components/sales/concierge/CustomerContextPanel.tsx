import {
  Bot,
  CalendarCheck2,
  CarFront,
  Clock3,
  Copy,
  Hash,
  Mail,
  MessageSquareText,
  Phone,
  Send,
  Sparkles,
  Tag,
  UserRoundCheck,
} from 'lucide-react';
import AiHandoffSummary from './AiHandoffSummary';
import type { ConciergeConversation } from './conciergeTypes';

type Props = {
  conversation: ConciergeConversation | null;
  noteText: string;
  busy?: boolean;
  onNoteChange: (value: string) => void;
  onAddNote: () => void;
  onAskCustomer: (field: 'vehicle' | 'plate') => void;
};

const displayCustomerId = (customerId: string) =>
  customerId.startsWith('GUEST-')
    ? customerId
    : `CUS-${customerId.slice(-6).toUpperCase()}`;

export default function CustomerContextPanel({
  conversation,
  noteText,
  busy = false,
  onNoteChange,
  onAddNote,
  onAskCustomer,
}: Props) {
  if (!conversation) {
    return (
      <aside className="flex min-h-[520px] items-center justify-center border-t border-slate-200 bg-white px-6 text-center lg:col-span-2 xl:col-span-1 xl:min-h-0 xl:border-l xl:border-t-0">
        <div>
          <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-slate-400">
            <MessageSquareText size={19} />
          </span>
          <p className="mt-3 text-sm font-semibold text-slate-700">
            Customer context will appear here
          </p>
        </div>
      </aside>
    );
  }

  const customerId = displayCustomerId(conversation.customerId);
  const details = [
    { label: 'Source', value: conversation.source, icon: Bot },
    {
      label: 'Customer ID',
      value: customerId,
      fullValue: conversation.customerId,
      icon: Hash,
    },
    { label: 'Phone', value: conversation.phone, icon: Phone },
    { label: 'Email', value: conversation.email, icon: Mail },
    {
      label: 'Vehicle',
      value: conversation.vehicle || 'Not provided',
      icon: CarFront,
      ask: 'vehicle' as const,
    },
    {
      label: 'Plate',
      value: conversation.plate || 'Not provided',
      icon: Tag,
      ask: 'plate' as const,
    },
    { label: 'Service', value: conversation.serviceInterest, icon: Sparkles },
    {
      label: 'Assignment',
      value: conversation.assignedSalesName || 'Unassigned',
      icon: UserRoundCheck,
    },
    { label: 'Handoff', value: conversation.handoffTimeLabel, icon: Clock3 },
    {
      label: 'Customer activity',
      value: conversation.lastCustomerActivityLabel,
      icon: MessageSquareText,
    },
  ];

  return (
    <aside className="flex min-h-[720px] min-w-0 flex-col overflow-hidden border-t border-slate-200 bg-white lg:col-span-2 xl:col-span-1 xl:min-h-0 xl:border-l xl:border-t-0">
      <header className="flex shrink-0 items-center gap-3 border-b border-slate-200 px-5 py-4">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-800 text-xs font-black text-white ring-4 ring-slate-100">
          {conversation.initials}
        </span>
        <div className="min-w-0">
          <h2 className="truncate text-sm font-bold text-slate-900">
            {conversation.customerName}
          </h2>
          <p
            className="mt-0.5 truncate text-[11px] text-slate-500"
            title={conversation.customerId}
          >
            {customerId}
          </p>
        </div>
      </header>

      <div className="scrollbar-thin flex-1 overflow-y-auto px-5 py-5">
        <div className="space-y-3">
          {details.map((detail) => (
            <div
              key={detail.label}
              className="grid grid-cols-[18px_88px_minmax(0,1fr)] items-start gap-2"
            >
              <detail.icon size={14} className="mt-0.5 text-slate-400" />
              <span className="text-[11px] font-medium text-slate-500">
                {detail.label}
              </span>
              <span className="flex min-w-0 flex-wrap items-center gap-1.5 break-words text-[11px] font-semibold leading-5 text-slate-800">
                <span>{detail.value}</span>
                {detail.fullValue ? (
                  <button
                    type="button"
                    onClick={() =>
                      void navigator.clipboard?.writeText(detail.fullValue)
                    }
                    className="inline-flex h-5 w-5 items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                    aria-label={`Copy full customer ID ${detail.fullValue}`}
                  >
                    <Copy size={11} />
                  </button>
                ) : null}
                {detail.ask && detail.value === 'Not provided' ? (
                  <button
                    type="button"
                    onClick={() => onAskCustomer(detail.ask)}
                    className="inline-flex items-center gap-1 rounded-md border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700 hover:bg-blue-100"
                  >
                    <MessageSquareText size={10} />
                    Ask customer
                  </button>
                ) : null}
              </span>
            </div>
          ))}
        </div>

        {conversation.linkedBookingId ? (
          <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
            <div className="flex items-center gap-2 text-emerald-700">
              <CalendarCheck2 size={15} />
              <p className="text-[10px] font-bold uppercase tracking-wide">
                Booking created
              </p>
            </div>
            <p className="mt-1.5 text-sm font-bold text-emerald-950">
              {conversation.linkedBookingReference ||
                conversation.linkedBookingId}
            </p>
          </div>
        ) : null}

        <div className="my-5 h-px bg-slate-200" />
        <AiHandoffSummary conversation={conversation} />
        <div className="my-5 h-px bg-slate-200" />

        <section aria-labelledby="concierge-notes-heading">
          <div className="flex items-center justify-between">
            <h3
              id="concierge-notes-heading"
              className="text-sm font-bold text-slate-800"
            >
              Internal notes
            </h3>
            <span className="text-[10px] font-medium text-slate-400">
              {conversation.internalNotes.length}
            </span>
          </div>
          <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3 focus-within:border-blue-300">
            <textarea
              value={noteText}
              onChange={(event) => onNoteChange(event.target.value)}
              onKeyDown={(event) => {
                if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                  event.preventDefault();
                  onAddNote();
                }
              }}
              rows={2}
              maxLength={2000}
              placeholder="Add a private note…"
              className="w-full resize-y border-0 bg-transparent text-sm leading-5 text-slate-800 outline-none placeholder:text-slate-400 focus:ring-0"
            />
            <div className="mt-2 flex justify-end">
              <button
                type="button"
                onClick={onAddNote}
                disabled={!noteText.trim() || busy}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-blue-600 px-2.5 text-[11px] font-semibold text-white hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400"
              >
                <Send size={12} />
                Add note
              </button>
            </div>
          </div>
          <div className="mt-3 divide-y divide-slate-100">
            {conversation.internalNotes.length ? (
              conversation.internalNotes.map((note) => (
                <article key={note.id} className="py-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-xs font-bold text-slate-800">
                      {note.author}
                    </p>
                    <time className="shrink-0 text-[10px] text-slate-400">
                      {note.time}
                    </time>
                  </div>
                  <p className="mt-1 text-xs leading-5 text-slate-600">
                    {note.text}
                  </p>
                </article>
              ))
            ) : (
              <p className="py-4 text-center text-xs text-slate-400">
                No internal notes yet.
              </p>
            )}
          </div>
        </section>
      </div>
    </aside>
  );
}
