import { useEffect, useRef } from 'react';
import {
  Bot,
  CalendarPlus2,
  Check,
  ChevronDown,
  Image,
  Paperclip,
  Pause,
  RotateCcw,
  Send,
  Smile,
  Type,
  UserRound,
  UserRoundCheck,
} from 'lucide-react';
import ConversationStatusBadge from './ConversationStatusBadge';
import { QUICK_REPLIES } from './conciergeData';
import type { ConciergeConversation, ConciergeMessage } from './conciergeTypes';

type ConversationPanelProps = {
  conversation: ConciergeConversation | null;
  replyText: string;
  paused: boolean;
  busy?: boolean;
  onReplyChange: (value: string) => void;
  onSend: () => void;
  onTogglePause: () => void;
  onMarkResolved: () => void;
  onReopen: () => void;
  onCreateBooking: () => void;
  onMore: () => void;
  onComposerTool: (tool: string) => void;
};

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

  const isCustomer = message.sender === 'customer';
  const label = isCustomer ? 'Customer' : message.sender === 'ai' ? 'AutoSPF+ AI' : 'Sales';

  return (
    <div className={`flex ${isCustomer ? 'justify-start' : 'justify-end'}`}>
      <div
        className={`flex max-w-[86%] flex-col sm:max-w-[76%] ${
          isCustomer ? 'items-start' : 'items-end'
        }`}
      >
        <div className="mb-1 flex items-center gap-1.5 px-1">
          {isCustomer ? (
            <UserRound size={11} className="text-slate-400" />
          ) : message.sender === 'ai' ? (
            <Bot size={11} className="text-blue-500" />
          ) : (
            <UserRoundCheck size={11} className="text-blue-500" />
          )}
          <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</span>
        </div>
        <div
          className={`rounded-2xl px-4 py-3 text-sm leading-6 ${
            isCustomer
              ? 'rounded-tl-md bg-slate-100 text-slate-700 ring-1 ring-inset ring-slate-200/60'
              : 'rounded-tr-md bg-blue-600 text-white shadow-sm shadow-blue-600/10'
          }`}
        >
          {message.text}
          <span
            className={`ml-3 inline-block text-[10px] ${
              isCustomer ? 'text-slate-400' : 'text-blue-100'
            }`}
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
  replyText,
  paused,
  busy = false,
  onReplyChange,
  onSend,
  onTogglePause,
  onMarkResolved,
  onReopen,
  onCreateBooking,
  onMore,
  onComposerTool,
}: ConversationPanelProps) {
  const latestMessageRef = useRef<HTMLDivElement>(null);
  const observedConversationIdRef = useRef<string | null>(null);
  const observedMessageCountRef = useRef(0);

  useEffect(() => {
    if (!conversation) return;
    if (!window.matchMedia('(min-width: 1280px)').matches) return;
    const conversationChanged = observedConversationIdRef.current !== conversation.id;
    const messageAdded =
      !conversationChanged && conversation.messages.length > observedMessageCountRef.current;
    observedConversationIdRef.current = conversation.id;
    observedMessageCountRef.current = conversation.messages.length;

    const target = conversationChanged || messageAdded
      ? latestMessageRef.current
      : null;
    target?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [conversation?.id, conversation?.messages.length]);

  if (!conversation) {
    return (
      <section className="flex min-h-[620px] items-center justify-center border-t border-slate-200 bg-slate-50/40 px-6 text-center lg:border-l lg:border-t-0 xl:min-h-0">
        <div>
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-blue-50 text-blue-600">
            <Bot size={23} />
          </div>
          <h2 className="mt-4 text-base font-bold text-slate-900">Select a customer conversation</h2>
          <p className="mt-1.5 max-w-sm text-sm leading-6 text-slate-500">
            Choose an inquiry to view the AI handoff and continue as Sales.
          </p>
        </div>
      </section>
    );
  }

  const isResolved = conversation.status === 'Resolved';
  const isClosed = isResolved || conversation.status === 'Converted';

  return (
    <section className="flex min-h-[760px] min-w-0 flex-col overflow-hidden border-t border-slate-200 bg-white lg:border-l lg:border-t-0 xl:min-h-0">
      <header className="flex shrink-0 flex-col gap-3 border-b border-slate-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between lg:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-black text-white ring-4 ring-blue-50">
            {conversation.initials}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-sm font-bold text-slate-950">{conversation.customerName}</h2>
              <ConversationStatusBadge status={conversation.status} compact />
            </div>
            <p className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500">
              <span className={`h-1.5 w-1.5 rounded-full ${isClosed ? 'bg-slate-300' : 'bg-emerald-500'}`} />
              {isClosed ? 'Conversation closed' : paused ? 'Paused by Sales' : conversation.lastActive}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onTogglePause}
            disabled={isClosed || busy}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ${
              paused
                ? 'border-amber-200 bg-amber-50 text-amber-700'
                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400'
            }`}
          >
            <Pause size={13} />
            {paused ? 'Resume' : 'Pause'}
          </button>
          {isResolved ? (
            <button
              type="button"
              onClick={onReopen}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              <RotateCcw size={13} />
              Reopen
            </button>
          ) : (
            <button
              type="button"
              onClick={onMarkResolved}
              disabled={conversation.status === 'Converted' || busy}
              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              <Check size={13} />
              {conversation.status === 'Converted' ? 'Converted' : 'Close'}
            </button>
          )}
          <button
            type="button"
            onClick={onMore}
            disabled={busy}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-slate-600 transition-colors hover:bg-slate-50"
            aria-label={`Assign or open more actions for ${conversation.customerName}`}
          >
            <UserRoundCheck size={14} />
            <ChevronDown size={12} />
          </button>
        </div>
      </header>

      <div className="scrollbar-thin flex min-h-0 flex-1 flex-col overflow-y-auto bg-slate-50/20">
        <div className="mx-auto w-full max-w-4xl space-y-6 px-5 py-10 sm:px-8 lg:px-10">
          {conversation.messages.map((message) => (
            <MessageBubble key={message.id} message={message} />
          ))}

          <div className="flex flex-wrap justify-center gap-2" aria-label="Conversation quick actions">
            {QUICK_REPLIES.map((reply) => (
              <button
                key={reply.label}
                type="button"
                onClick={() => {
                  if (reply.label === 'Create Booking') {
                    onCreateBooking();
                    return;
                  }
                  onReplyChange(reply.text);
                }}
                className={`rounded-lg border px-3.5 py-2 text-xs font-semibold shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C9A84C]/30 ${
                  reply.label === 'Create Booking'
                    ? 'border-[#C9A84C] bg-[#C9A84C] text-white hover:bg-[#B8973F]'
                    : 'border-[#C9A84C] bg-white text-[#8A6F24] hover:bg-[#C9A84C]/10'
                }`}
              >
                {reply.label}
              </button>
            ))}
          </div>

          <div ref={latestMessageRef} aria-hidden="true" />
        </div>
      </div>

      <div className="shrink-0 border-t border-slate-200 bg-white p-4 lg:px-6 lg:py-5">
        <div className="mx-auto w-full max-w-4xl rounded-2xl border border-slate-200 bg-white p-3 shadow-[0_12px_32px_-26px_rgba(15,23,42,0.35)] transition focus-within:border-blue-300 focus-within:ring-2 focus-within:ring-blue-500/10">
          <label htmlFor="sales-concierge-reply" className="sr-only">
            Reply as Sales
          </label>
          <textarea
            id="sales-concierge-reply"
            value={replyText}
            onChange={(event) => onReplyChange(event.target.value)}
            disabled={paused || isClosed || busy}
            onKeyDown={(event) => {
              if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                event.preventDefault();
                onSend();
              }
            }}
            rows={4}
            placeholder={'Type “/” to use a template message'}
            className="min-h-[108px] w-full resize-none border-0 bg-transparent px-2 py-1.5 text-sm leading-6 text-slate-800 outline-none placeholder:text-slate-400 focus:ring-0 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
          />

          <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-1">
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
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
                  aria-label={tool.label}
                >
                  <tool.icon size={16} />
                </button>
              ))}
            </div>

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={onCreateBooking}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[#C9A84C] bg-[#C9A84C] px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#B8973F] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C9A84C]/30"
              >
                <CalendarPlus2 size={14} />
                Create Booking
              </button>
              <button
                type="button"
                onClick={onSend}
                disabled={!replyText.trim() || paused || isClosed || busy}
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
              >
                Send
                <Send size={14} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
