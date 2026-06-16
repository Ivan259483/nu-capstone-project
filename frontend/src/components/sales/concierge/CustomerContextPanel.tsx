import {
  Bot,
  CarFront,
  Copy,
  Hash,
  MessageSquareText,
  MoreHorizontal,
  Paperclip,
  Pencil,
  Phone,
  Plus,
  Send,
  Smile,
  Sparkles,
  Tag,
} from 'lucide-react';
import AiHandoffSummary from './AiHandoffSummary';
import type { ConciergeConversation } from './conciergeTypes';

type CustomerContextPanelProps = {
  conversation: ConciergeConversation | null;
  noteText: string;
  onNoteChange: (value: string) => void;
  onAddNote: () => void;
  onEdit: () => void;
  onAddAttribute: () => void;
  onMoreNote: () => void;
  onNoteTool: (tool: string) => void;
  onAskCustomer: () => void;
};

const formatCustomerId = (customerId: string) =>
  `CUS-${customerId.slice(-6).toUpperCase()}`;

export default function CustomerContextPanel({
  conversation,
  noteText,
  onNoteChange,
  onAddNote,
  onEdit,
  onAddAttribute,
  onMoreNote,
  onNoteTool,
  onAskCustomer,
}: CustomerContextPanelProps) {
  if (!conversation) {
    return (
      <aside className="flex min-h-[520px] items-center justify-center border-t border-slate-200 bg-white px-6 text-center lg:col-span-2 xl:col-span-1 xl:min-h-0 xl:border-l xl:border-t-0">
        <div>
          <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-slate-400">
            <MessageSquareText size={19} />
          </div>
          <p className="mt-3 text-sm font-semibold text-slate-700">Customer details will appear here</p>
        </div>
      </aside>
    );
  }

  const customerDisplayId = formatCustomerId(conversation.customerId);
  const details = [
    { label: 'Channel', value: conversation.source, icon: Bot },
    {
      label: 'Customer ID',
      value: customerDisplayId,
      fullValue: conversation.customerId,
      copyable: true,
      icon: Hash,
    },
    { label: 'Phone number', value: conversation.phone, icon: Phone },
    {
      label: 'Vehicle',
      value: conversation.vehicle || 'Not provided',
      icon: CarFront,
      askable: true,
    },
    {
      label: 'Plate number',
      value: conversation.plate || 'Not provided',
      icon: Tag,
      askable: true,
    },
    { label: 'Service interest', value: conversation.serviceInterest, icon: Sparkles },
  ];

  return (
    <aside className="flex min-h-[720px] min-w-0 flex-col overflow-hidden border-t border-slate-200 bg-white lg:col-span-2 xl:col-span-1 xl:min-h-0 xl:border-l xl:border-t-0">
      <header className="flex shrink-0 items-center justify-between border-b border-slate-200 px-5 py-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-black text-white ring-4 ring-slate-100">
            {conversation.initials}
          </div>
          <div className="min-w-0">
            <h2 className="truncate text-sm font-bold text-slate-900">{conversation.customerName}</h2>
            <p
              className="mt-0.5 truncate text-[11px] text-slate-500"
              title={conversation.customerId}
            >
              {customerDisplayId}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onEdit}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30"
        >
          <Pencil size={13} />
          Edit
        </button>
      </header>

      <div className="scrollbar-thin flex-1 overflow-y-auto px-5 py-5">
        <div className="space-y-[18px]">
          {details.map((detail) => (
            <div
              key={detail.label}
              className="grid grid-cols-[20px_96px_minmax(0,1fr)] items-start gap-2"
            >
              <detail.icon size={15} className="mt-0.5 text-slate-400" />
              <span className="text-xs font-medium text-slate-500">{detail.label}</span>
              <span
                className="flex min-w-0 flex-wrap items-center gap-1.5 break-words text-xs font-semibold leading-5 text-slate-800"
                title={detail.fullValue}
              >
                <span>{detail.value}</span>
                {detail.copyable && detail.fullValue ? (
                  <button
                    type="button"
                    onClick={() => void navigator.clipboard?.writeText(detail.fullValue)}
                    className="inline-flex h-5 w-5 items-center justify-center rounded text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C9A84C]/30"
                    title={`Copy full customer ID: ${detail.fullValue}`}
                    aria-label={`Copy full customer ID ${detail.fullValue}`}
                  >
                    <Copy size={11} />
                  </button>
                ) : null}
                {detail.askable && detail.value === 'Not provided' ? (
                  <button
                    type="button"
                    onClick={onAskCustomer}
                    className="inline-flex items-center gap-1 rounded-md border border-[#C9A84C] px-1.5 py-0.5 text-[10px] font-semibold text-[#8A6F24] transition-colors hover:bg-[#C9A84C]/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C9A84C]/30"
                    aria-label={`Ask customer for ${detail.label.toLowerCase()}`}
                  >
                    <MessageSquareText size={10} />
                    Ask customer
                  </button>
                ) : null}
              </span>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={onAddAttribute}
          className="mt-5 inline-flex w-full items-center gap-2 rounded-lg px-1 py-2 text-left text-xs font-semibold text-slate-500 transition-colors hover:bg-slate-50 hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30"
        >
          <Plus size={15} />
          Add new attribute
        </button>

        <div className="my-5 h-px bg-slate-200" />

        <AiHandoffSummary
          summary={conversation.aiSummary}
          serviceInterest={conversation.serviceInterest}
        />

        <div className="my-5 h-px bg-slate-200" />

        <section aria-labelledby="concierge-notes-heading">
          <h3 id="concierge-notes-heading" className="text-sm font-bold text-slate-800">
            Notes
          </h3>
          <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3 shadow-[0_10px_24px_-24px_rgba(15,23,42,0.4)] transition focus-within:border-blue-300">
            <textarea
              value={noteText}
              onChange={(event) => onNoteChange(event.target.value)}
              onKeyDown={(event) => {
                if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                  event.preventDefault();
                  onAddNote();
                }
              }}
              rows={4}
              placeholder="Write a note..."
              className="w-full resize-none border-0 bg-transparent text-sm leading-5 text-slate-800 outline-none placeholder:text-slate-400 focus:ring-0"
            />
            <div className="mt-2 flex items-center justify-between gap-2">
              <div className="flex items-center gap-1">
                {[
                  { label: 'Attach file', icon: Paperclip },
                  { label: 'Add emoji', icon: Smile },
                ].map((tool) => (
                  <button
                    key={tool.label}
                    type="button"
                    onClick={() => onNoteTool(tool.label)}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
                    aria-label={`${tool.label} to internal note`}
                  >
                    <tool.icon size={14} />
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={onAddNote}
                disabled={!noteText.trim()}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-blue-600 px-2.5 text-[11px] font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
              >
                <Send size={12} />
                Add note
              </button>
            </div>
          </div>
        </section>

        <div className="mt-6 flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">
            Internal activity
          </h3>
          <span className="text-[10px] font-medium text-slate-400">
            {conversation.internalNotes.length} note
            {conversation.internalNotes.length === 1 ? '' : 's'}
          </span>
        </div>

        <div className="mt-2 divide-y divide-slate-100" aria-label="Internal notes activity">
          {conversation.internalNotes.map((note) => (
            <article key={note.id} className="py-4 first:pt-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2.5">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-50 text-[10px] font-black text-blue-700">
                    ST
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-xs font-bold text-slate-800">{note.author}</p>
                    <p className="mt-0.5 text-[10px] text-slate-400">{note.time}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onMoreNote}
                  className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                  aria-label={`More options for note from ${note.author}`}
                >
                  <MoreHorizontal size={14} />
                </button>
              </div>
              <p className="mt-2 pl-10 text-xs leading-5 text-slate-600">{note.text}</p>
            </article>
          ))}
        </div>
      </div>
    </aside>
  );
}
