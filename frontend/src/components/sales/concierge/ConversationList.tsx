import { ArrowLeft, Search, UserRound } from 'lucide-react';
import ConversationStatusBadge from './ConversationStatusBadge';
import type { ConciergeConversation } from './conciergeTypes';

export type ConversationFilter =
  | 'All'
  | 'Needs Sales'
  | 'Unassigned'
  | 'Mine'
  | 'Waiting'
  | 'Resolved';

type Props = {
  conversations: ConciergeConversation[];
  selectedId: string | null;
  searchTerm: string;
  filter: ConversationFilter;
  onBack: () => void;
  onSearchChange: (value: string) => void;
  onFilterChange: (filter: ConversationFilter) => void;
  onSelect: (conversationId: string) => void;
};

const FILTERS: ConversationFilter[] = [
  'All',
  'Needs Sales',
  'Unassigned',
  'Mine',
  'Waiting',
  'Resolved',
];

export default function ConversationList({
  conversations,
  selectedId,
  searchTerm,
  filter,
  onBack,
  onSearchChange,
  onFilterChange,
  onSelect,
}: Props) {
  return (
    <section
      className="flex min-h-[540px] min-w-0 flex-col overflow-hidden bg-white lg:min-h-[720px] xl:min-h-0"
      aria-label="Customer conversations"
    >
      <header className="shrink-0 border-b border-slate-200 px-5 py-5">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30"
            aria-label="Back to Sales Dashboard"
          >
            <ArrowLeft size={18} />
          </button>
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-blue-600">
              Sales
            </p>
            <h1 className="truncate text-lg font-bold tracking-tight text-slate-950">
              Concierge Inbox
            </h1>
          </div>
        </div>
        <label className="relative mt-4 block">
          <span className="sr-only">Search concierge conversations</span>
          <Search
            size={15}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            type="search"
            value={searchTerm}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Search name, phone, vehicle…"
            className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50/70 pl-9 pr-3 text-sm text-slate-800 outline-none transition focus:border-blue-300 focus:bg-white focus:ring-2 focus:ring-blue-500/10"
          />
        </label>
        <div
          className="scrollbar-thin mt-3 flex gap-1.5 overflow-x-auto pb-1"
          aria-label="Conversation filters"
        >
          {FILTERS.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => onFilterChange(item)}
              aria-pressed={filter === item}
              className={`shrink-0 rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold ${filter === item ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}
            >
              {item}
            </button>
          ))}
        </div>
      </header>

      {conversations.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center px-6 py-12 text-center">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-slate-400">
            <Search size={18} />
          </span>
          <p className="mt-4 text-sm font-bold text-slate-800">
            No matching conversations
          </p>
          <p className="mt-1 max-w-xs text-xs leading-5 text-slate-500">
            Try another search or lifecycle filter.
          </p>
        </div>
      ) : (
        <div className="scrollbar-thin flex-1 overflow-y-auto">
          {conversations.map((conversation) => {
            const selected = selectedId === conversation.id;
            const assignment = conversation.assignedSalesName || 'Unassigned';
            return (
              <button
                key={conversation.id}
                type="button"
                onClick={() => onSelect(conversation.id)}
                aria-pressed={selected}
                className={`relative block w-full border-b border-slate-100 px-5 py-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500/30 ${selected ? 'bg-blue-50/80 before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:bg-blue-600' : 'bg-white hover:bg-slate-50/80'}`}
              >
                <div className="flex min-w-0 items-start gap-3">
                  <span
                    className={`relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-black ring-1 ring-inset ${selected ? 'bg-blue-600 text-white ring-blue-500' : 'bg-slate-100 text-slate-600 ring-slate-200'}`}
                  >
                    {conversation.initials}
                    {conversation.unread ? (
                      <span
                        className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full bg-blue-600 ring-2 ring-white"
                        aria-label="Unread customer message"
                      />
                    ) : null}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-start justify-between gap-2">
                      <span
                        className={`truncate text-sm text-slate-900 ${conversation.unread ? 'font-black' : 'font-bold'}`}
                      >
                        {conversation.customerName}
                      </span>
                      <time
                        dateTime={conversation.lastMessageAt}
                        title={conversation.lastActivityLabel}
                        className="shrink-0 text-[10px] font-medium text-slate-400"
                      >
                        {conversation.time}
                      </time>
                    </span>
                    <span
                      className={`mt-1 block line-clamp-1 text-xs leading-5 ${conversation.unread ? 'font-semibold text-slate-700' : 'text-slate-500'}`}
                    >
                      {conversation.lastMessagePreview}
                    </span>
                    <span className="mt-2 flex min-w-0 items-center gap-2">
                      <ConversationStatusBadge
                        status={conversation.status}
                        compact
                      />
                      <span className="inline-flex min-w-0 items-center gap-1 truncate text-[10px] font-medium text-slate-400">
                        <UserRound size={10} />
                        {assignment}
                      </span>
                    </span>
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
