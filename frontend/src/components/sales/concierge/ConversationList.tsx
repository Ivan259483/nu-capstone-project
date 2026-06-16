import { ArrowLeft, MoreHorizontal, Search, SlidersHorizontal, X } from 'lucide-react';
import ConversationStatusBadge from './ConversationStatusBadge';
import type { ConciergeConversation } from './conciergeTypes';

type ConversationListProps = {
  conversations: ConciergeConversation[];
  selectedId: string | null;
  searchTerm: string;
  openOnly: boolean;
  newestFirst: boolean;
  onBack: () => void;
  onSearchChange: (value: string) => void;
  onToggleOpen: () => void;
  onToggleNewest: () => void;
  onSelect: (conversationId: string) => void;
  onMore: (customerName: string) => void;
};

export default function ConversationList({
  conversations,
  selectedId,
  searchTerm,
  openOnly,
  newestFirst,
  onBack,
  onSearchChange,
  onToggleOpen,
  onToggleNewest,
  onSelect,
  onMore,
}: ConversationListProps) {
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
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30"
            aria-label="Back to Sales Dashboard"
          >
            <ArrowLeft size={18} />
          </button>
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-blue-600">Sales</p>
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
            placeholder="Search conversations"
            className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50/70 pl-9 pr-3 text-sm text-slate-800 outline-none transition focus:border-blue-300 focus:bg-white focus:ring-2 focus:ring-blue-500/10"
          />
        </label>

        <div className="mt-3 flex items-center gap-2">
          <span
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 shadow-sm"
            aria-hidden="true"
          >
            <SlidersHorizontal size={15} />
          </span>
          <button
            type="button"
            onClick={onToggleOpen}
            aria-pressed={openOnly}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ${
              openOnly
                ? 'border-blue-500 bg-blue-50 text-blue-700'
                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
            }`}
          >
            Open
            {openOnly ? <X size={12} /> : null}
          </button>
          <button
            type="button"
            onClick={onToggleNewest}
            aria-pressed={newestFirst}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ${
              newestFirst
                ? 'border-blue-500 bg-blue-50 text-blue-700'
                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
            }`}
          >
            Newest
            {newestFirst ? <X size={12} /> : null}
          </button>
        </div>
      </header>

      {conversations.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center px-6 py-12 text-center">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-slate-400">
            <Search size={18} />
          </div>
          <p className="mt-4 text-sm font-bold text-slate-800">No matching conversations</p>
          <p className="mt-1 max-w-xs text-xs leading-5 text-slate-500">
            Change the search term or remove the Open filter.
          </p>
        </div>
      ) : (
        <div className="scrollbar-thin flex-1 overflow-y-auto">
          {conversations.map((conversation) => {
            const isSelected = selectedId === conversation.id;

            return (
              <div
                key={conversation.id}
                className={`relative border-b border-slate-100 transition-colors ${
                  isSelected
                    ? 'bg-blue-50/80 before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:bg-blue-600'
                    : 'bg-white hover:bg-slate-50/80'
                }`}
              >
                <button
                  type="button"
                  onClick={() => onSelect(conversation.id)}
                  aria-pressed={isSelected}
                  className="w-full px-5 py-3.5 pr-12 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500/30"
                >
                  <div className="flex min-w-0 items-start gap-3">
                    <div
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-black ring-1 ring-inset ${
                        isSelected ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'
                      } ${isSelected ? 'ring-blue-500' : 'ring-slate-200'}`}
                    >
                      {conversation.initials}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className="truncate text-sm font-bold text-slate-900">
                          {conversation.customerName}
                        </p>
                        <span className="shrink-0 text-[10px] font-medium text-slate-400">
                          {conversation.time}
                        </span>
                      </div>
                      <p className="mt-1 line-clamp-1 text-xs leading-5 text-slate-500">
                        {conversation.lastMessagePreview}
                      </p>

                      <div className="mt-2 flex items-center gap-2">
                        <ConversationStatusBadge
                          status={conversation.status}
                          compact
                          detail={
                            conversation.status === 'In Conversation'
                              ? conversation.conversationStarted
                              : undefined
                          }
                        />
                      </div>
                    </div>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => onMore(conversation.customerName)}
                  className="absolute right-3.5 top-10 inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-white hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30"
                  aria-label={`More options for ${conversation.customerName}`}
                >
                  <MoreHorizontal size={15} />
                </button>
                {conversation.unread ? (
                  <span
                    className="absolute right-4 top-[4.45rem] inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-orange-500 px-1 text-[9px] font-bold text-white ring-2 ring-white"
                    aria-label="1 unread message"
                  >
                    1
                  </span>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
