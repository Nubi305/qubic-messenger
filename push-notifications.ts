/**
 * Push Notifications — Qubic Messenger
 *
 * Uses the Web Push API (service worker) for browser notifications.
 * No server stores your subscription — the push endpoint is stored
 * locally and shared only with your contacts via the E2EE channel.
 *
 * On mobile (React Native): uses Expo Notifications.
 */

// ─── Service Worker Registration ──────────────────────────────────────────────

const SW_PATH = '/sw.js'

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null
  try {
    const reg = await navigator.serviceWorker.register(SW_PATH)
    console.log('[Push] Service worker registered')
    return reg
  } catch (err) {
    console.error('[Push] Service worker registration failed:', err)
    return null
  }
}

// ─── Push Subscription ────────────────────────────────────────────────────────

/** Request push notification permission and get subscription */
export async function subscribeToPush(
  vapidPublicKey: string
): Promise<PushSubscription | null> {
  const reg = await registerServiceWorker()
  if (!reg) return null

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    console.log('[Push] Permission denied')
    return null
  }

  try {
    const subscription = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
    })
    console.log('[Push] Subscribed:', subscription.endpoint.slice(0, 40) + '…')
    return subscription
  } catch (err) {
    console.error('[Push] Subscription failed:', err)
    return null
  }
}

/** Check current permission status */
export function getNotificationPermission(): NotificationPermission {
  if (!('Notification' in window)) return 'denied'
  return Notification.permission
}

// ─── Local Notifications ──────────────────────────────────────────────────────

export interface NotificationPayload {
  title:   string
  body:    string
  icon?:   string
  badge?:  string
  tag?:    string   // Groups notifications from same sender
  data?:   Record<string, unknown>
}

/** Show a local notification (when app is in background) */
export async function showNotification(payload: NotificationPayload): Promise<void> {
  if (Notification.permission !== 'granted') return

  const reg = await navigator.serviceWorker.ready
  await reg.showNotification(payload.title, {
    body:  payload.body,
    icon:  payload.icon  ?? '/icon-192.png',
    badge: payload.badge ?? '/badge-72.png',
    tag:   payload.tag,
    data:  payload.data,
    // @ts-ignore — vibrate is supported in Chrome
    vibrate: [200, 100, 200],
  })
}

/** Show a new message notification */
export async function notifyNewMessage(
  senderNickname: string,
  preview:        string,  // Short preview (first 60 chars)
  conversationId: string
): Promise<void> {
  // Truncate preview for privacy
  const body = preview.length > 60
    ? preview.slice(0, 60) + '…'
    : preview

  await showNotification({
    title: `New message from ${senderNickname}`,
    body,
    tag:  conversationId,  // Collapses multiple messages from same sender
    data: { conversationId, type: 'message' }
  })
}

/** Show a group message notification */
export async function notifyGroupMessage(
  groupName:      string,
  senderNickname: string,
  preview:        string,
  groupId:        string
): Promise<void> {
  await showNotification({
    title: groupName,
    body:  `${senderNickname}: ${preview.slice(0, 50)}`,
    tag:   groupId,
    data:  { groupId, type: 'group_message' }
  })
}

// ─── Service Worker (sw.js content) ──────────────────────────────────────────
// Save this as /public/sw.js in your Next.js app

export const SERVICE_WORKER_CODE = `
self.addEventListener('push', (event) => {
  if (!event.data) return;
  
  const data = event.data.json();
  
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body:    data.body,
      icon:    data.icon  || '/icon-192.png',
      badge:   data.badge || '/badge-72.png',
      tag:     data.tag,
      data:    data.data,
      vibrate: [200, 100, 200],
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  
  const conversationId = event.notification.data?.conversationId;
  const groupId        = event.notification.data?.groupId;
  const target         = conversationId || groupId;
  
  if (target) {
    event.waitUntil(
      clients.openWindow('/chat/' + target)
    );
  } else {
    event.waitUntil(clients.openWindow('/'));
  }
});

// Cache app shell for offline support
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open('qubic-messenger-v1').then((cache) =>
      cache.addAll(['/', '/chat'])
    )
  );
});
`

// ─── Helper ───────────────────────────────────────────────────────────────────

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - base64String.length % 4) % 4)
  const base64  = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)))
}
