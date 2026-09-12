/**
 * ChatScreen — Full-Screen Premium AI Chatbot
 *
 * Connected to the backend /api/chatbot endpoints (OpenAI GPT).
 * Loads session history, sends real messages, shows typing indicator,
 * and handles lead capture + handoff flows.
 *
 * Premium dark automotive aesthetic with glassmorphism.
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Keyboard,
  Platform,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import Animated, { FadeIn, FadeInDown, useSharedValue, withRepeat, withTiming, withDelay, useAnimatedStyle } from 'react-native-reanimated';
import {
  KeyboardChatScrollView,
  KeyboardEvents,
  KeyboardStickyView,
} from 'react-native-keyboard-controller';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/context/AuthContext';
import { PremiumLoader } from '@/components/ui/loading';
import {
  chatbotService,
  type ChatMessageRecord,
  type SalesHandoffStatus,
} from '@/services/api/chatbotService';
import { Haptics } from '@/utils/haptics';
import {
  createLocalChatMessageId,
  resolveChatSendState,
  resolveChatSubmission,
  shouldShowSuggestedChatPrompts,
  SUGGESTED_CHAT_PROMPTS,
} from '@/utils/chat-screen-state';

interface ChatScreenProps {
  onClose: () => void;
}

const ACCENT = '#FF6B35';
const SALES_POLL_INTERVAL_MS = 5_000;
const NEAR_BOTTOM_THRESHOLD = 112;
const COMPOSER_KEYBOARD_GAP = 10;

function formatTime(isoString?: string) {
  if (!isoString) return '';
  const date = new Date(isoString);
  let hrs = date.getHours();
  const mins = date.getMinutes();
  const ampm = hrs >= 12 ? 'PM' : 'AM';
  hrs = hrs % 12;
  if (hrs === 0) hrs = 12;
  const minsStr = mins < 10 ? `0${mins}` : mins;
  return `${hrs}:${minsStr} ${ampm}`;
}

function TypingDots() {
  const op1 = useSharedValue(0.4);
  const op2 = useSharedValue(0.4);
  const op3 = useSharedValue(0.4);

  useEffect(() => {
    op1.value = withRepeat(withTiming(1, { duration: 500 }), -1, true);
    op2.value = withDelay(200, withRepeat(withTiming(1, { duration: 500 }), -1, true));
    op3.value = withDelay(400, withRepeat(withTiming(1, { duration: 500 }), -1, true));
  }, [op1, op2, op3]);

  const style1 = useAnimatedStyle(() => ({ opacity: op1.value }));
  const style2 = useAnimatedStyle(() => ({ opacity: op2.value }));
  const style3 = useAnimatedStyle(() => ({ opacity: op3.value }));

  return (
    <View style={s.typingDots}>
       <Animated.View style={[s.dot, style1]} />
       <Animated.View style={[s.dot, style2]} />
       <Animated.View style={[s.dot, style3]} />
    </View>
  );
}

export default function ChatScreen({ onClose }: ChatScreenProps) {
  const insets = useSafeAreaInsets();
  const { profile, token } = useAuth();
  const [messages, setMessages] = useState<ChatMessageRecord[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [showTyping, setShowTyping] = useState(false);
  const [composerHeight, setComposerHeight] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [handoffStatus, setHandoffStatus] = useState<SalesHandoffStatus>('ai_handling');
  const [showConnectToSales, setShowConnectToSales] = useState(false);
  const [showContactCapture, setShowContactCapture] = useState(false);
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [handoffBusy, setHandoffBusy] = useState(false);
  const scrollRef = useRef<React.ComponentRef<typeof KeyboardChatScrollView>>(null);
  const inputRef = useRef<TextInput>(null);
  const hasInitialized = useRef(false);
  const isNearBottomRef = useRef(true);

  // Load session + history
  const initSession = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const session = await chatbotService.startSession('mobile');
      setHandoffStatus(session.status);
      setShowConnectToSales(
        session.messages.some(
          (message) => Boolean(message.metadata?.salesHandoffOffer?.eligible),
        ),
      );
      if (profile) {
        setContactName(profile.full_name || '');
        setContactPhone(profile.phone || '');
      }
      if (session.messages.length > 0) {
        setMessages(session.messages);
      } else {
        // Welcome message if no history
        setMessages([
          {
            id: 'welcome',
            sender: 'assistant',
            message:
              'Welcome to AutoSPF+ 👋\n\nI can help with account setup, bookings, ceramic coating, SPF & PPF packages, detailing, and pricing.\n\nHow can I assist you today?',
          },
        ]);
      }
    } catch (err) {
      console.warn('Chat init failed:', err);
      setError('Unable to connect to AI assistant. Please check your connection.');
      setMessages([
        {
          id: 'offline',
          sender: 'assistant',
          message:
            "Hi! 👋 I'm having trouble connecting right now. Please try again in a moment.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  }, [profile]);

  const refreshSalesConversation = useCallback(async () => {
    try {
      const conversation = await chatbotService.getSalesConversation();
      setMessages(conversation.messages);
      setHandoffStatus(conversation.status);
      if (conversation.unreadForCustomer) {
        await chatbotService.markCustomerRead();
      }
      setError(null);
    } catch (err) {
      console.warn('Sales chat refresh failed:', err);
    }
  }, []);

  useEffect(() => {
    if (!hasInitialized.current) {
      hasInitialized.current = true;
      void initSession();
    }
  }, [initSession]);

  useEffect(() => {
    if (handoffStatus === 'ai_handling') return undefined;
    void refreshSalesConversation();
    const intervalId = setInterval(() => {
      void refreshSalesConversation();
    }, SALES_POLL_INTERVAL_MS);
    return () => clearInterval(intervalId);
  }, [handoffStatus, refreshSalesConversation]);

  // Keep new messages visible only while the customer is already following
  // the latest part of the conversation. Never steal an intentional scroll-up.
  useEffect(() => {
    if (!isNearBottomRef.current) return undefined;
    const timeoutId = setTimeout(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    }, 80);
    return () => clearTimeout(timeoutId);
  }, [messages.length]);

  useEffect(() => {
    const showSubscription = KeyboardEvents.addListener('keyboardDidShow', () => {
      isNearBottomRef.current = true;
      requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: false }));
    });

    return () => showSubscription.remove();
  }, []);

  const handleMessageScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
      const distanceFromBottom =
        contentSize.height - layoutMeasurement.height - contentOffset.y;
      isNearBottomRef.current = distanceFromBottom < NEAR_BOTTOM_THRESHOLD;
    },
    [],
  );

  const handleMessageContentSizeChange = useCallback(() => {
    if (isNearBottomRef.current) {
      scrollRef.current?.scrollToEnd({ animated: false });
    }
  }, []);

  const upsertAssistantMessage = useCallback((id: string, message: string, actionChips?: string[]) => {
    setMessages((prev) => {
      const exists = prev.some((m) => m.id === id);
      if (exists) {
        return prev.map((m) => (
          m.id === id
            ? { ...m, message, actionChips: actionChips ?? m.actionChips }
            : m
        ));
      }
      return [
        ...prev,
        {
          id,
          sender: 'assistant',
          message,
          createdAt: new Date().toISOString(),
          actionChips,
        },
      ];
    });
  }, []);

  const handleSend = async (explicitMessage?: string) => {
    const trimmed = resolveChatSubmission(input, explicitMessage);
    if (!trimmed || sending || loading || handoffBusy) return;
    if (handoffStatus === 'resolved' || handoffStatus === 'converted') return;

    Haptics.primaryPress();
    setInput('');
    setError(null);

    // Add user message immediately
    const userMsg: ChatMessageRecord = {
      id: createLocalChatMessageId('user'),
      sender: 'user',
      message: trimmed,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);

    setSending(true);
    setShowTyping(true);
    try {
      if (handoffStatus === 'needs_sales' || handoffStatus === 'in_conversation') {
        const conversation = await chatbotService.sendCustomerMessage(trimmed);
        setMessages(conversation.messages);
        setHandoffStatus(conversation.status);
        return;
      }

      const getContextString = await AsyncStorage.getItem('@autospf_latest_scan_context');
      let localAppContext: any = undefined;
      if (getContextString) {
        try {
          localAppContext = JSON.parse(getContextString);
        } catch {}
      }

      const botId = createLocalChatMessageId('bot');
      let response: Awaited<ReturnType<typeof chatbotService.sendMessage>> | null = null;
      let streamStarted = false;
      let streamedReply = '';
      let pendingReply = '';
      let flushTimer: ReturnType<typeof setTimeout> | null = null;

      const flushStream = () => {
        if (!pendingReply) return;
        streamedReply += pendingReply;
        pendingReply = '';
        upsertAssistantMessage(botId, streamedReply);
      };

      try {
        response = await chatbotService.sendMessageStream(trimmed, localAppContext, {
          onStart: () => {
            streamStarted = true;
          },
          onDelta: (text) => {
            if (!text) return;
            setShowTyping(false);
            pendingReply += text;
            if (!flushTimer) {
              flushTimer = setTimeout(() => {
                flushTimer = null;
                flushStream();
              }, 40);
            }
          },
        });
        if (flushTimer) {
          clearTimeout(flushTimer);
          flushTimer = null;
        }
        flushStream();
        upsertAssistantMessage(botId, response.reply, response.actionChips);
      } catch (streamErr) {
        if (flushTimer) {
          clearTimeout(flushTimer);
          flushTimer = null;
        }
        if (streamStarted) {
          throw streamErr;
        }

        response = await chatbotService.sendMessage(trimmed, localAppContext);
        const botMsg: ChatMessageRecord = {
          id: botId,
          sender: 'assistant',
          message: response.reply,
          createdAt: new Date().toISOString(),
          actionChips: response.actionChips,
        };
        setMessages((prev) => [...prev, botMsg]);
      }

      // Handle action intents
      if (!response) {
        throw new Error('Missing chat response.');
      }

      if (response.handoffOffer?.eligible) {
        setShowConnectToSales(true);
      }

      if (response.leadRequired) {
        const leadMsg: ChatMessageRecord = {
          id: createLocalChatMessageId('system'),
          sender: 'system',
          message: 'Please share your name and phone number to continue.',
        };
        setMessages((prev) => [...prev, leadMsg]);
      }
    } catch (err) {
      console.warn('Chat send failed:', err);
      const errMsg: ChatMessageRecord = {
        id: createLocalChatMessageId('err'),
        sender: 'assistant',
        message: 'Sorry, I had trouble sending that. Please try again.',
      };
      setMessages((prev) => [...prev, errMsg]);
    } finally {
      setSending(false);
      setShowTyping(false);
    }
  };

  const completeSalesHandoff = async (contact?: { name: string; phone: string }) => {
    if (handoffBusy || handoffStatus !== 'ai_handling') return;
    setHandoffBusy(true);
    setError(null);
    try {
      const lastMessage = [...messages].reverse().find((message) => message.sender === 'user')?.message;
      const conversation = await chatbotService.requestHandoff(lastMessage, contact);
      setMessages(conversation.messages);
      setHandoffStatus(conversation.status);
      setShowConnectToSales(false);
      setShowContactCapture(false);
      await chatbotService.markCustomerRead();

    } catch (err: any) {
      Haptics.formSubmitError();
      if (err?.response?.data?.code === 'SALES_CONTACT_REQUIRED') {
        setShowContactCapture(true);
        setError('Please enter your name and a valid Philippine mobile number.');
      } else {
        setError('Unable to connect to AutoSPF+ Sales right now.');
      }
    } finally {
      setHandoffBusy(false);
    }
  };

  const handleConnectToSales = () => {
    const isLoggedIn = Boolean(token || profile?.id);
    if (!isLoggedIn && (!contactName.trim() || !contactPhone.trim())) {
      Haptics.formSubmitError();
      setShowContactCapture(true);
      return;
    }
    Haptics.primaryPress();
    void completeSalesHandoff(
      isLoggedIn
        ? undefined
        : { name: contactName.trim(), phone: contactPhone.trim() },
    );
  };

  const handleContactSubmit = () => {
    if (!contactName.trim() || !contactPhone.trim()) {
      setError('Please enter your name and mobile number.');
      return;
    }
    void completeSalesHandoff({
      name: contactName.trim(),
      phone: contactPhone.trim(),
    });
  };

  const handleStartNewChat = async () => {
    setLoading(true);
    setError(null);
    try {
      const session = await chatbotService.startNewConversation('mobile');
      setMessages(session.messages);
      setHandoffStatus('ai_handling');
      setShowConnectToSales(false);
      setShowContactCapture(false);
      setInput('');
    } catch (err) {
      console.warn('Unable to start a new chat:', err);
      setError('Unable to start a new chat right now.');
    } finally {
      setLoading(false);
    }
  };

  const handleRetry = () => {
    Haptics.primaryPress();
    void initSession();
  };

  const handleClose = () => {
    Keyboard.dismiss();
    onClose();
  };

  const handleComposerLayout = useCallback((event: LayoutChangeEvent) => {
    const nextHeight = Math.ceil(event.nativeEvent.layout.height);
    setComposerHeight((currentHeight) => (
      currentHeight === nextHeight ? currentHeight : nextHeight
    ));
  }, []);

  const isSalesConversation =
    handoffStatus === 'needs_sales' || handoffStatus === 'in_conversation';
  const isClosedConversation =
    handoffStatus === 'resolved' || handoffStatus === 'converted';
  const sendBlocked = sending || isClosedConversation || handoffBusy || loading;
  const sendState = resolveChatSendState(input, sendBlocked);
  const showSuggestedPrompts = shouldShowSuggestedChatPrompts({
    messages,
    handoffStatus,
    hasError: Boolean(error),
  });
  const composerBottomPadding = Math.max(insets.bottom, COMPOSER_KEYBOARD_GAP);
  const keyboardOpenedInsetOffset = Math.max(
    composerBottomPadding - COMPOSER_KEYBOARD_GAP,
    0,
  );
  const chatKeyboardOffset = Math.max(composerHeight - keyboardOpenedInsetOffset, 0);

  return (
    <View style={s.screen}>
      {/* The safe header is outside the keyboard-resizing region so it stays
          fixed on iOS and Android when the native keyboard opens. */}
      <LinearGradient
        colors={['#0E0E14', '#09090D']}
        style={[s.header, { paddingTop: insets.top + 4 }]}
      >
        <TouchableOpacity
          onPress={handleClose}
          style={s.backBtn}
          hitSlop={4}
          accessibilityRole="button"
          accessibilityLabel="Close AI assistant"
        >
          <Ionicons name="arrow-back" size={19} color="#F8F8FA" />
        </TouchableOpacity>

        <View style={s.headerCenter}>
          <View style={s.headerAvatarRing}>
            <LinearGradient
              colors={[ACCENT, '#D44200']}
              style={s.headerAvatar}
            >
              <Ionicons name="sparkles" size={13} color="#fff" />
            </LinearGradient>
            <View style={s.onlineDot} />
          </View>
          <View style={s.headerText}>
            <Text style={s.headerTitle} numberOfLines={1}>
              {handoffStatus === 'ai_handling' ? 'AutoSPF+ AI' : 'AutoSPF+ Sales'}
            </Text>
            <Text style={s.headerSub} numberOfLines={1}>
              {handoffStatus === 'needs_sales'
                ? 'Waiting for Sales'
                : isClosedConversation
                  ? 'Conversation resolved'
                  : isSalesConversation
                    ? 'Sales conversation'
                    : 'AI Assistant'}
            </Text>
          </View>
        </View>

        <TouchableOpacity
          onPress={handleRetry}
          disabled={loading}
          style={s.headerAction}
          hitSlop={4}
          accessibilityRole="button"
          accessibilityLabel="Reload conversation"
          accessibilityHint="Reloads the current conversation from AutoSPF+"
          accessibilityState={{ disabled: loading }}
        >
          <Ionicons
            name="refresh-outline"
            size={18}
            color={loading ? '#4D4D57' : '#92929D'}
          />
        </TouchableOpacity>
      </LinearGradient>

      <View style={s.keyboardRegion}>
        {/* ── Messages ── */}
        <View style={s.messagesContainer}>
          {loading ? (
            <View style={s.loadingCenter}>
              <TypingDots />
              <Text style={s.loadingText}>Connecting to AI assistant…</Text>
            </View>
          ) : (
            <KeyboardChatScrollView
              ref={scrollRef}
              style={s.messageScroll}
              contentContainerStyle={s.messageScrollContent}
              offset={chatKeyboardOffset}
              keyboardLiftBehavior="always"
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
              scrollEventThrottle={16}
              onScroll={handleMessageScroll}
              onContentSizeChange={handleMessageContentSizeChange}
            >
              {/* Date separator */}
              <View style={s.dateSep}>
                <Text style={s.dateSepText}>Today</Text>
              </View>

              {messages.map((m, i) => (
                <Animated.View
                  key={m.id}
                  entering={FadeInDown.delay(i < 3 ? i * 80 : 0).duration(200)}
                  style={[
                    s.bubbleWrap,
                    m.sender === 'user'
                      ? s.bubbleWrapUser
                      : m.sender === 'system'
                        ? s.bubbleWrapSystem
                        : s.bubbleWrapBot,
                  ]}
                >
                  {(m.sender === 'assistant' || m.sender === 'sales') && (
                    <View style={s.botAvatarSmall}>
                      <Ionicons
                        name={m.sender === 'sales' ? 'headset' : 'sparkles'}
                        size={10}
                        color={m.sender === 'sales' ? '#60A5FA' : ACCENT}
                      />
                    </View>
                  )}
                  <View style={[
                    s.bubbleContentWrapper,
                    m.sender === 'user'
                      ? { alignItems: 'flex-end' }
                      : m.sender === 'system'
                        ? { alignItems: 'center', maxWidth: '100%' }
                        : { alignItems: 'flex-start' }
                  ]}>
                    {m.sender === 'sales' && (
                      <Text style={s.salesLabel}>AutoSPF+ Sales</Text>
                    )}
                    <View
                      style={[
                        s.bubble,
                        m.sender === 'user' ? s.userBubble : s.botBubble,
                        m.sender === 'sales' && s.salesBubble,
                        m.sender === 'system' && s.systemBubble,
                      ]}
                    >
                      <Text
                        style={[
                          s.bubbleText,
                          m.sender === 'user' && s.userBubbleText,
                          m.sender === 'sales' && s.salesBubbleText,
                          m.sender === 'system' && s.systemBubbleText,
                        ]}
                      >
                        {m.message}
                      </Text>
                      {m.createdAt && m.sender !== 'system' && (
                        <Text style={[s.bubbleTime, m.sender === 'user' && s.userBubbleTime]}>
                          {formatTime(m.createdAt)}
                        </Text>
                      )}
                    </View>

                    {m.actionChips && m.actionChips.length > 0 && (
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={s.actionChipsContainer}
                      >
                        {m.actionChips.map(chip => (
                          <TouchableOpacity
                            key={chip}
                            style={s.actionChip}
                            onPress={() => {
                              setInput(chip);
                            }}
                          >
                            <Text style={s.actionChipText}>{chip}</Text>
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                    )}
                  </View>
                </Animated.View>
              ))}

              {showSuggestedPrompts && (
                <View style={s.suggestedPromptsContainer}>
                  {SUGGESTED_CHAT_PROMPTS.map((prompt) => (
                    <TouchableOpacity
                      key={prompt}
                      style={s.suggestedPromptChip}
                      onPress={() => void handleSend(prompt)}
                      activeOpacity={0.78}
                      accessibilityRole="button"
                      accessibilityLabel={`Send suggested message: ${prompt}`}
                    >
                      <Text style={s.suggestedPromptText}>{prompt}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {/* Typing indicator */}
              {showTyping && (
                <Animated.View entering={FadeIn} style={[s.bubbleWrap, s.bubbleWrapBot]}>
                  <View style={s.botAvatarSmall}>
                    <Ionicons name="sparkles" size={10} color={ACCENT} />
                  </View>
                  <View style={[s.bubble, s.botBubble, s.typingBubble]}>
                    <TypingDots />
                  </View>
                </Animated.View>
              )}

              {/* Error banner */}
              {error && (
                <TouchableOpacity onPress={handleRetry} style={s.errorBanner}>
                  <Ionicons name="alert-circle" size={14} color="#EF4444" />
                  <Text style={s.errorText}>{error}</Text>
                  <Text style={s.errorRetry}>Retry</Text>
                </TouchableOpacity>
              )}
            </KeyboardChatScrollView>
          )}
        </View>

        {/* ── Input ── */}
        <KeyboardStickyView
          onLayout={handleComposerLayout}
          offset={{ opened: keyboardOpenedInsetOffset }}
          style={[
            s.inputArea,
            {
              paddingBottom: composerBottomPadding,
            },
          ]}
        >
          {handoffStatus === 'needs_sales' && (
            <View style={s.waitingBanner}>
              <Text style={s.waitingBannerTitle}>Waiting for AutoSPF+ Sales</Text>
              <Text style={s.waitingBannerText}>
                You’re now connected to AutoSPF+ Sales. Please wait for a reply.
              </Text>
            </View>
          )}

          {handoffStatus === 'in_conversation' && (
            <View style={s.salesBanner}>
              <Text style={s.salesBannerTitle}>AutoSPF+ Sales joined</Text>
              <Text style={s.salesBannerText}>Continue the conversation with Sales here.</Text>
            </View>
          )}

          {isClosedConversation && (
            <View style={s.resolvedBanner}>
              <Text style={s.resolvedBannerText}>
                This conversation has been resolved. Start a new chat if you need more help.
              </Text>
              <TouchableOpacity onPress={handleStartNewChat} style={s.newChatButton}>
                <Text style={s.newChatButtonText}>Start New Chat</Text>
              </TouchableOpacity>
            </View>
          )}

          {showContactCapture && handoffStatus === 'ai_handling' && (
            <View style={s.contactCard}>
              <Text style={s.contactCardTitle}>Connect with AutoSPF+ Sales</Text>
              <Text style={s.contactCardText}>
                Share your name and mobile number before the handoff.
              </Text>
              <TextInput
                value={contactName}
                onChangeText={setContactName}
                placeholder="Your name"
                placeholderTextColor="#666674"
                style={s.contactInput}
                keyboardAppearance="dark"
                selectionColor={ACCENT}
              />
              <TextInput
                value={contactPhone}
                onChangeText={setContactPhone}
                placeholder="Mobile number"
                placeholderTextColor="#666674"
                keyboardType="phone-pad"
                style={s.contactInput}
                keyboardAppearance="dark"
                selectionColor={ACCENT}
              />
              <TouchableOpacity
                onPress={handleContactSubmit}
                disabled={handoffBusy}
                style={[s.contactSubmitButton, handoffBusy && s.sendBtnDisabled]}
              >
                {handoffBusy ? (
                  <PremiumLoader size="small" tone="light" accessibilityLabel="Connecting to Sales" />
                ) : (
                  <Text style={s.contactSubmitText}>Continue to Sales</Text>
                )}
              </TouchableOpacity>
            </View>
          )}

          {showConnectToSales &&
            !showContactCapture &&
            handoffStatus === 'ai_handling' && (
              <TouchableOpacity
                onPress={handleConnectToSales}
                disabled={handoffBusy}
                style={[s.connectSalesButton, handoffBusy && s.sendBtnDisabled]}
              >
                <Ionicons name="headset-outline" size={16} color="#93C5FD" />
                <Text style={s.connectSalesButtonText}>
                  {handoffBusy ? 'Connecting...' : 'Connect to Sales'}
                </Text>
              </TouchableOpacity>
            )}

          <Animated.Text style={s.disclaimer}>
            {isSalesConversation
              ? 'Messages are shared with AutoSPF+ Sales'
              : 'Powered by AutoSPF+ AI · Responses may not be 100% accurate'}
          </Animated.Text>

          <View style={s.inputRow}>
            <TextInput
              ref={inputRef}
              value={input}
              onChangeText={setInput}
              onSubmitEditing={() => void handleSend()}
              returnKeyType="send"
              placeholder={
                isClosedConversation
                  ? 'This conversation is resolved'
                  : isSalesConversation
                    ? 'Message AutoSPF+ Sales...'
                    : 'Ask about services, pricing, bookings…'
              }
              placeholderTextColor="#70707D"
              style={s.input}
              editable={!loading && !isClosedConversation && !handoffBusy}
              multiline
              maxLength={500}
              keyboardAppearance="dark"
              selectionColor={ACCENT}
              accessibilityLabel="Message AutoSPF+ assistant"
            />
            <TouchableOpacity
              onPress={() => void handleSend()}
              disabled={sendState.disabled}
              style={[
                s.sendBtn,
                !sendState.visuallyActive && s.sendBtnDisabled,
              ]}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="Send message"
              accessibilityState={{ disabled: sendState.disabled }}
            >
              <Ionicons
                name="arrow-up"
                size={19}
                color={sendState.visuallyActive ? '#FFFFFF' : '#85858F'}
              />
            </TouchableOpacity>
          </View>
        </KeyboardStickyView>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#050506',
  },
  keyboardRegion: {
    flex: 1,
    backgroundColor: '#050506',
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.035)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 10,
    gap: 9,
    minWidth: 0,
  },
  headerAvatarRing: {
    width: 34,
    height: 34,
    borderRadius: 17,
    position: 'relative',
  },
  headerAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  onlineDot: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 9,
    height: 9,
    borderRadius: 4.5,
    backgroundColor: '#10B981',
    borderWidth: 2,
    borderColor: '#0A0A10',
  },
  headerText: {
    flexShrink: 1,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },
  headerSub: {
    marginTop: 1,
    fontSize: 10.5,
    color: '#32B889',
    fontWeight: '500',
    letterSpacing: 0.2,
  },
  headerAction: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Messages Area
  messagesContainer: {
    flex: 1,
  },
  loadingCenter: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
  },
  loadingText: {
    color: '#777783',
    fontSize: 12,
    fontWeight: '500',
  },
  messageScroll: {
    flex: 1,
  },
  messageScrollContent: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 10,
    gap: 5,
  },

  // Date separator
  dateSep: {
    alignItems: 'center',
    paddingTop: 8,
    paddingBottom: 7,
  },
  dateSepText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#52525F',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },

  // Bubbles
  bubbleWrap: {
    flexDirection: 'row',
    marginBottom: 5,
    alignItems: 'flex-start',
    gap: 7,
  },
  bubbleWrapUser: {
    justifyContent: 'flex-end',
  },
  bubbleWrapBot: {
    justifyContent: 'flex-start',
  },
  bubbleWrapSystem: {
    justifyContent: 'center',
  },
  botAvatarSmall: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(255,107,53,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,107,53,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 3,
  },
  bubble: {
    paddingVertical: 9,
    paddingHorizontal: 13,
  },
  userBubble: {
    backgroundColor: ACCENT,
    borderRadius: 18,
    borderBottomRightRadius: 6,
  },
  botBubble: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 18,
    borderBottomLeftRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  salesBubble: {
    backgroundColor: 'rgba(59,130,246,0.12)',
    borderColor: 'rgba(96,165,250,0.28)',
  },
  systemBubble: {
    backgroundColor: 'rgba(59,130,246,0.08)',
    borderColor: 'rgba(59,130,246,0.2)',
    borderWidth: 1,
    borderRadius: 14,
  },
  bubbleText: {
    fontSize: 14,
    lineHeight: 19.5,
    color: '#D7D7DE',
    fontWeight: '400',
  },
  userBubbleText: {
    color: '#FFFFFF',
    fontWeight: '500',
  },
  salesBubbleText: {
    color: '#DBEAFE',
  },
  salesLabel: {
    marginLeft: 4,
    marginBottom: 2,
    color: '#60A5FA',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  systemBubbleText: {
    color: '#93C5FD',
    fontStyle: 'italic',
    fontSize: 12,
  },

  // Typing
  typingBubble: {
    paddingVertical: 12,
    paddingHorizontal: 15,
  },
  typingDots: {
    flexDirection: 'row',
    gap: 5,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#8C8C96',
  },

  // Error
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(239,68,68,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.2)',
    marginTop: 8,
  },

  // Custom wrappers & Chips & Time
  bubbleContentWrapper: {
    flexShrink: 1,
    maxWidth: '84%',
    gap: 5,
  },
  bubbleTime: {
    fontSize: 10,
    color: '#888',
    marginTop: 4,
    alignSelf: 'flex-start',
  },
  userBubbleTime: {
    color: 'rgba(255,255,255,0.7)',
    alignSelf: 'flex-end',
  },
  actionChipsContainer: {
    paddingVertical: 4,
    gap: 8,
  },
  actionChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(255,107,53,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,107,53,0.3)',
    marginRight: 8,
  },
  actionChipText: {
    color: ACCENT,
    fontSize: 13,
    fontWeight: '600',
  },
  suggestedPromptsContainer: {
    marginLeft: 29,
    marginTop: 2,
    marginBottom: 8,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  suggestedPromptChip: {
    flexGrow: 1,
    flexBasis: '45%',
    minHeight: 38,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,107,53,0.3)',
    backgroundColor: 'rgba(255,107,53,0.08)',
    justifyContent: 'center',
  },
  suggestedPromptText: {
    color: '#F4A07F',
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  errorText: {
    flex: 1,
    color: '#EF4444',
    fontSize: 12,
    fontWeight: '500',
  },
  errorRetry: {
    color: ACCENT,
    fontSize: 12,
    fontWeight: '700',
  },

  // Input Area
  inputArea: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
    backgroundColor: '#09090E',
    paddingHorizontal: 12,
    paddingTop: 8,
    zIndex: 2,
    elevation: 4,
  },
  waitingBanner: {
    marginBottom: 10,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.3)',
    backgroundColor: 'rgba(245,158,11,0.08)',
  },
  waitingBannerTitle: {
    color: '#FBBF24',
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
  },
  waitingBannerText: {
    marginTop: 4,
    color: '#FDE68A',
    fontSize: 11,
    lineHeight: 16,
    textAlign: 'center',
  },
  salesBanner: {
    marginBottom: 10,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(59,130,246,0.28)',
    backgroundColor: 'rgba(59,130,246,0.08)',
  },
  salesBannerTitle: {
    color: '#93C5FD',
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
  },
  salesBannerText: {
    marginTop: 4,
    color: '#BFDBFE',
    fontSize: 11,
    textAlign: 'center',
  },
  resolvedBanner: {
    marginBottom: 10,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.2)',
    backgroundColor: 'rgba(148,163,184,0.07)',
  },
  resolvedBannerText: {
    color: '#CBD5E1',
    fontSize: 11,
    lineHeight: 16,
    textAlign: 'center',
  },
  newChatButton: {
    alignSelf: 'center',
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: 'rgba(59,130,246,0.15)',
  },
  newChatButtonText: {
    color: '#93C5FD',
    fontSize: 11,
    fontWeight: '700',
  },
  contactCard: {
    marginBottom: 10,
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(96,165,250,0.24)',
    backgroundColor: '#111118',
    gap: 8,
  },
  contactCardTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  contactCardText: {
    color: '#9292A0',
    fontSize: 11,
    lineHeight: 16,
  },
  contactInput: {
    height: 42,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    paddingHorizontal: 12,
    color: '#FFFFFF',
    fontSize: 13,
  },
  contactSubmitButton: {
    height: 42,
    borderRadius: 12,
    backgroundColor: '#2563EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  contactSubmitText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  connectSalesButton: {
    height: 42,
    marginBottom: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(96,165,250,0.24)',
    backgroundColor: 'rgba(59,130,246,0.1)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  connectSalesButtonText: {
    color: '#93C5FD',
    fontSize: 12,
    fontWeight: '700',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  input: {
    flex: 1,
    minHeight: 44,
    backgroundColor: 'rgba(255,255,255,0.045)',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.085)',
    paddingHorizontal: 15,
    paddingTop: Platform.OS === 'ios' ? 11 : 9,
    paddingBottom: Platform.OS === 'ios' ? 11 : 9,
    fontSize: 14,
    lineHeight: 20,
    color: '#F2F2F5',
    maxHeight: 96,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: ACCENT,
    shadowOpacity: 0.18,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  sendBtnDisabled: {
    backgroundColor: '#25252C',
    shadowOpacity: 0,
  },
  disclaimer: {
    textAlign: 'center',
    fontSize: 9,
    lineHeight: 12,
    color: '#5B5B68',
    fontWeight: '500',
    marginBottom: 6,
    letterSpacing: 0.3,
  },
});
