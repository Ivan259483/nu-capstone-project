import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import BookingFromChatModal from './BookingFromChatModal';
import ConversationList from './ConversationList';
import ConversationPanel from './ConversationPanel';
import CustomerContextPanel from './CustomerContextPanel';
import { conciergeApi } from './conciergeApi';
import type {
  BookingFromChatDraft,
  ConciergeConversation,
} from './conciergeTypes';

type SalesConciergeInboxProps = {
  onBack: () => void;
};

const POLL_INTERVAL_MS = 5_000;
const ASK_VEHICLE_DETAILS_MESSAGE =
  'Hi! Could you provide your vehicle details (make, model, year) and plate number so we can prepare better for your service?';

function normalizeSearchValue(value: string): string {
  return value.trim().toLocaleLowerCase('en-PH');
}

function mergeConversation(
  current: ConciergeConversation | undefined,
  incoming: ConciergeConversation,
): ConciergeConversation {
  return {
    ...incoming,
    internalNotes: current?.internalNotes || incoming.internalNotes,
    messages: incoming.messages.length ? incoming.messages : current?.messages || [],
  };
}

export default function SalesConciergeInbox({ onBack }: SalesConciergeInboxProps) {
  const [conversations, setConversations] = useState<ConciergeConversation[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [openOnly, setOpenOnly] = useState(false);
  const [newestFirst, setNewestFirst] = useState(true);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [noteText, setNoteText] = useState('');
  const [pausedConversationIds, setPausedConversationIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [bookingConversationId, setBookingConversationId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [mutationBusy, setMutationBusy] = useState(false);
  const [apiError, setApiError] = useState('');
  const listRequestActive = useRef(false);
  const detailRequestActive = useRef(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(searchTerm), 300);
    return () => window.clearTimeout(timer);
  }, [searchTerm]);

  const loadConversations = useCallback(async (showLoading = false) => {
    if (listRequestActive.current) return;
    listRequestActive.current = true;
    if (showLoading) setLoading(true);

    try {
      const incoming = await conciergeApi.list(debouncedSearch);
      setApiError('');
      setConversations((current) =>
        incoming.map((conversation) =>
          mergeConversation(
            current.find((entry) => entry.id === conversation.id),
            conversation,
          ),
        ),
      );
      setActiveConversationId((currentId) => {
        if (currentId && incoming.some((entry) => entry.id === currentId)) return currentId;
        return incoming[0]?.id || null;
      });
    } catch (error) {
      console.warn('[SalesConciergeInbox] Unable to load conversations:', error);
      setApiError('Unable to load real Concierge conversations.');
    } finally {
      listRequestActive.current = false;
      setLoading(false);
    }
  }, [debouncedSearch]);

  const loadConversationDetail = useCallback(async (conversationId: string) => {
    if (detailRequestActive.current) return;
    detailRequestActive.current = true;
    setDetailLoading(true);
    try {
      const detail = await conciergeApi.detail(conversationId);
      setConversations((current) =>
        current.map((conversation) =>
          conversation.id === conversationId
            ? mergeConversation(conversation, { ...detail, unread: false })
            : conversation,
        ),
      );
      await conciergeApi.markRead(conversationId);
      setApiError('');
    } catch (error) {
      console.warn('[SalesConciergeInbox] Unable to load conversation detail:', error);
      setApiError('Unable to refresh the selected conversation.');
    } finally {
      detailRequestActive.current = false;
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadConversations(true);
    const intervalId = window.setInterval(() => {
      void loadConversations(false);
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(intervalId);
  }, [loadConversations]);

  useEffect(() => {
    if (!activeConversationId) return undefined;
    void loadConversationDetail(activeConversationId);
    const intervalId = window.setInterval(() => {
      void loadConversationDetail(activeConversationId);
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(intervalId);
  }, [activeConversationId, loadConversationDetail]);

  const visibleConversations = useMemo(() => {
    const query = normalizeSearchValue(searchTerm);
    const filtered = conversations.filter((conversation) => {
      const matchesOpen =
        !openOnly ||
        conversation.status === 'Needs Sales' ||
        conversation.status === 'In Conversation';
      if (!matchesOpen) return false;
      if (!query) return true;

      return [
        conversation.customerName,
        conversation.customerId,
        conversation.phone,
        conversation.vehicle,
        conversation.plate,
        conversation.serviceInterest,
        conversation.lastMessagePreview,
      ].some((field) => normalizeSearchValue(field).includes(query));
    });

    return newestFirst ? filtered : [...filtered].reverse();
  }, [conversations, newestFirst, openOnly, searchTerm]);

  const selectedConversation =
    visibleConversations.find((conversation) => conversation.id === activeConversationId) ??
    visibleConversations[0] ??
    null;
  const bookingConversation =
    conversations.find((conversation) => conversation.id === bookingConversationId) ?? null;
  const isSelectedConversationPaused = selectedConversation
    ? pausedConversationIds.has(selectedConversation.id)
    : false;

  const updateConversation = (
    conversationId: string,
    updater: (conversation: ConciergeConversation) => ConciergeConversation,
  ) => {
    setConversations((current) =>
      current.map((conversation) =>
        conversation.id === conversationId ? updater(conversation) : conversation,
      ),
    );
  };

  const handleSelectConversation = (conversationId: string) => {
    setActiveConversationId(conversationId);
    setReplyText('');
    setNoteText('');
  };

  const handleSend = async () => {
    const message = replyText.trim();
    if (!selectedConversation || !message || isSelectedConversationPaused || mutationBusy) return;

    setMutationBusy(true);
    try {
      const detail = await conciergeApi.send(selectedConversation.id, message);
      updateConversation(selectedConversation.id, (current) =>
        mergeConversation(current, detail),
      );
      setReplyText('');
      toast.success('Sales reply sent');
      await loadConversations(false);
    } catch (error) {
      console.warn('[SalesConciergeInbox] Unable to send reply:', error);
      toast.error('Unable to send the Sales reply.');
    } finally {
      setMutationBusy(false);
    }
  };

  const handleTogglePause = () => {
    if (!selectedConversation) return;
    const conversationId = selectedConversation.id;
    const willPause = !pausedConversationIds.has(conversationId);
    setPausedConversationIds((current) => {
      const next = new Set(current);
      if (next.has(conversationId)) next.delete(conversationId);
      else next.add(conversationId);
      return next;
    });
    toast.info(willPause ? 'Conversation paused locally' : 'Conversation resumed locally');
  };

  const handleMarkResolved = async () => {
    if (!selectedConversation || selectedConversation.status === 'Resolved' || mutationBusy) return;

    setMutationBusy(true);
    try {
      const detail = await conciergeApi.updateStatus(selectedConversation.id, 'Resolved');
      updateConversation(selectedConversation.id, (current) =>
        mergeConversation(current, detail),
      );
      toast.success(`${selectedConversation.customerName} marked as resolved`);
      await loadConversations(false);
    } catch (error) {
      console.warn('[SalesConciergeInbox] Unable to resolve conversation:', error);
      toast.error('Unable to update the conversation status.');
    } finally {
      setMutationBusy(false);
    }
  };

  const handleReopen = async () => {
    if (!selectedConversation || selectedConversation.status !== 'Resolved' || mutationBusy) return;
    setMutationBusy(true);
    try {
      const detail = await conciergeApi.updateStatus(
        selectedConversation.id,
        'In Conversation',
      );
      updateConversation(selectedConversation.id, (current) =>
        mergeConversation(current, detail),
      );
      toast.success(`${selectedConversation.customerName} conversation reopened`);
      await loadConversations(false);
    } catch (error) {
      console.warn('[SalesConciergeInbox] Unable to reopen conversation:', error);
      toast.error('Unable to reopen the conversation.');
    } finally {
      setMutationBusy(false);
    }
  };

  const handleAssign = async () => {
    if (!selectedConversation || mutationBusy) return;
    setMutationBusy(true);
    try {
      const detail = await conciergeApi.assign(selectedConversation.id);
      updateConversation(selectedConversation.id, (current) =>
        mergeConversation(current, detail),
      );
      toast.success('Conversation assigned to you');
    } catch (error) {
      console.warn('[SalesConciergeInbox] Unable to assign conversation:', error);
      toast.error('Unable to assign this conversation.');
    } finally {
      setMutationBusy(false);
    }
  };

  const handleAddNote = () => {
    const note = noteText.trim();
    if (!selectedConversation || !note) return;
    updateConversation(selectedConversation.id, (conversation) => ({
      ...conversation,
      internalNotes: [
        {
          id: `${conversation.id}-note-${Date.now()}`,
          author: 'Sales Team',
          time: 'Just now',
          text: note,
        },
        ...conversation.internalNotes,
      ],
    }));
    setNoteText('');
    toast.info('Internal note added locally');
  };

  const handleContinueToBooking = (_draft: BookingFromChatDraft) => {
    setBookingConversationId(null);
    toast.info('Booking conversion flow remains mock-only.');
  };

  const showFutureActionToast = (message: string) => {
    toast.info(message);
  };

  return (
    <div className="page-enter h-full min-h-0 overflow-y-auto bg-slate-100 xl:overflow-hidden">
      {apiError ? (
        <div className="border-b border-red-200 bg-red-50 px-5 py-2 text-center text-xs font-semibold text-red-700">
          {apiError}
        </div>
      ) : loading ? (
        <div className="border-b border-blue-100 bg-blue-50 px-5 py-2 text-center text-xs font-semibold text-blue-700">
          Loading Concierge conversations...
        </div>
      ) : detailLoading ? (
        <div className="border-b border-slate-200 bg-white px-5 py-2 text-center text-xs font-medium text-slate-500">
          Refreshing conversation...
        </div>
      ) : null}

      <div className="grid min-h-full bg-white lg:grid-cols-[minmax(280px,320px)_minmax(0,1fr)] xl:h-full xl:grid-cols-[300px_minmax(420px,1fr)_320px] 2xl:grid-cols-[330px_minmax(480px,1fr)_360px]">
        <ConversationList
          conversations={visibleConversations}
          selectedId={selectedConversation?.id ?? null}
          searchTerm={searchTerm}
          openOnly={openOnly}
          newestFirst={newestFirst}
          onBack={onBack}
          onSearchChange={(value) => {
            setSearchTerm(value);
            setReplyText('');
          }}
          onToggleOpen={() => {
            setOpenOnly((current) => !current);
            setReplyText('');
          }}
          onToggleNewest={() => setNewestFirst((current) => !current)}
          onSelect={handleSelectConversation}
          onMore={(customerName) =>
            showFutureActionToast(`More actions for ${customerName} remain mock-only.`)
          }
        />

        <ConversationPanel
          conversation={selectedConversation}
          replyText={replyText}
          paused={isSelectedConversationPaused}
          busy={mutationBusy}
          onReplyChange={setReplyText}
          onSend={() => void handleSend()}
          onTogglePause={handleTogglePause}
          onMarkResolved={() => void handleMarkResolved()}
          onReopen={() => void handleReopen()}
          onCreateBooking={() => {
            if (selectedConversation) setBookingConversationId(selectedConversation.id);
          }}
          onMore={() => void handleAssign()}
          onComposerTool={(tool) =>
            showFutureActionToast(`${tool} remains mock-only in this inbox update.`)
          }
        />

        <CustomerContextPanel
          conversation={selectedConversation}
          noteText={noteText}
          onNoteChange={setNoteText}
          onAddNote={handleAddNote}
          onEdit={() => showFutureActionToast('Customer editing remains mock-only.')}
          onAddAttribute={() => showFutureActionToast('Custom attributes remain mock-only.')}
          onMoreNote={() => showFutureActionToast('Note actions remain mock-only.')}
          onNoteTool={(tool) =>
            showFutureActionToast(`${tool} for notes remains mock-only.`)
          }
          onAskCustomer={() => setReplyText(ASK_VEHICLE_DETAILS_MESSAGE)}
        />
      </div>

      {bookingConversation ? (
        <BookingFromChatModal
          key={bookingConversation.id}
          conversation={bookingConversation}
          onClose={() => setBookingConversationId(null)}
          onContinue={handleContinueToBooking}
        />
      ) : null}
    </div>
  );
}
