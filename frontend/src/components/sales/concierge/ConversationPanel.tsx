import { useEffect, useRef, useState } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import {
  Bot,
  CalendarClock,
  CalendarPlus2,
  Check,
  ChevronDown,
  Image,
  Paperclip,
  PhilippinePeso,
  RotateCcw,
  Send,
  Smile,
  Sparkles,
  Trash2,
  Type,
  UserRound,
  UserRoundCheck,
  X,
} from 'lucide-react';
import ConversationStatusBadge from './ConversationStatusBadge';
import type {
  ConciergeConversation,
  ConciergeMessage,
  ResolutionReason,
} from './conciergeTypes';

type Props = {
  conversation: ConciergeConversation | null;
  currentUserId?: string;
  replyText: string;
  busy?: boolean;
  onReplyChange: (value: string) => void;
  onSend: () => void;
  onResolve: (reason: ResolutionReason) => void;
  onDelete: () => Promise<boolean>;
  onReopen: () => void;
  onCreateBooking: () => void;
  onTakeConversation: () => void;
  onSetWaiting: () => void;
  onSendPricing: () => void;
  onOfferSchedule: () => void;
  onComposerTool: (tool: string) => void;
};

const TEMPLATES = [
  {
    label: 'Vehicle information',
    text: 'Could you provide your vehicle make, model, year, and plate number so I can check the correct service options for you?',
  },
  {
    label: 'Scheduling',
    text: 'What date works best for you? I’ll check the live appointment availability before offering a time.',
  },
  {
    label: 'Payment',
    text: 'Once your booking details are confirmed, I can explain the current payment and reservation requirements.',
  },
  {
    label: 'Follow-up',
    text: 'Hi! I’m following up on your service inquiry. Would you like to continue with pricing or appointment scheduling?',
  },
  {
    label: 'Thank you',
    text: 'Thank you for contacting AutoSPF+. Please let me know if there is anything else I can help you with.',
  },
];

const RESOLUTION_REASONS: { value: ResolutionReason; label: string }[] = [
  { value: 'booking_created', label: 'Booking created' },
  { value: 'question_answered', label: 'Question answered' },
  { value: 'customer_declined', label: 'Customer declined' },
  { value: 'no_response', label: 'No response' },
  { value: 'duplicate_spam', label: 'Duplicate / spam' },
  { value: 'other', label: 'Other' },
];

function MessageBubble({ message }: { message: ConciergeMessage }) {
  if (message.sender === 'system') {
    return (
      <div className="flex justify-center py-1">
        <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[10px] font-semibold text-slate-500 shadow-sm">
          {message.text}
        </span>
      </div>
    );
  }
  const customer = message.sender === 'customer';
  const label = customer
    ? 'Customer'
    : message.sender === 'ai'
      ? 'AutoSPF+ AI'
      : 'Sales';
  return (
    <div className={`flex ${customer ? 'justify-start' : 'justify-end'}`}>
      <div
        className={`flex max-w-[86%] flex-col sm:max-w-[76%] ${customer ? 'items-start' : 'items-end'}`}
      >
        <div className="mb-1 flex items-center gap-1.5 px-1">
          {customer ? (
            <UserRound size={11} className="text-slate-400" />
          ) : message.sender === 'ai' ? (
            <Bot size={11} className="text-blue-500" />
          ) : (
            <UserRoundCheck size={11} className="text-blue-500" />
          )}
          <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
            {label}
          </span>
        </div>
        <div
          className={`whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm leading-6 ${customer ? 'rounded-tl-md bg-slate-100 text-slate-700 ring-1 ring-inset ring-slate-200/60' : 'rounded-tr-md bg-blue-600 text-white shadow-sm shadow-blue-600/10'}`}
        >
          {message.text}
          <span
            className={`ml-3 inline-block text-[10px] ${customer ? 'text-slate-400' : 'text-blue-100'}`}
          >
            {message.sentAt}
          </span>
        </div>
      </div>
    </div>
  );
}

