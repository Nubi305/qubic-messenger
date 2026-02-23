/**
 * Mobile Chat Window Screen
 * Full conversation view for a single chat thread.
 * Uses Expo Router — file lives at app/chat/[address].tsx
 */

import {
  View, Text, FlatList, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform,
  SafeAreaView, StatusBar, Animated, Pressable
} from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useState, useRef, useEffect } from 'react'
import { useMessengerStore } from '../../src/store/messengerStore'
import { format } from 'date-fns'

export default function ChatScreen() {
  const { address } = useLocalSearchParams<{ address: string }>()
  const router      = useRouter()

  const [input, setInput]   = useState('')
  const [sending, setSending] = useState(false)
  const listRef = useRef<FlatList>(null)
  const inputAnim = useRef(new Animated.Value(0)).current

  const conversation = useMessengerStore(s => s.conversations[address])
  const myAddress    = useMessengerStore(s => s.myAddress)
  const sendMessage  = useMessengerStore(s => s.sendMessage)

  // Scroll to bottom on new messages
  useEffect(() => {
    if (conversation?.messages.length) {
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100)
    }
  }, [conversation?.messages.length])

  // Animate input bar on focus
  const onFocus = () => Animated.spring(inputAnim, {
    toValue: 1, useNativeDriver: false, tension: 100
  }).start()
  const onBlur = () => Animated.spring(inputAnim, {
    toValue: 0, useNativeDriver: false, tension: 100
  }).start()

  const handleSend = async () => {
    if (!input.trim() || sending) return
    const text = input.trim()
    setInput('')
    setSending(true)
    try {
      await sendMessage(conversation?.nickname ?? address, text)
    } finally {
      setSending(false)
    }
  }

  const renderMessage = ({ item: msg, index }: any) => {
    const isMine   = msg.from === myAddress
    const prevMsg  = conversation?.messages[index - 1]
    const showTime = !prevMsg || (msg.timestamp - prevMsg.timestamp > 5 * 60 * 1000)

    return (
      <View>
        {showTime && (
          <Text style={styles.timeLabel}>
            {format(msg.timestamp, 'MMM d, HH:mm')}
          </Text>
        )}
        <View style={[styles.msgRow, isMine ? styles.msgRowMe : styles.msgRowThem]}>
          {!isMine && (
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {(conversation?.nickname ?? 'U').charAt(0).toUpperCase()}
              </Text>
            </View>
          )}
          <Pressable
            style={({ pressed }) => [
              styles.bubble,
              isMine ? styles.bubbleMe : styles.bubbleThem,
              pressed && { opacity: 0.85 }
            ]}
          >
            <Text style={[styles.bubbleText, isMine && styles.bubbleTextMe]}>
              {msg.plaintext}
            </Text>
            <View style={styles.bubbleMeta}>
              <Text style={[styles.bubbleTime, isMine && { color: 'rgba(255,255,255,0.5)' }]}>
                {format(msg.timestamp, 'HH:mm')}
              </Text>
              {isMine && (
                <Text style={styles.deliveredIcon}>
                  {msg.delivered ? ' ✓✓' : ' ✓'}
                </Text>
              )}
            </View>
          </Pressable>
        </View>
      </View>
    )
  }

  const borderColor = inputAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['#1e1e2e', '#6055ff']
  })

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor="#050508" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backArrow}>←</Text>
        </TouchableOpacity>

        <View style={styles.headerInfo}>
          <View style={styles.headerAvatar}>
            <Text style={styles.headerAvatarText}>
              {(conversation?.nickname ?? 'U').charAt(0).toUpperCase()}
            </Text>
          </View>
          <View>
            <Text style={styles.headerName}>
              {conversation?.nickname ?? address?.slice(0, 12) + '…'}
            </Text>
            <Text style={styles.headerStatus}>🔒 End-to-end encrypted</Text>
          </View>
        </View>

        <TouchableOpacity style={styles.infoBtn}>
          <Text style={styles.infoBtnText}>⋯</Text>
        </TouchableOpacity>
      </View>

      {/* Messages */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        <FlatList
          ref={listRef}
          data={conversation?.messages ?? []}
          keyExtractor={item => item.id}
          renderItem={renderMessage}
          contentContainerStyle={styles.messagesList}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>🔐</Text>
              <Text style={styles.emptyTitle}>Encrypted conversation</Text>
              <Text style={styles.emptyDesc}>
                Messages are encrypted before they leave your device.
                Only you and {conversation?.nickname ?? 'the recipient'} can read them.
              </Text>
            </View>
          }
        />

        {/* Input */}
        <View style={styles.inputArea}>
          <Animated.View style={[styles.inputWrap, { borderColor }]}>
            <TextInput
              value={input}
              onChangeText={setInput}
              onFocus={onFocus}
              onBlur={onBlur}
              placeholder="Message…"
              placeholderTextColor="#4a4a6a"
              style={styles.input}
              multiline
              maxLength={2000}
              returnKeyType="send"
              onSubmitEditing={handleSend}
              blurOnSubmit
            />
          </Animated.View>

          <TouchableOpacity
            onPress={handleSend}
            disabled={!input.trim() || sending}
            style={[styles.sendBtn, (!input.trim() || sending) && styles.sendBtnDisabled]}
          >
            <Text style={styles.sendBtnText}>↑</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.e2eeNote}>
          <Text style={styles.e2eeText}>🔒 Messages encrypted with X25519 · Qubic Messenger</Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#050508' },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: '#1c1c30',
    backgroundColor: '#0c0c14',
  },
  backBtn: { padding: 8, marginRight: 4 },
  backArrow: { color: '#6055ff', fontSize: 22, fontWeight: '600' },
  headerInfo: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerAvatar: {
    width: 38, height: 38, borderRadius: 12,
    background: 'linear-gradient(135deg, #6055ff, #00d4aa)',
    backgroundColor: '#2a1f6e',
    justifyContent: 'center', alignItems: 'center',
  },
  headerAvatarText: { color: '#a09aff', fontWeight: '800', fontSize: 16 },
  headerName: { color: '#f0f0f8', fontWeight: '700', fontSize: 16 },
  headerStatus: { color: '#00d4aa', fontSize: 11, marginTop: 1 },
  infoBtn: { padding: 8 },
  infoBtnText: { color: '#5a5a7a', fontSize: 22 },

  // Messages
  messagesList: { padding: 16, paddingBottom: 8 },
  timeLabel: {
    textAlign: 'center', color: '#5a5a7a',
    fontSize: 11, fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace' }),
    marginVertical: 16,
  },
  msgRow: { flexDirection: 'row', marginBottom: 4, alignItems: 'flex-end', gap: 8 },
  msgRowMe: { justifyContent: 'flex-end' },
  msgRowThem: { justifyContent: 'flex-start' },
  avatar: {
    width: 28, height: 28, borderRadius: 8,
    backgroundColor: '#1c1c30',
    justifyContent: 'center', alignItems: 'center',
    marginBottom: 2,
  },
  avatarText: { color: '#9090c0', fontWeight: '700', fontSize: 12 },
  bubble: {
    maxWidth: '75%', padding: 10, borderRadius: 16,
  },
  bubbleMe: {
    backgroundColor: '#2a1f6e',
    borderWidth: 1, borderColor: 'rgba(96,85,255,0.2)',
    borderBottomRightRadius: 4,
  },
  bubbleThem: {
    backgroundColor: '#111120',
    borderWidth: 1, borderColor: '#1c1c30',
    borderBottomLeftRadius: 4,
  },
  bubbleText: { color: '#d0d0e8', fontSize: 15, lineHeight: 21 },
  bubbleTextMe: { color: '#e8e8ff' },
  bubbleMeta: { flexDirection: 'row', marginTop: 3, justifyContent: 'flex-end' },
  bubbleTime: { color: '#5a5a7a', fontSize: 10 },
  deliveredIcon: { color: '#6055ff', fontSize: 10 },

  // Empty state
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 48, marginTop: 60 },
  emptyIcon: { fontSize: 48, marginBottom: 16 },
  emptyTitle: { color: '#f0f0f8', fontWeight: '700', fontSize: 18, marginBottom: 10 },
  emptyDesc: { color: '#5a5a7a', textAlign: 'center', fontSize: 14, lineHeight: 22 },

  // Input
  inputArea: {
    flexDirection: 'row', alignItems: 'flex-end',
    paddingHorizontal: 12, paddingTop: 10, paddingBottom: 8,
    borderTopWidth: 1, borderTopColor: '#1c1c30',
    backgroundColor: '#0c0c14', gap: 10,
  },
  inputWrap: {
    flex: 1,
    backgroundColor: '#111120',
    borderWidth: 1, borderRadius: 20,
    paddingHorizontal: 16, paddingVertical: 8,
    maxHeight: 120,
  },
  input: { color: '#f0f0f8', fontSize: 15, lineHeight: 22 },
  sendBtn: {
    width: 42, height: 42, borderRadius: 14,
    backgroundColor: '#6055ff',
    justifyContent: 'center', alignItems: 'center',
  },
  sendBtnDisabled: { backgroundColor: '#1c1c30' },
  sendBtnText: { color: '#fff', fontSize: 20, fontWeight: '700' },

  // E2EE footer
  e2eeNote: { paddingVertical: 6, alignItems: 'center', backgroundColor: '#0c0c14' },
  e2eeText: { color: '#2a2a40', fontSize: 10 },
})
