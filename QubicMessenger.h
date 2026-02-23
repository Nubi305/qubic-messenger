#pragma once

/**
 * QubicMessenger Smart Contract
 *
 * Provides:
 *   - User registration (nickname → X25519 pubkey mapping)
 *   - Pubkey lookup by nickname
 *   - On-chain message metadata (hash + sender/receiver) for delivery proof
 *   - Nonce-based anti-replay protection
 *   - Pubkey rotation for registered users
 *
 * NOTE: Message content is NEVER stored on-chain.
 *       Only BLAKE2b-256 hashes of encrypted blobs are recorded.
 */

using namespace QPI;

// ─── Constants ────────────────────────────────────────────────────────────────

#define QM_MAX_USERS       8192
#define QM_NICKNAME_LEN    32   // fixed-width, null-padded UTF-8
#define QM_PUBKEY_LEN      32   // X25519 public key (32 bytes)
#define QM_HASH_LEN        32   // BLAKE2b-256 hash of encrypted blob
#define QM_MSG_LOG_SIZE    65536  // ring buffer for message metadata

// ─── Data Structures ─────────────────────────────────────────────────────────

struct QM_UserRecord {
    uint8  nickname[QM_NICKNAME_LEN];
    uint8  pubkey[QM_PUBKEY_LEN];
    id     owner;            // Qubic wallet identity that owns this nickname
    uint32 registeredTick;
    uint32 lastUpdateTick;
    uint8  active;           // 1 = active, 0 = deactivated
};

struct QM_MessageMeta {
    id     sender;
    id     receiver;
    uint8  contentHash[QM_HASH_LEN];
    uint32 tick;
    uint32 nonce;
};

// ─── Contract ─────────────────────────────────────────────────────────────────

struct QubicMessenger {

    QM_UserRecord  users[QM_MAX_USERS];
    uint32         userCount;

    // Per-user monotonic nonce (index aligned with users[])
    uint32         lastNonce[QM_MAX_USERS];

    // Tick of last PostMessageMeta per user (rate limiting)
    uint32         lastPostTick[QM_MAX_USERS];

    // Ring buffer for message metadata log
    QM_MessageMeta msgLog[QM_MSG_LOG_SIZE];
    uint32         msgHead;  // next write position

    // ── Helpers (inlined for QPI compatibility) ───────────────────────────────

    // Returns user slot index for a given owner id, or -1 if not found
    sint32 _findSlotByOwner(const id& owner) {
        for (uint32 i = 0; i < userCount; i++) {
            if (users[i].active && users[i].owner == owner) return (sint32)i;
        }
        return -1;
    }

    // Returns user slot index for a given nickname, or -1 if not found
    sint32 _findSlotByNickname(const uint8* nickname) {
        for (uint32 i = 0; i < userCount; i++) {
            if (users[i].active &&
                QPI::memcmp(users[i].nickname, nickname, QM_NICKNAME_LEN) == 0) {
                return (sint32)i;
            }
        }
        return -1;
    }

    // ── Procedure: RegisterUser ───────────────────────────────────────────────

    struct RegisterUser_input {
        uint8 nickname[QM_NICKNAME_LEN];
        uint8 pubkey[QM_PUBKEY_LEN];
    };
    struct RegisterUser_output {
        sint32 slotIndex; // >= 0 on success, -1 taken, -2 registry full, -3 already registered
    };

    PUBLIC_PROCEDURE(RegisterUser)
        id caller = qpi.invocator();

        // Prevent double-registration by same wallet
        if (_findSlotByOwner(caller) >= 0) {
            output.slotIndex = -3;
            return;
        }

        // Check nickname availability
        sint32 existing = _findSlotByNickname(input.nickname);
        if (existing >= 0) {
            output.slotIndex = -1; // nickname taken by someone else
            return;
        }

        // Check registry capacity
        if (userCount >= QM_MAX_USERS) {
            output.slotIndex = -2;
            return;
        }

        uint32 slot = userCount++;
        QPI::memcpy(users[slot].nickname, input.nickname, QM_NICKNAME_LEN);
        QPI::memcpy(users[slot].pubkey,   input.pubkey,   QM_PUBKEY_LEN);
        users[slot].owner            = caller;
        users[slot].registeredTick   = qpi.tick();
        users[slot].lastUpdateTick   = qpi.tick();
        users[slot].active           = 1;
        lastNonce[slot]              = 0;
        lastPostTick[slot]           = 0;

        output.slotIndex = (sint32)slot;
    _

    // ── Function: LookupUser ──────────────────────────────────────────────────

    struct LookupUser_input {
        uint8 nickname[QM_NICKNAME_LEN];
    };
    struct LookupUser_output {
        uint8  pubkey[QM_PUBKEY_LEN];
        id     owner;
        uint32 registeredTick;
        uint8  found; // 1 = found, 0 = not found
    };

    PUBLIC_FUNCTION(LookupUser)
        output.found = 0;
        sint32 slot = _findSlotByNickname(input.nickname);
        if (slot >= 0) {
            QPI::memcpy(output.pubkey, users[slot].pubkey, QM_PUBKEY_LEN);
            output.owner          = users[slot].owner;
            output.registeredTick = users[slot].registeredTick;
            output.found          = 1;
        }
    _

    // ── Function: LookupUserByOwner ───────────────────────────────────────────