export default function ConversationPanel({
  conversation,
  currentUserId,
  replyText,
  busy = false,
  onReplyChange,
  onSend,
  onResolve,
  onDelete,
  onReopen,
  onCreateBooking,
  onTakeConversation,
  onSetWaiting,
  onSendPricing,
  onOfferSchedule,
  onComposerTool,
}: Props) {
  const latestMessageRef = useRef<HTMLDivElement>(null);
  const textAreaRef = useRef<HTMLTextAreaElement>(null);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [resolveOpen, setResolveOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [resolutionReason, setResolutionReason] =
    useState<ResolutionReason>('question_answered');

  useEffect(() => {
    const textarea = textAreaRef.current;
    if (!textarea) return;
    textarea.style.height = '0px';
    textarea.style.height = `${Math.min(144, Math.max(44, textarea.scrollHeight))}px`;
  }, [replyText]);

  useEffect(() => {
    latestMessageRef.current?.scrollIntoView({ block: 'nearest' });
  }, [conversation?.id, conversation?.messages.length]);

  if (!conversation) {
    return (
      <section className="flex min-h-[620px] items-center justify-center border-t border-slate-200 bg-slate-50/40 px-6 text-center lg:border-l lg:border-t-0 xl:min-h-0">
        <div>
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-blue-50 text-blue-600">
            <Bot size={23} />
          </span>
          <h2 className="mt-4 text-base font-bold text-slate-900">
            Select a customer conversation
          </h2>
          <p className="mt-1.5 max-w-sm text-sm leading-6 text-slate-500">
            Choose a handoff to review context and continue as Sales.
          </p>
        </div>
      </section>
    );
  }

  const resolved = conversation.status === 'Resolved';
  const assignedToOther =
    Boolean(conversation.assignedSalesId) &&
    Boolean(currentUserId) &&
    conversation.assignedSalesId !== currentUserId;
  const unassigned = !conversation.assignedSalesId;
  const canReply = !resolved && !assignedToOther;

  return (
    <section className="flex min-h-[760px] min-w-0 flex-col overflow-hidden border-t border-slate-200 bg-white lg:border-l lg:border-t-0 xl:min-h-0">
      <header className="shrink-0 border-b border-slate-200 px-5 py-4 lg:px-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-black text-white ring-4 ring-blue-50">
              {conversation.initials}
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="truncate text-sm font-bold text-slate-950">
                  {conversation.customerName}
                </h2>
                <ConversationStatusBadge status={conversation.status} compact />
              </div>
              <p className="mt-1 text-[11px] text-slate-500">
                {conversation.lastCustomerActivityLabel} ·{' '}
                {conversation.handoffTimeLabel}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {unassigned && !resolved ? (
              <button
                type="button"
                onClick={onTakeConversation}
                disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-100 disabled:opacity-50"
              >
                <UserRoundCheck size={13} />
                Take conversation
              </button>
            ) : null}
            {!resolved ? (
              <button
                type="button"
                onClick={onCreateBooking}
                disabled={
                  busy ||
                  assignedToOther ||
                  Boolean(conversation.linkedBookingId)
                }
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                <CalendarPlus2 size={14} />
                {conversation.linkedBookingId
                  ? 'Booking created'
                  : 'Create Booking'}
              </button>
            ) : null}
            {resolved ? (
              <button
                type="button"
                onClick={onReopen}
                disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-white px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-50"
              >
                <RotateCcw size={13} />
                Reopen
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setResolveOpen(true)}
                disabled={busy || assignedToOther}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                <Check size={13} />
                Resolve
              </button>
            )}
            <button
              type="button"
              onClick={() => setDeleteOpen(true)}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
            >
              <Trash2 size={13} />
              Delete
            </button>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-2.5 py-1.5 text-[11px] font-semibold text-slate-600">
            <Bot size={12} />
            AI paused after handoff
          </span>
          {!resolved ? (
            <button
              type="button"
              onClick={onSetWaiting}
              disabled={
                busy ||
                assignedToOther ||
                conversation.status === 'Waiting for Customer'
              }
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
            >
              Waiting for customer
            </button>
          ) : null}
          <span className="ml-auto text-[11px] font-medium text-slate-400">
            {conversation.assignedSalesName
              ? `Assigned to ${conversation.assignedSalesName}`
              : 'Unassigned'}
          </span>
        </div>
      </header>

      <div className="scrollbar-thin flex min-h-0 flex-1 flex-col overflow-y-auto bg-slate-50/20">
        <div className="mx-auto w-full max-w-4xl space-y-6 px-5 py-8 sm:px-8 lg:px-10">
          {conversation.messages.length ? (
            conversation.messages.map((message) => (
              <MessageBubble key={message.id} message={message} />
            ))
          ) : (
            <p className="py-16 text-center text-sm text-slate-400">
              No messages in this handoff yet.
            </p>
          )}
          <div ref={latestMessageRef} aria-hidden="true" />
        </div>
      </div>

      <div className="shrink-0 border-t border-slate-200 bg-white p-4 lg:px-6">
        <div className="mx-auto mb-2 flex w-full max-w-4xl flex-wrap gap-2">
          <button
            type="button"
            onClick={onSendPricing}
            disabled={!canReply || busy}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            <PhilippinePeso size={13} />
            Send Pricing
          </button>
          <button
            type="button"
            onClick={onOfferSchedule}
            disabled={!canReply || busy}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            <CalendarClock size={13} />
            Offer Schedule
          </button>
        </div>
        <div className="relative mx-auto w-full max-w-4xl rounded-2xl border border-slate-200 bg-white p-3 shadow-[0_12px_32px_-26px_rgba(15,23,42,0.35)] focus-within:border-blue-300 focus-within:ring-2 focus-within:ring-blue-500/10">
          {templatesOpen ? (
            <div className="absolute bottom-[calc(100%+8px)] left-0 z-20 w-full max-w-sm overflow-hidden rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl">
              {TEMPLATES.map((template) => (
                <button
                  key={template.label}
                  type="button"
                  onClick={() => {
                    onReplyChange(template.text);
                    setTemplatesOpen(false);
                    textAreaRef.current?.focus();
                  }}
                  className="block w-full rounded-lg px-3 py-2 text-left hover:bg-slate-50"
                >
                  <span className="block text-xs font-bold text-slate-800">
                    {template.label}
                  </span>
                  <span className="mt-0.5 block line-clamp-1 text-[11px] text-slate-500">
                    {template.text}
                  </span>
                </button>
              ))}
            </div>
          ) : null}
          <label htmlFor="sales-concierge-reply" className="sr-only">
            Reply as Sales
          </label>
          <textarea
            ref={textAreaRef}
            id="sales-concierge-reply"
            value={replyText}
            onChange={(event) => {
              onReplyChange(event.target.value);
              setTemplatesOpen(event.target.value === '/');
            }}
            disabled={!canReply || busy}
            onKeyDown={(event) => {
              if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                event.preventDefault();
                onSend();
              }
            }}
            rows={1}
            placeholder={
              assignedToOther
                ? `Assigned to ${conversation.assignedSalesName}`
                : 'Reply to customer… Type / for templates'
            }
            className="max-h-36 min-h-11 w-full resize-none overflow-y-auto border-0 bg-transparent px-2 py-2 text-sm leading-6 text-slate-800 outline-none placeholder:text-slate-400 focus:ring-0 disabled:bg-slate-50 disabled:text-slate-400"
          />
          <div className="mt-1 flex items-center justify-between gap-2">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setTemplatesOpen((open) => !open)}
                className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-slate-500 hover:bg-slate-100"
                aria-label="Open Sales response templates"
              >
                <Sparkles size={15} />
                Templates
                <ChevronDown size={11} />
              </button>
              {[
                { label: 'Attach file', icon: Paperclip },
                { label: 'Add emoji', icon: Smile },
                { label: 'Add image', icon: Image },
                { label: 'Formatting', icon: Type },
              ].map((tool) => (
                <button
                  key={tool.label}
                  type="button"
                  onClick={() => onComposerTool(tool.label)}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                  aria-label={tool.label}
                >
                  <tool.icon size={16} />
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={onSend}
              disabled={!replyText.trim() || !canReply || busy}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
            >
              Send
              <Send size={14} />
            </button>
          </div>
        </div>
      </div>

      <DialogPrimitive.Root open={resolveOpen} onOpenChange={setResolveOpen}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-[80] bg-slate-950/35" />
          <DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-[81] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl focus:outline-none">
            <div className="flex items-start justify-between">
              <div>
                <DialogPrimitive.Title className="text-base font-bold text-slate-900">
                  Resolve conversation
                </DialogPrimitive.Title>
                <DialogPrimitive.Description className="mt-1 text-xs leading-5 text-slate-500">
                  Choose a reason for activity history and reporting.
                </DialogPrimitive.Description>
              </div>
              <DialogPrimitive.Close className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100">
                <X size={16} />
              </DialogPrimitive.Close>
            </div>
            <div className="mt-4 space-y-2">
              {RESOLUTION_REASONS.map((reason) => (
                <label
                  key={reason.value}
                  className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 text-sm font-semibold ${resolutionReason === reason.value ? 'border-blue-300 bg-blue-50 text-blue-800' : 'border-slate-200 text-slate-700'}`}
                >
                  <input
                    type="radio"
                    name="resolution"
                    value={reason.value}
                    checked={resolutionReason === reason.value}
                    onChange={() => setResolutionReason(reason.value)}
                  />
                  {reason.label}
                </label>
              ))}
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <DialogPrimitive.Close asChild>
                <button
                  type="button"
                  className="rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100"
                >
                  Cancel
                </button>
              </DialogPrimitive.Close>
              <button
                type="button"
                onClick={() => {
                  onResolve(resolutionReason);
                  setResolveOpen(false);
                }}
                className={`rounded-xl px-4 py-2.5 text-sm font-semibold text-white ${resolutionReason === 'duplicate_spam' ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'}`}
              >
                Resolve
              </button>
            </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>

      <DialogPrimitive.Root open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-[80] bg-slate-950/40" />
          <DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-[81] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-red-100 bg-white p-5 shadow-2xl focus:outline-none">
            <div className="flex items-start justify-between gap-4">
              <div>
                <DialogPrimitive.Title className="text-base font-bold text-slate-900">
                  Delete conversation?
                </DialogPrimitive.Title>
                <DialogPrimitive.Description className="mt-1.5 text-sm leading-6 text-slate-500">
                  This permanently removes the conversation, messages, internal notes, and chat session for {conversation.customerName}. Any booking already created from this conversation will be preserved.
                </DialogPrimitive.Description>
              </div>
              <DialogPrimitive.Close
                disabled={busy}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 disabled:opacity-50"
              >
                <X size={16} />
              </DialogPrimitive.Close>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <DialogPrimitive.Close asChild>
                <button
                  type="button"
                  disabled={busy}
                  className="rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-50"
                >
                  Cancel
                </button>
              </DialogPrimitive.Close>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  void onDelete().then((deleted) => {
                    if (deleted) setDeleteOpen(false);
                  });
                }}
                className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-red-300"
              >
                <Trash2 size={15} />
                {busy ? 'Deleting…' : 'Delete conversation'}
              </button>
            </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </section>
  );
}
