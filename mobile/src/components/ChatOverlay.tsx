/**
 * ChatOverlay — Full-Screen Premium AI Chatbot
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
  KeyboardAvoidingView,
  Platform,
  Dimensions,
  ActivityIndicator,
  Modal,
} from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeInUp, SlideInDown, SlideOutDown, useSharedValue, withRepeat, withTiming, withDelay, useAnimatedStyle } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { chatbotService, type ChatMessageRecord } from '@/services/api/chatbotService';

interface ChatOverlayProps {
  visible: boolean;
  onClose: () => void;
}

const ACCENT = '#FF6B35';
const { width: SW, height: SH } = Dimensions.get('window');

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
  }, []);
  
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

export default function ChatOverlay({ visible, onClose }: ChatOverlayProps) {
  const insets = useSafeAreaInsets();
  const [messages, setMessages] = useState<ChatMessageRecord[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const inputRef = useRef<TextInput>(null);
  const hasInitialized = useRef(false);

  // Load session + history
  const initSession = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const session = await chatbotService.startSession('mobile');
      if (session.messages.length > 0) {
        setMessages(session.messages);
      } else {
        // Welcome message if no history
        setMessages([
          {
            id: 'welcome',
            sender: 'assistant',
            message:
              'Hi — how can I help you today?',
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
  }, []);

  useEffect(() => {
    if (visible && !hasInitialized.current) {
      hasInitialized.current = true;
      initSession();
    }
  }, [visible, initSession]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 150);
    }
  }, [messages]);

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed || sending) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setInput('');
    setError(null);

    // Add user message immediately
    const userMsg: ChatMessageRecord = {
      id: `user-${Date.now()}`,
      sender: 'user',
      message: trimmed,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);

    setSending(true);
    try {
      const getContextString = await AsyncStorage.getItem('@autospf_latest_scan_context');
      let localAppContext: any = undefined;
      if (getContextString) {
        try {
          localAppContext = JSON.parse(getContextString);
        } catch (e) {}
      }

      const response = await chatbotService.sendMessage(trimmed, localAppContext);

      const botMsg: ChatMessageRecord = {
        id: `bot-${Date.now()}`,
        sender: 'assistant',
        message: response.reply,
        createdAt: new Date().toISOString(),
        actionChips: response.actionChips,
      };
      setMessages((prev) => [...prev, botMsg]);

      // Handle action intents
      if (response.action?.type === 'handoff') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }

      if (response.leadRequired) {
        const leadMsg: ChatMessageRecord = {
          id: `system-${Date.now()}`,
          sender: 'system',
          message: 'Please share your name and phone number to continue.',
        };
        setMessages((prev) => [...prev, leadMsg]);
      }
    } catch (err) {
      console.warn('Chat send failed:', err);
      const errMsg: ChatMessageRecord = {
        id: `err-${Date.now()}`,
        sender: 'assistant',
        message: 'Sorry, I had trouble sending that. Please try again.',
      };
      setMessages((prev) => [...prev, errMsg]);
    } finally {
      setSending(false);
    }
  };

  const handleRetry = () => {
    hasInitialized.current = false;
    initSession();
  };

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={s.screen}
      >
        {/* ── Header ── */}
        <LinearGradient
          colors={['#0E0E14', '#0A0A10']}
          style={[s.header, { paddingTop: 12 }]}
        >
          <TouchableOpacity onPress={onClose} style={s.backBtn}>
            <Ionicons name="arrow-back" size={18} color="#fff" />
          </TouchableOpacity>

          <View style={s.headerCenter}>
            <View style={s.headerAvatarRing}>
              <LinearGradient
                colors={[ACCENT, '#D44200']}
                style={s.headerAvatar}
              >
                <Ionicons name="sparkles" size={14} color="#fff" />
              </LinearGradient>
              <View style={s.onlineDot} />
            </View>
            <View>
              <Text style={s.headerTitle}>AutoSPF+ AI</Text>
              <Text style={s.headerSub}>Online · 24/7</Text>
            </View>
          </View>

          <TouchableOpacity onPress={handleRetry} style={s.headerAction}>
            <Ionicons name="refresh-outline" size={16} color="#888" />
          </TouchableOpacity>
        </LinearGradient>

        {/* ── Messages ── */}
        <View style={s.messagesContainer}>
          {loading ? (
            <View style={s.loadingCenter}>
              <ActivityIndicator size="large" color={ACCENT} />
              <Text style={s.loadingText}>Connecting to AI assistant…</Text>
            </View>
          ) : (
            <ScrollView
              ref={scrollRef}
              style={s.messageScroll}
              contentContainerStyle={s.messageScrollContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
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
                    m.sender === 'user' ? s.bubbleWrapUser : s.bubbleWrapBot,
                  ]}
                >
                  {m.sender !== 'user' && (
                    <View style={s.botAvatarSmall}>
                      <Ionicons name="sparkles" size={10} color={ACCENT} />
                    </View>
                  )}
                  <View style={[
                    s.bubbleContentWrapper, 
                    m.sender === 'user' ? { alignItems: 'flex-end' } : { alignItems: 'flex-start' }
                  ]}>
                    <View
                      style={[
                        s.bubble,
                        m.sender === 'user' ? s.userBubble : s.botBubble,
                        m.sender === 'system' && s.systemBubble,
                      ]}
                    >
                      <Text
                        style={[
                          s.bubbleText,
                          m.sender === 'user' && s.userBubbleText,
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

              {/* Typing indicator */}
              {sending && (
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
            </ScrollView>
          )}
        </View>

        {/* ── Input ── */}
        <View style={[s.inputArea, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          <View style={s.inputRow}>
            <TextInput
              ref={inputRef}
              value={input}
              onChangeText={setInput}
              onSubmitEditing={handleSend}
              returnKeyType="send"
              placeholder="Ask about services, pricing, bookings…"
              placeholderTextColor="#4A4A58"
              style={s.input}
              editable={!loading}
              multiline
              maxLength={500}
            />
            <TouchableOpacity
              onPress={handleSend}
              disabled={sending || !input.trim()}
              style={[s.sendBtn, (!input.trim() || sending) && s.sendBtnDisabled]}
              activeOpacity={0.8}
            >
              {sending ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Ionicons name="send" size={16} color="#fff" />
              )}
            </TouchableOpacity>
          </View>
          <Text style={s.disclaimer}>
            Powered by AutoSPF+ AI · Responses may not be 100% accurate
          </Text>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const s = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#050506',
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 12,
    gap: 10,
  },
  headerAvatarRing: {
    width: 36,
    height: 36,
    borderRadius: 18,
    position: 'relative',
  },
  headerAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  onlineDot: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#10B981',
    borderWidth: 2,
    borderColor: '#0A0A10',
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
  headerSub: {
    fontSize: 11,
    color: '#10B981',
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  headerAction: {
    width: 36,
    height: 36,
    borderRadius: 10,
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
    gap: 12,
  },
  loadingText: {
    color: '#6B6B78',
    fontSize: 13,
    fontWeight: '500',
  },
  messageScroll: {
    flex: 1,
  },
  messageScrollContent: {
    padding: 16,
    paddingBottom: 8,
    gap: 6,
  },

  // Date separator
  dateSep: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  dateSepText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#4A4A58',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },

  // Bubbles
  bubbleWrap: {
    flexDirection: 'row',
    marginBottom: 4,
    alignItems: 'flex-end',
    gap: 8,
  },
  bubbleWrapUser: {
    justifyContent: 'flex-end',
  },
  bubbleWrapBot: {
    justifyContent: 'flex-start',
  },
  botAvatarSmall: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(255,107,53,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,107,53,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bubble: {
    paddingVertical: 10,
    paddingHorizontal: 14,
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
  systemBubble: {
    backgroundColor: 'rgba(59,130,246,0.08)',
    borderColor: 'rgba(59,130,246,0.2)',
    borderWidth: 1,
    borderRadius: 14,
  },
  bubbleText: {
    fontSize: 14,
    lineHeight: 20,
    color: '#D4D4DC',
    fontWeight: '400',
  },
  userBubbleText: {
    color: '#FFFFFF',
    fontWeight: '500',
  },
  systemBubbleText: {
    color: '#93C5FD',
    fontStyle: 'italic',
    fontSize: 12,
  },

  // Typing
  typingBubble: {
    paddingVertical: 14,
    paddingHorizontal: 18,
  },
  typingDots: {
    flexDirection: 'row',
    gap: 5,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#888',
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
    maxWidth: '85%',
    gap: 6,
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
    backgroundColor: '#0A0A10',
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
  },
  input: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    paddingHorizontal: 16,
    paddingVertical: Platform.OS === 'ios' ? 12 : 10,
    fontSize: 14,
    color: '#E8E8ED',
    maxHeight: 100,
  },
  sendBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: ACCENT,
    shadowOpacity: 0.4,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  sendBtnDisabled: {
    backgroundColor: '#2A2A30',
    shadowOpacity: 0,
  },
  disclaimer: {
    textAlign: 'center',
    fontSize: 9,
    color: '#3A3A48',
    fontWeight: '500',
    marginTop: 8,
    letterSpacing: 0.3,
  },
});