    struct LookupUserByOwner_input {
        id owner;
    };
    struct LookupUserByOwner_output {
        uint8  nickname[QM_NICKNAME_LEN];
        uint8  pubkey[QM_PUBKEY_LEN];
        uint8  found;
    };

    PUBLIC_FUNCTION(LookupUserByOwner)
        output.found = 0;
        sint32 slot = _findSlotByOwner(input.owner);
        if (slot >= 0) {
            QPI::memcpy(output.nickname, users[slot].nickname, QM_NICKNAME_LEN);
            QPI::memcpy(output.pubkey,   users[slot].pubkey,   QM_PUBKEY_LEN);
            output.found = 1;
        }
    _

    // ── Procedure: UpdatePubkey ───────────────────────────────────────────────

    struct UpdatePubkey_input {
        uint8 newPubkey[QM_PUBKEY_LEN];
    };
    struct UpdatePubkey_output {
        uint8 success;
    };

    PUBLIC_PROCEDURE(UpdatePubkey)
        sint32 slot = _findSlotByOwner(qpi.invocator());
        if (slot < 0) {
            output.success = 0;
            return;
        }
        QPI::memcpy(users[slot].pubkey, input.newPubkey, QM_PUBKEY_LEN);
        users[slot].lastUpdateTick = qpi.tick();
        output.success = 1;
    _

    // ── Procedure: DeactivateUser ─────────────────────────────────────────────

    struct DeactivateUser_input {
        // no fields — caller is implicitly the user
    };
    struct DeactivateUser_output {
        uint8 success;
    };

    PUBLIC_PROCEDURE(DeactivateUser)
        sint32 slot = _findSlotByOwner(qpi.invocator());
        if (slot < 0) {
            output.success = 0;
            return;
        }
        users[slot].active = 0;
        output.success = 1;
    _

    // ── Procedure: PostMessageMeta ────────────────────────────────────────────

    struct PostMessageMeta_input {
        id     receiver;
        uint8  contentHash[QM_HASH_LEN];
        uint32 nonce;
    };
    struct PostMessageMeta_output {
        uint8  success;
        uint8  errorCode; // 0=ok, 1=not registered, 2=bad nonce, 3=rate limited, 4=self-message
        uint32 logIndex;
    };

    PUBLIC_PROCEDURE(PostMessageMeta)
        id caller = qpi.invocator();
        output.success = 0;

        // Must be registered
        sint32 senderSlot = _findSlotByOwner(caller);
        if (senderSlot < 0) {
            output.errorCode = 1;
            return;
        }

        // No self-messaging (spam vector)
        if (caller == input.receiver) {
            output.errorCode = 4;
            return;
        }

        // Nonce must strictly increase
        if (input.nonce <= lastNonce[senderSlot]) {
            output.errorCode = 2;
            return;
        }

        // Rate limit: max 1 metadata post per 10 ticks (~10 seconds)
        if (lastPostTick[senderSlot] != 0 &&
            qpi.tick() - lastPostTick[senderSlot] < 10) {
            output.errorCode = 3;
            return;
        }

        lastNonce[senderSlot]    = input.nonce;
        lastPostTick[senderSlot] = qpi.tick();

        // Write to ring buffer
        uint32 idx = msgHead % QM_MSG_LOG_SIZE;
        msgLog[idx].sender   = caller;
        msgLog[idx].receiver = input.receiver;
        QPI::memcpy(msgLog[idx].contentHash, input.contentHash, QM_HASH_LEN);
        msgLog[idx].tick     = qpi.tick();
        msgLog[idx].nonce    = input.nonce;
        msgHead++;

        output.success  = 1;
        output.errorCode = 0;
        output.logIndex  = idx;
    _

    // ── Function: GetMessageMeta ──────────────────────────────────────────────

    struct GetMessageMeta_input {
        uint32 logIndex;
    };
    struct GetMessageMeta_output {
        id     sender;
        id     receiver;
        uint8  contentHash[QM_HASH_LEN];
        uint32 tick;
        uint32 nonce;
        uint8  valid; // 1 if index is within current ring buffer window
    };

    PUBLIC_FUNCTION(GetMessageMeta)
        output.valid = 0;
        if (input.logIndex >= QM_MSG_LOG_SIZE) return;
        // Valid if within the last QM_MSG_LOG_SIZE writes
        if (msgHead > QM_MSG_LOG_SIZE &&
            input.logIndex < (msgHead - QM_MSG_LOG_SIZE) % QM_MSG_LOG_SIZE) return;

        QM_MessageMeta& m = msgLog[input.logIndex];
        output.sender   = m.sender;
        output.receiver = m.receiver;
        QPI::memcpy(output.contentHash, m.contentHash, QM_HASH_LEN);
        output.tick     = m.tick;
        output.nonce    = m.nonce;
        output.valid    = 1;
    _

    // ── Registration ─────────────────────────────────────────────────────────

    REGISTER_USER_FUNCTIONS_AND_PROCEDURES
        REGISTER_FUNCTION(LookupUser)
        REGISTER_FUNCTION(LookupUserByOwner)
        REGISTER_FUNCTION(GetMessageMeta)
        REGISTER_PROCEDURE(RegisterUser)
        REGISTER_PROCEDURE(UpdatePubkey)
        REGISTER_PROCEDURE(DeactivateUser)
        REGISTER_PROCEDURE(PostMessageMeta)
    _
};
