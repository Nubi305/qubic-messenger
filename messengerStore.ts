/**
 * Global messenger store using Zustand.
 * Handles: auth state, conversations, key storage via idb-keyval.
 */

import { create } from 'zustand';
import { get as idbGet, set as idbSet } from 'idb-keyval';
import { QubicHelper } from '@qubic-lib/qubic-ts-library';
import { Messenger, type Message } from '@qubic-messenger/shared';

const IDB_WRAPPED_KEY = 'qm:wrappedPrivKey';
const IDB_NONCE_KEY   = 'qm:nonce';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Conversation {
  address: string;
  nickname: string;
  messages: Message[];
  lastMessageAt: number;
}

interface MessengerState {
  // Auth
  isInitialized: boolean;
  isLoading: boolean;
  myAddress: string;
  myNickname: string;
  error: string | null;

  // Conversations keyed by recipient address
  conversations: Record<string, Conversation>;

  // Core services
  messenger: Messenger | null;

  // Actions
  init: (seed: string, password: string) => Promise<void>;
  register: (seed: string, password: string, nickname: string) => Promise<void>;
  sendMessage: (recipientNickname: string, text: string) => Promise<void>;
  addIncomingMessage: (msg: Message) => void;
  logout: () => void;
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useMessengerStore = create<MessengerState>((set, get) => ({
  isInitialized: false,
  isLoading: false,
  myAddress: '',
  myNickname: '',
  error: null,
  conversations: {},
  messenger: null,

  init: async (seed: string, password: string) => {
    set({ isLoading: true, error: null });
    try {
      const helper = new QubicHelper();
      const messenger = new Messenger(helper, {
        relayAddress: process.env.NEXT_PUBLIC_RELAY_ADDR,
        postMetaOnChain: true,
      });

      const wrappedKey: string | undefined = await idbGet(IDB_WRAPPED_KEY);
      await messenger.init(seed, password, wrappedKey);

      // Persist wrapped key if newly generated
      if (!wrappedKey) {
        await idbSet(IDB_WRAPPED_KEY, messenger.getWrappedKey(password));
      }

      // Subscribe to incoming messages
      messenger.onMessage((msg) => {
        get().addIncomingMessage(msg);
      });

      set({
        messenger,
        myAddress: messenger.getMyAddress(),
        isInitialized: true,
        isLoading: false,
      });
    } catch (e: any) {
      set({ error: e.message, isLoading: false });
    }
  },

  register: async (seed: string, password: string, nickname: string) => {
    set({ isLoading: true, error: null });
    try {
      const { messenger } = get();
      if (!messenger) throw new Error('Not initialized — call init() first');

      const slot = await messenger.register(nickname);
      if (slot < 0) {
        const errors: Record<number, string> = {
          [-1]: 'Nickname already taken',
          [-2]: 'Registry is full',
          [-3]: 'Already registered',
        };
        throw new Error(errors[slot] ?? `Registration failed (code ${slot})`);
      }

      set({ myNickname: nickname, isLoading: false });
    } catch (e: any) {
      set({ error: e.message, isLoading: false });
    }
  },

  sendMessage: async (recipientNickname: string, text: string) => {
    const { messenger } = get();
    if (!messenger) throw new Error('Not initialized');

    const msg = await messenger.sendTo(recipientNickname, text);

    set((state) => {
      const conv = state.conversations[msg.to] ?? {
        address: msg.to,
        nickname: recipientNickname,
        messages: [],
        lastMessageAt: 0,
      };
      return {
        conversations: {
          ...state.conversations,
          [msg.to]: {
            ...conv,
            messages: [...conv.messages, msg],
            lastMessageAt: msg.timestamp,
          },
        },
      };
    });
  },

  addIncomingMessage: (msg: Message) => {
    set((state) => {
      const conv = state.conversations[msg.from] ?? {
        address: msg.from,
        nickname: msg.fromNickname ?? msg.from.slice(0, 8),
        messages: [],
        lastMessageAt: 0,
      };
      return {
        conversations: {
          ...state.conversations,
          [msg.from]: {
            ...conv,
            messages: [...conv.messages, msg],
            lastMessageAt: msg.timestamp,
          },
        },
      };
    });
  },

  logout: () => {
    const { messenger } = get();
    messenger?.stop();
    set({
      isInitialized: false,
      messenger: null,
      myAddress: '',
      myNickname: '',
      conversations: {},
    });
  },
}));
