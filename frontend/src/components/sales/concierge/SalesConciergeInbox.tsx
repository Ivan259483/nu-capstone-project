import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { useRealtimeSync } from '@/hooks/useRealtimeSync';
import BookingFromChatModal from './BookingFromChatModal';
import ConciergeActionModal from './ConciergeActionModal';
import ConversationList, { type ConversationFilter } from './ConversationList';
import ConversationPanel from './ConversationPanel';
import CustomerContextPanel from './CustomerContextPanel';
import { conciergeApi } from './conciergeApi';
import type {
  ConciergeConversation,
  ConciergeMessageContext,
  ConversationStatus,
  ResolutionReason,
} from './conciergeTypes';

type Props = { onBack: () => void };
const BACKUP_POLL_MS = 30_000;
const REALTIME_COLLECTIONS = ['chatconversations', 'chatmessages'];

function normalize(value: string) {
  return value.trim().toLocaleLowerCase('en-PH');
}

function mergeConversation(
  current: ConciergeConversation | undefined,
  incoming: ConciergeConversation,
) {
  return {
    ...incoming,
    messages: incoming.messages.length
      ? incoming.messages
      : current?.messages || [],
    internalNotes: incoming.internalNotes.length
      ? incoming.internalNotes
      : current?.internalNotes || [],
  };
}

