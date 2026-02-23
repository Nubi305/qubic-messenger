/**
 * User Profile + Theme Toggle — Qubic Messenger
 * React component for web frontend
 */

'use client'

import { useState, useEffect, useCallback } from 'react'
import { useMessengerStore } from '../store/messengerStore'

// ─── Avatar Generation ────────────────────────────────────────────────────────

/** Generate a deterministic color from a Qubic address */
function addressToColor(address: string): string {
  let hash = 0
  for (let i = 0; i < address.length; i++) {
    hash = ((hash << 5) - hash) + address.charCodeAt(i)
    hash |= 0
  }
  const hue = Math.abs(hash) % 360
  return `hsl(${hue}, 65%, 55%)`
}

/** Generate initials from nickname */
function getInitials(nickname: string): string {
  return nickname
    .split(/\s+/)
    .map(w => w[0]?.toUpperCase() ?? '')
    .slice(0, 2)
    .join('')
}

interface AvatarProps {
  nickname:  string
  address:   string
  size?:     number
  className?: string
}

export function Avatar({ nickname, address, size = 40, className }: AvatarProps) {
  const color    = addressToColor(address)
  const initials = getInitials(nickname) || '?'

  return (
    <div
      className={className}
      style={{
        width:           size,
        height:          size,
        borderRadius:    size * 0.28,
        background:      color,
        display:         'flex',
        alignItems:      'center',
        justifyContent:  'center',
        fontWeight:      800,
        fontSize:        size * 0.38,
        color:           '#fff',
        flexShrink:      0,
        userSelect:      'none',
        letterSpacing:   '-0.5px',
      }}
    >
      {initials}
    </div>
  )
}

// ─── Theme System ─────────────────────────────────────────────────────────────

type Theme = 'dark' | 'light' | 'system'

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>('dark')

  useEffect(() => {
    const saved = localStorage.getItem('qm-theme') as Theme ?? 'dark'
    setThemeState(saved)
    applyTheme(saved)
  }, [])

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t)
    localStorage.setItem('qm-theme', t)
    applyTheme(t)
  }, [])

  return { theme, setTheme }
}

function applyTheme(theme: Theme) {
  const root       = document.documentElement
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
  const isDark     = theme === 'dark' || (theme === 'system' && prefersDark)

  if (isDark) {
    root.style.setProperty('--bg',      '#050508')
    root.style.setProperty('--surface', '#0c0c14')
    root.style.setProperty('--border',  '#1c1c30')
    root.style.setProperty('--text',    '#f0f0f8')
    root.style.setProperty('--muted',   '#5a5a7a')
    root.classList.add('dark')
    root.classList.remove('light')
  } else {
    root.style.setProperty('--bg',      '#f8f8fc')
    root.style.setProperty('--surface', '#ffffff')
    root.style.setProperty('--border',  '#e0e0f0')
    root.style.setProperty('--text',    '#111118')
    root.style.setProperty('--muted',   '#8080a0')
    root.classList.add('light')
    root.classList.remove('dark')
  }
}

// ─── Theme Toggle Component ───────────────────────────────────────────────────

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()

  const options: { value: Theme; icon: string; label: string }[] = [
    { value: 'light',  icon: '☀️', label: 'Light'  },
    { value: 'dark',   icon: '🌙', label: 'Dark'   },
    { value: 'system', icon: '💻', label: 'System' },
  ]

  return (
    <div style={{
      display:        'flex',
      background:     'var(--surface)',
      border:         '1px solid var(--border)',
      borderRadius:   12,
      padding:        4,
      gap:            4,
    }}>
      {options.map(opt => (
        <button
          key={opt.value}
          onClick={() => setTheme(opt.value)}
          title={opt.label}
          style={{
            background:   theme === opt.value ? 'var(--border)' : 'transparent',
            border:       'none',
            borderRadius: 8,
            padding:      '6px 12px',
            cursor:       'pointer',
            fontSize:     16,
            transition:   'background 0.15s',
            display:      'flex',
            alignItems:   'center',
            gap:          6,
          }}
        >
          <span>{opt.icon}</span>
          <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>
            {opt.label}
          </span>
        </button>
      ))}
    </div>
  )
}

// ─── Profile Card Component ───────────────────────────────────────────────────

interface ProfileCardProps {
  onClose: () => void
}

export function ProfileCard({ onClose }: ProfileCardProps) {
  const { myAddress, myNickname } = useMessengerStore()
  const { theme, setTheme }       = useTheme()
  const [copied, setCopied]       = useState(false)

  const copyAddress = () => {
    navigator.clipboard.writeText(myAddress)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div style={{
      position:     'fixed', inset: 0,
      background:   'rgba(0,0,0,0.6)',
      backdropFilter: 'blur(8px)',
      display:      'flex',
      alignItems:   'center',
      justifyContent: 'center',
      zIndex:       1000,
    }} onClick={onClose}>
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background:   'var(--surface)',
          border:       '1px solid var(--border)',
          borderRadius: 24,
          padding:      32,
          width:        360,
          boxShadow:    '0 40px 80px rgba(0,0,0,0.5)',
        }}
      >
        {/* Avatar + Name */}
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <Avatar
            nickname={myNickname}
            address={myAddress}
            size={72}
            style={{ margin: '0 auto 12px' }}
          />
          <div style={{ fontWeight: 800, fontSize: 20, color: 'var(--text)' }}>
            {myNickname}
          </div>
          <button
            onClick={copyAddress}
            style={{
              marginTop:    6,
              background:   'transparent',
              border:       'none',
              color:        'var(--muted)',
              cursor:       'pointer',
              fontSize:     12,
              fontFamily:   'monospace',
            }}
          >
            {copied ? '✓ Copied!' : myAddress.slice(0, 20) + '…'}
          </button>
        </div>

        {/* Theme toggle */}
        <div style={{ marginBottom: 16 }}>
          <div style={{
            fontSize: 11, fontWeight: 700, letterSpacing: 2,
            color: 'var(--muted)', marginBottom: 8, textTransform: 'uppercase'
          }}>
            Appearance
          </div>
          <ThemeToggle />
        </div>

        {/* Stats */}
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr',
          gap: 8, marginTop: 20,
        }}>
          {[
            { label: 'Conversations', value: '—' },
            { label: 'Messages Sent', value: '—' },
          ].map(stat => (
            <div key={stat.label} style={{
              background:   'var(--bg)',
              border:       '1px solid var(--border)',
              borderRadius: 12,
              padding:      12,
              textAlign:    'center',
            }}>
              <div style={{ fontWeight: 800, fontSize: 18, color: 'var(--text)' }}>
                {stat.value}
              </div>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                {stat.label}
              </div>
            </div>
          ))}
        </div>

        {/* Close */}
        <button
          onClick={onClose}
          style={{
            marginTop:    20, width: '100%',
            background:   'var(--border)',
            border:       'none',
            borderRadius: 12,
            padding:      12,
            color:        'var(--text)',
            fontWeight:   700,
            cursor:       'pointer',
            fontSize:     14,
          }}
        >
          Close
        </button>
      </div>
    </div>
  )
}
