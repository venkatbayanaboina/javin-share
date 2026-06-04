# JAVIN FileShare — Socket.IO Events Guide

This document catalogs and explains all Socket.IO real-time events used across the JAVIN FileShare client-server state machine.

---

## 1. Connection & Session Lifecycle

### `join-session` (Client → Server)
Emitted by hosts and clients immediately upon re/connecting.
*   **Payload**:
    ```json
    {
      "sessionId": "string",
      "role": "host | client",
      "peerId": "string",
      "deviceName": "string"
    }
    ```

### `session-joined` (Server → Client)
Confirms successful entry into the room.
*   **Payload**:
    ```json
    {
      "sessionId": "string",
      "role": "host | client"
    }
    ```

### `peers-updated` (Server → Client)
Broadcast to all connected peers in the room whenever a peer joins, reconnects, or disconnects.
*   **Payload**: Array of peer objects.

---

## 2. PIN Verification & Grace Redirect

### `client-has-verified` (Client → Server)
Emitted by clients after their 6-digit PIN has been verified to launch the host redirect countdown.

### `start-host-redirect-countdown` (Server → Host)
Fires on the host page to run the server-authoritative grace timer display.
*   **Payload**:
    ```json
    {
      "sessionId": "string",
      "graceEndMs": 1782634827291,
      "durationSeconds": 30
    }
    ```

### `grace-timer-cleared` (Server → Host)
Notifies the host page to immediately clear the redirect countdown UI and hide controls (e.g. after navigating).

### `host-go-now` (Host → Server)
Requests immediate navigation to the session dashboard.

### `host-extend-redirect` (Host → Server)
Requests to extend the active redirect window by 30 seconds (capped at 2 minutes).

---

## 3. Transfer Orchestration & Locking

### `request-send-lock` (Sender → Server)
Requests the exclusive active sender slot to perform a file transfer.
*   **Ack Response**: `{ ok: true }` or `{ ok: false, reason: "string" }`

### `request-to-send` (Sender → Server)
Proposes a file transfer to the room.
*   **Payload**: `{ sessionId: "string", file: { id: "string", name: "string", size: number, type: "string" }, senderId: "string" }`

### `download-ready` (Server → Receiver)
Instructs receivers to open HTTP downloads immediately.
*   **Payload**:
    ```json
    {
      "file": { "id": "string", "name": "string", "size": number, "type": "string" },
      "downloadUrl": "string",
      "stream": true
    }
    ```

### `start-upload` (Server → Sender)
Signals the sender that at least one receiver is ready and they should post the binary upload stream.

### `upload-started` (Server → Receiver)
Notifies receivers that the sender has launched the binary upload conduit.

### `sender-progress` (Sender → Server → Receivers)
Relays transfer speeds and percentages in real-time.

### `upload-complete` (Sender → Server)
Notifies the room that the binary data stream has successfully completed.

### `transfer-unlocked` (Server → Room)
Notifies all peers that the transfer lock has been released and a new send request can be initiated.

### `send-rejected` / `receiver-rejected` / `all-rejected` / `offer-timeout`
Manages failure states, timeouts, and receiver rejections to ensure lock-free progress.
