import { useState } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { CalendarPlus2, X } from 'lucide-react';
import type { BookingFromChatDraft, ConciergeConversation } from './conciergeTypes';

type BookingFromChatModalProps = {
  conversation: ConciergeConversation;
  onClose: () => void;
  onContinue: (draft: BookingFromChatDraft) => void;
};

export default function BookingFromChatModal({
  conversation,
  onClose,
  onContinue,
}: BookingFromChatModalProps) {
  const [draft, setDraft] = useState<BookingFromChatDraft>({
    customerName: conversation.customerName,
    vehicle: conversation.plate
      ? `${conversation.vehicle} · ${conversation.plate}`
      : conversation.vehicle,
    serviceInterest: conversation.serviceInterest,
    notes: conversation.bookingNotes,
  });

  const updateDraft = (field: keyof BookingFromChatDraft, value: string) => {
    setDraft((current) => ({ ...current, [field]: value }));
  };

  return (
    <DialogPrimitive.Root
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[70] bg-slate-950/35 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-[71] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_28px_70px_-24px_rgba(15,23,42,0.45)] focus:outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95">
          <div className="flex items-start justify-between border-b border-slate-100 px-5 py-4">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                <CalendarPlus2 size={19} />
              </div>
              <div>
                <DialogPrimitive.Title className="text-base font-bold text-slate-900">
                  Create booking from chat
                </DialogPrimitive.Title>
                <DialogPrimitive.Description className="mt-1 text-xs leading-5 text-slate-500">
                  Review the AI handoff details before continuing to the future booking workflow.
                </DialogPrimitive.Description>
              </div>
            </div>
            <DialogPrimitive.Close
              className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40"
              aria-label="Close create booking modal"
            >
              <X size={17} />
            </DialogPrimitive.Close>
          </div>

          <form
            onSubmit={(event) => {
              event.preventDefault();
              onContinue(draft);
            }}
          >
            <div className="scrollbar-thin max-h-[65vh] space-y-4 overflow-y-auto px-5 py-5">
              <label className="block">
                <span className="text-xs font-semibold text-slate-600">Customer name</span>
                <input
                  value={draft.customerName}
                  onChange={(event) => updateDraft('customerName', event.target.value)}
                  className="mt-1.5 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-500/15"
                />
              </label>

              <label className="block">
                <span className="text-xs font-semibold text-slate-600">Vehicle</span>
                <input
                  value={draft.vehicle}
                  onChange={(event) => updateDraft('vehicle', event.target.value)}
                  className="mt-1.5 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-500/15"
                />
              </label>

              <label className="block">
                <span className="text-xs font-semibold text-slate-600">Service interest</span>
                <input
                  value={draft.serviceInterest}
                  onChange={(event) => updateDraft('serviceInterest', event.target.value)}
                  className="mt-1.5 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-500/15"
                />
              </label>

              <label className="block">
                <span className="text-xs font-semibold text-slate-600">Notes from chat</span>
                <textarea
                  value={draft.notes}
                  onChange={(event) => updateDraft('notes', event.target.value)}
                  rows={4}
                  className="mt-1.5 w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm leading-5 text-slate-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-500/15"
                />
              </label>
            </div>

            <div className="flex flex-col-reverse gap-2 border-t border-slate-100 bg-slate-50/80 px-5 py-4 sm:flex-row sm:justify-end">
              <DialogPrimitive.Close asChild>
                <button
                  type="button"
                  className="rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/40"
                >
                  Cancel
                </button>
              </DialogPrimitive.Close>
              <button
                type="submit"
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-blue-600/20 transition-colors hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 focus-visible:ring-offset-2"
              >
                <CalendarPlus2 size={16} />
                Continue to Booking
              </button>
            </div>
          </form>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