export default function SalesConciergeInbox({ onBack }: Props) {
  const { user } = useAuth();
  const currentUserId = String(user?.id || (user as any)?._id || '');
  const [conversations, setConversations] = useState<ConciergeConversation[]>(
    [],
  );
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [filter, setFilter] = useState<ConversationFilter>('All');
  const [activeConversationId, setActiveConversationId] = useState<
    string | null
  >(null);
  const [replyText, setReplyText] = useState('');
  const [noteText, setNoteText] = useState('');
  const [bookingConversationId, setBookingConversationId] = useState<
    string | null
  >(null);
  const [actionMode, setActionMode] = useState<'pricing' | 'schedule' | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [mutationBusy, setMutationBusy] = useState(false);
  const [apiError, setApiError] = useState('');
  const listRequestActive = useRef(false);
  const detailRequestActive = useRef(false);
  const realtimeTimer = useRef<number | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(searchTerm), 300);
    return () => window.clearTimeout(timer);
  }, [searchTerm]);

  const loadConversations = useCallback(
    async (showLoading = false) => {
      if (listRequestActive.current) return;
      listRequestActive.current = true;
      if (showLoading) setLoading(true);
      try {
        const incoming = await conciergeApi.list(debouncedSearch);
        setApiError('');
        setConversations((current) =>
          incoming.map((item) =>
            mergeConversation(
              current.find((entry) => entry.id === item.id),
              item,
            ),
          ),
        );
        setActiveConversationId((current) =>
          current && incoming.some((item) => item.id === current)
            ? current
            : incoming[0]?.id || null,
        );
      } catch (error) {
        console.warn(
          '[SalesConciergeInbox] Unable to load conversations:',
          error,
        );
        setApiError(
          'Unable to load Concierge conversations. Realtime updates will retry automatically.',
        );
      } finally {
        listRequestActive.current = false;
        setLoading(false);
      }
    },
    [debouncedSearch],
  );

  const loadConversationDetail = useCallback(async (conversationId: string) => {
    if (detailRequestActive.current) return;
    detailRequestActive.current = true;
    try {
      const detail = await conciergeApi.detail(conversationId);
      setConversations((current) =>
        current.map((item) =>
          item.id === conversationId
            ? mergeConversation(item, { ...detail, unread: false })
            : item,
        ),
      );
      if (detail.unread) await conciergeApi.markRead(conversationId);
      setApiError('');
    } catch (error) {
      console.warn(
        '[SalesConciergeInbox] Unable to refresh conversation:',
        error,
      );
      setApiError('Unable to refresh the selected conversation.');
    } finally {
      detailRequestActive.current = false;
    }
  }, []);

  useEffect(() => {
    void loadConversations(true);
    const interval = window.setInterval(
      () => void loadConversations(false),
      BACKUP_POLL_MS,
    );
    return () => window.clearInterval(interval);
  }, [loadConversations]);

  useEffect(() => {
    if (activeConversationId) void loadConversationDetail(activeConversationId);
  }, [activeConversationId, loadConversationDetail]);

  const handleRealtimeChange = useCallback(() => {
    if (realtimeTimer.current) window.clearTimeout(realtimeTimer.current);
    realtimeTimer.current = window.setTimeout(() => {
      void loadConversations(false);
      if (activeConversationId)
        void loadConversationDetail(activeConversationId);
    }, 180);
  }, [activeConversationId, loadConversationDetail, loadConversations]);
  useRealtimeSync(REALTIME_COLLECTIONS, handleRealtimeChange);

  useEffect(
    () => () => {
      if (realtimeTimer.current) window.clearTimeout(realtimeTimer.current);
    },
    [],
  );

  const visibleConversations = useMemo(() => {
    const query = normalize(searchTerm);
    return conversations.filter((conversation) => {
      const filterMatch =
        filter === 'All' ||
        (filter === 'Needs Sales' && conversation.status === 'Needs Sales') ||
        (filter === 'Unassigned' &&
          !conversation.assignedSalesId &&
          conversation.status !== 'Resolved') ||
        (filter === 'Mine' && conversation.assignedSalesId === currentUserId) ||
        (filter === 'Waiting' &&
          conversation.status === 'Waiting for Customer') ||
        (filter === 'Resolved' && conversation.status === 'Resolved');
      if (!filterMatch) return false;
      if (!query) return true;
      return [
        conversation.customerName,
        conversation.customerId,
        conversation.phone,
        conversation.email,
        conversation.vehicle,
        conversation.plate,
        conversation.serviceInterest,
        conversation.lastMessagePreview,
      ].some((field) => normalize(field).includes(query));
    });
  }, [conversations, currentUserId, filter, searchTerm]);

  const selectedConversation =
    visibleConversations.find((item) => item.id === activeConversationId) ||
    visibleConversations[0] ||
    null;
  const bookingConversation =
    conversations.find((item) => item.id === bookingConversationId) || null;

  useEffect(() => {
    if (
      selectedConversation &&
      selectedConversation.id !== activeConversationId
    ) {
      setActiveConversationId(selectedConversation.id);
    }
  }, [activeConversationId, selectedConversation]);

  const replaceConversation = (incoming: ConciergeConversation) =>
    setConversations((current) =>
      current.map((item) =>
        item.id === incoming.id ? mergeConversation(item, incoming) : item,
      ),
    );

  const handleSelect = (id: string) => {
    setActiveConversationId(id);
    setReplyText('');
    setNoteText('');
    setActionMode(null);
  };

  const sendMessage = async (
    message: string,
    context?: ConciergeMessageContext,
  ) => {
    if (!selectedConversation || !message.trim() || mutationBusy) return;
    setMutationBusy(true);
    try {
      const detail = await conciergeApi.send(
        selectedConversation.id,
        message.trim(),
        context,
      );
      replaceConversation(detail);
      setReplyText('');
      setActionMode(null);
      toast.success('Message sent to customer');
      await loadConversations(false);
    } catch (error: any) {
      toast.error(
        error?.response?.data?.message || 'Unable to send the Sales reply.',
      );
    } finally {
      setMutationBusy(false);
    }
  };

  const updateStatus = async (
    status: ConversationStatus,
    reason?: ResolutionReason,
  ) => {
    if (!selectedConversation || mutationBusy) return;
    setMutationBusy(true);
    try {
      const detail = await conciergeApi.updateStatus(
        selectedConversation.id,
        status,
        reason,
      );
      replaceConversation(detail);
      toast.success(
        status === 'Resolved' ? 'Conversation resolved' : `Moved to ${status}`,
      );
      await loadConversationDetail(selectedConversation.id);
    } catch (error: any) {
      toast.error(
        error?.response?.data?.message ||
          'Unable to update the conversation status.',
      );
    } finally {
      setMutationBusy(false);
    }
  };

  const takeConversation = async () => {
    if (!selectedConversation || mutationBusy) return;
    setMutationBusy(true);
    try {
      const detail = await conciergeApi.assign(selectedConversation.id);
      replaceConversation(detail);
      toast.success('Conversation assigned to you');
    } catch (error: any) {
      toast.error(
        error?.response?.data?.message || 'Unable to take this conversation.',
      );
      await loadConversations(false);
    } finally {
      setMutationBusy(false);
    }
  };

  const deleteConversation = async (): Promise<boolean> => {
    if (!selectedConversation || mutationBusy) return false;
    const conversationId = selectedConversation.id;
    const currentIndex = conversations.findIndex(
      (item) => item.id === conversationId,
    );
    setMutationBusy(true);
    try {
      await conciergeApi.remove(conversationId);
      const remaining = conversations.filter(
        (item) => item.id !== conversationId,
      );
      const nextConversation =
        remaining[Math.min(Math.max(currentIndex, 0), remaining.length - 1)] ||
        null;
      setConversations(remaining);
      setActiveConversationId(nextConversation?.id || null);
      setReplyText('');
      setNoteText('');
      setActionMode(null);
      setBookingConversationId((current) =>
        current === conversationId ? null : current,
      );
      toast.success('Conversation deleted');
      return true;
    } catch (error: any) {
      toast.error(
        error?.response?.data?.message || 'Unable to delete the conversation.',
      );
      return false;
    } finally {
      setMutationBusy(false);
    }
  };

  const addNote = async () => {
    if (!selectedConversation || !noteText.trim() || mutationBusy) return;
    setMutationBusy(true);
    try {
      const detail = await conciergeApi.addNote(
        selectedConversation.id,
        noteText.trim(),
      );
      replaceConversation(detail);
      setNoteText('');
      toast.success('Internal note saved');
    } catch (error: any) {
      toast.error(
        error?.response?.data?.message || 'Unable to save the internal note.',
      );
    } finally {
      setMutationBusy(false);
    }
  };

  const askCustomer = (field: 'vehicle' | 'plate') => {
    if (!selectedConversation) return;
    const bothMissing =
      selectedConversation.vehicle === 'Not provided' &&
      !selectedConversation.plate;
    const message = bothMissing
      ? 'Could you provide your vehicle make, model, year, and plate number so I can check the correct service options for you?'
      : field === 'vehicle'
        ? 'Could you provide your vehicle make, model, and year so I can check the correct service options for you?'
        : 'Could you provide your vehicle plate number so I can complete the service and booking details?';
    setReplyText(message);
  };

  const handleBookingCreated = async (
    bookingId: string,
    _reference: string,
  ) => {
    if (!bookingConversation) return;
    const detail = await conciergeApi.linkBooking(
      bookingConversation.id,
      bookingId,
    );
    replaceConversation(detail);
    await loadConversations(false);
  };

  return (
    <div className="page-enter h-full min-h-0 overflow-y-auto bg-slate-100 xl:overflow-hidden">
      {apiError ? (
        <div
          role="alert"
          className="border-b border-red-200 bg-red-50 px-5 py-2 text-center text-xs font-semibold text-red-700"
        >
          {apiError}
        </div>
      ) : loading ? (
        <div className="border-b border-blue-100 bg-blue-50 px-5 py-2 text-center text-xs font-semibold text-blue-700">
          Loading Concierge conversations…
        </div>
      ) : null}
      <div className="grid min-h-full bg-white lg:grid-cols-[minmax(280px,320px)_minmax(0,1fr)] xl:h-full xl:grid-cols-[300px_minmax(420px,1fr)_320px] 2xl:grid-cols-[330px_minmax(480px,1fr)_360px]">
        <ConversationList
          conversations={visibleConversations}
          selectedId={selectedConversation?.id || null}
          searchTerm={searchTerm}
          filter={filter}
          onBack={onBack}
          onSearchChange={(value) => {
            setSearchTerm(value);
            setReplyText('');
          }}
          onFilterChange={setFilter}
          onSelect={handleSelect}
        />
        <ConversationPanel
          conversation={selectedConversation}
          currentUserId={currentUserId}
          replyText={replyText}
          busy={mutationBusy}
          onReplyChange={setReplyText}
          onSend={() => void sendMessage(replyText)}
          onResolve={(reason) => void updateStatus('Resolved', reason)}
          onDelete={deleteConversation}
          onReopen={() => void updateStatus('In Conversation')}
          onCreateBooking={() =>
            selectedConversation &&
            setBookingConversationId(selectedConversation.id)
          }
          onTakeConversation={() => void takeConversation()}
          onSetWaiting={() => void updateStatus('Waiting for Customer')}
          onSendPricing={() => setActionMode('pricing')}
          onOfferSchedule={() => setActionMode('schedule')}
          onComposerTool={(tool) =>
            toast.info(
              `${tool} is not enabled by the current messaging backend.`,
            )
          }
        />
        <CustomerContextPanel
          conversation={selectedConversation}
          noteText={noteText}
          busy={mutationBusy}
          onNoteChange={setNoteText}
          onAddNote={() => void addNote()}
          onAskCustomer={askCustomer}
        />
      </div>

      {bookingConversation ? (
        <BookingFromChatModal
          key={bookingConversation.id}
          conversation={bookingConversation}
          onClose={() => setBookingConversationId(null)}
          onCreated={handleBookingCreated}
        />
      ) : null}
      {actionMode && selectedConversation ? (
        <ConciergeActionModal
          mode={actionMode}
          conversation={selectedConversation}
          busy={mutationBusy}
          onClose={() => setActionMode(null)}
          onSend={sendMessage}
        />
      ) : null}
    </div>
  );
}
