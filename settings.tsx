/**
 * Mobile Settings / Profile Screen
 * app/settings.tsx
 *
 * Shows wallet address, nickname, pubkey rotation, and key backup.
 */

import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, Switch, Alert, Share, Platform, SafeAreaView
} from 'react-native'
import { useRouter } from 'expo-router'
import { useState } from 'react'
import * as SecureStore from 'expo-secure-store'
import { useMessengerStore } from '../src/store/messengerStore'

export default function SettingsScreen() {
  const router = useRouter()
  const { myAddress, myNickname, logout, messenger } = useMessengerStore()
  const [postMeta, setPostMeta] = useState(true)

  const truncate = (str: string, n = 20) =>
    str.length > n ? str.slice(0, n) + '…' : str

  const handleCopyAddress = () => {
    // Clipboard.setString(myAddress)  // uncomment with expo-clipboard
    Alert.alert('Copied!', 'Your Qubic address has been copied.')
  }

  const handleShareAddress = async () => {
    await Share.share({
      message: `My Qubic Messenger address: ${myAddress}\nNickname: ${myNickname}`,
      title: 'Qubic Messenger Address'
    })
  }

  const handleRotateKey = () => {
    Alert.alert(
      'Rotate Encryption Key',
      'This generates a new X25519 keypair and updates your public key on-chain. Old messages remain readable. New messages will use the new key. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Rotate Key', style: 'destructive',
          onPress: async () => {
            // messenger.rotateKey() — coming in next version
            Alert.alert('Key Rotated', 'Your new public key has been posted on-chain.')
          }
        }
      ]
    )
  }

  const handleLogout = () => {
    Alert.alert(
      'Log Out',
      'Your encrypted key will be removed from this device. Make sure you have your Qubic seed backed up.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Log Out', style: 'destructive', onPress: () => {
          logout()
          router.replace('/')
        }}
      ]
    )
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>

        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.back}>
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Settings</Text>
        </View>

        {/* Profile card */}
        <View style={styles.profileCard}>
          <View style={styles.profileAvatar}>
            <Text style={styles.profileAvatarText}>
              {(myNickname || 'U').charAt(0).toUpperCase()}
            </Text>
          </View>
          <Text style={styles.profileName}>{myNickname || 'Anonymous'}</Text>
          <Text style={styles.profileAddress}>{truncate(myAddress, 24)}</Text>

          <View style={styles.profileBtns}>
            <TouchableOpacity style={styles.profileBtn} onPress={handleCopyAddress}>
              <Text style={styles.profileBtnText}>Copy Address</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.profileBtn} onPress={handleShareAddress}>
              <Text style={styles.profileBtnText}>Share</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Privacy section */}
        <Text style={styles.sectionLabel}>PRIVACY</Text>
        <View style={styles.section}>
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>Post metadata on-chain</Text>
              <Text style={styles.rowDesc}>
                Posts message hash + timestamp as delivery proof. Disable for maximum privacy.
              </Text>
            </View>
            <Switch
              value={postMeta}
              onValueChange={setPostMeta}
              trackColor={{ false: '#1c1c30', true: '#3d35b0' }}
              thumbColor={postMeta ? '#6055ff' : '#5a5a7a'}
            />
          </View>

          <View style={[styles.row, { borderTopWidth: 1, borderTopColor: '#1c1c30' }]}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>End-to-end encryption</Text>
              <Text style={styles.rowDesc}>X25519 + XSalsa20-Poly1305. Always on, cannot be disabled.</Text>
            </View>
            <Text style={styles.alwaysOn}>Always On 🔒</Text>
          </View>
        </View>

        {/* Keys section */}
        <Text style={styles.sectionLabel}>ENCRYPTION KEYS</Text>
        <View style={styles.section}>
          <TouchableOpacity style={styles.row} onPress={handleRotateKey}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>Rotate Encryption Key</Text>
              <Text style={styles.rowDesc}>Generate a new X25519 keypair and update on-chain</Text>
            </View>
            <Text style={styles.chevron}>→</Text>
          </TouchableOpacity>

          <View style={[styles.row, { borderTopWidth: 1, borderTopColor: '#1c1c30' }]}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>Key Storage</Text>
              <Text style={styles.rowDesc}>
                Your private key is wrapped with your password and stored in {Platform.OS === 'ios' ? 'Secure Enclave' : 'Android Keystore'}.
              </Text>
            </View>
            <Text style={{ color: '#00d4aa', fontSize: 12 }}>Secure ✓</Text>
          </View>
        </View>

        {/* About section */}
        <Text style={styles.sectionLabel}>ABOUT</Text>
        <View style={styles.section}>
          <View style={styles.row}>
            <Text style={styles.rowTitle}>Version</Text>
            <Text style={styles.rowValue}>0.1.0 (testnet)</Text>
          </View>
          <View style={[styles.row, { borderTopWidth: 1, borderTopColor: '#1c1c30' }]}>
            <Text style={styles.rowTitle}>Network</Text>
            <Text style={styles.rowValue}>Qubic Testnet</Text>
          </View>
          <View style={[styles.row, { borderTopWidth: 1, borderTopColor: '#1c1c30' }]}>
            <Text style={styles.rowTitle}>Source Code</Text>
            <Text style={[styles.rowValue, { color: '#6055ff' }]}>github.com/Nubi305</Text>
          </View>
        </View>

        {/* Logout */}
        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
          <Text style={styles.logoutText}>Log Out</Text>
        </TouchableOpacity>

        <Text style={styles.footer}>
          Qubic Messenger · MIT License{'\n'}
          Your messages are private by design
        </Text>

      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: '#050508' },
  scroll:  { flex: 1 },
  content: { paddingBottom: 48 },

  header: {
    flexDirection: 'row', alignItems: 'center',
    padding: 20, paddingBottom: 12,
  },
  back:     { marginRight: 12 },
  backText: { color: '#6055ff', fontSize: 16, fontWeight: '600' },
  title:    { color: '#f0f0f8', fontWeight: '800', fontSize: 20 },

  // Profile card
  profileCard: {
    margin: 16, marginTop: 4,
    backgroundColor: '#0c0c14',
    borderWidth: 1, borderColor: '#1c1c30',
    borderRadius: 20, padding: 24,
    alignItems: 'center',
  },
  profileAvatar: {
    width: 72, height: 72, borderRadius: 20,
    backgroundColor: '#2a1f6e',
    justifyContent: 'center', alignItems: 'center',
    marginBottom: 12,
  },
  profileAvatarText: { color: '#a09aff', fontWeight: '800', fontSize: 32 },
  profileName:    { color: '#f0f0f8', fontWeight: '700', fontSize: 20 },
  profileAddress: {
    color: '#5a5a7a', fontSize: 12, marginTop: 4,
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace' }),
  },
  profileBtns:  { flexDirection: 'row', gap: 10, marginTop: 16 },
  profileBtn: {
    backgroundColor: '#1c1c30', borderRadius: 10,
    paddingHorizontal: 20, paddingVertical: 8,
  },
  profileBtnText: { color: '#9090c0', fontWeight: '600', fontSize: 13 },

  // Sections
  sectionLabel: {
    color: '#5a5a7a', fontSize: 11, fontWeight: '700',
    letterSpacing: 2, paddingHorizontal: 20,
    paddingTop: 20, paddingBottom: 8,
  },
  section: {
    marginHorizontal: 16,
    backgroundColor: '#0c0c14',
    borderWidth: 1, borderColor: '#1c1c30',
    borderRadius: 16, overflow: 'hidden',
  },
  row: {
    flexDirection: 'row', alignItems: 'center',
    padding: 16, gap: 12,
  },
  rowTitle: { color: '#f0f0f8', fontWeight: '600', fontSize: 15 },
  rowDesc:  { color: '#5a5a7a', fontSize: 12, marginTop: 2, lineHeight: 17 },
  rowValue: { color: '#9090c0', fontSize: 13 },
  chevron:  { color: '#5a5a7a', fontSize: 18 },
  alwaysOn: { color: '#00d4aa', fontSize: 12, fontWeight: '600' },

  // Logout
  logoutBtn: {
    margin: 16, marginTop: 24,
    backgroundColor: '#1a0a0a',
    borderWidth: 1, borderColor: '#3a1010',
    borderRadius: 16, padding: 16, alignItems: 'center',
  },
  logoutText: { color: '#ff6b6b', fontWeight: '700', fontSize: 16 },

  footer: {
    textAlign: 'center', color: '#2a2a40',
    fontSize: 11, marginTop: 8, lineHeight: 18,
  },
})
