# Gestlio — Socket.io Chat Events

Real-time chat runs over Socket.io on the same host/port as the REST API
(e.g. `http://localhost:6050`).

## Connect (JWT required)

```js
import { io } from "socket.io-client";

const socket = io("http://localhost:6050", {
  auth: { token: "<JWT access token>" }, // from /auth/signin or /auth/verify-otp
});
```

- The token identifies the user. `senderId` / `senderRole` are taken from the
  token on the server — values sent by the client are ignored for security.
- On connect the server broadcasts `users:online` to everyone.

## REST helpers (not over socket)

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/api/v1/chat/conversation` `{ receiverId }` | start/get a conversation |
| GET  | `/api/v1/chat/conversations?page&limit` | conversation inbox |
| GET  | `/api/v1/chat/:conversationId/messages?page&limit` | message history (newest first) |
| POST | `/api/v1/chat/upload` (formdata `file`) | upload an attachment → `{ fileUrl, fileName, fileSize, messageType }` |

---

## Emit (client → server)

### `user:online`
Re-announce presence (optional; presence is automatic on connect).
```json
{}
```

### `conversation:join` / `conversation:leave`
Join the room to receive live messages for a conversation.
```json
{ "conversationId": "661a..." }
```

### `message:send`
```json
{
  "conversationId": "661a...",
  "content": "Hello!",
  "messageType": "text",          // "text" | "image" | "pdf" | "file"
  "receiverRole": "cleaner",      // optional
  "tempId": "temp-123",           // optional, echoed back in message:new
  // for file messages (after POST /chat/upload):
  "fileUrl": "/uploads/profiles/photo.jpg",
  "fileName": "photo.jpg",
  "fileSize": 204800
}
```

### `message:edit`  (text only, sender only)
```json
{ "messageId": "661a...", "content": "Updated text" }
```

### `message:delete`
```json
{ "messageId": "661a...", "deleteFor": "everyone" }  // "me" | "everyone"
```
- `everyone`: sender only; message is wiped for all.
- `me`: hides the message only for the requesting user.

### `typing:start` / `typing:stop`
```json
{ "conversationId": "661a..." }
```

### `messages:read`
```json
{ "conversationId": "661a..." }
```

---

## Listen (server → client)

### `message:new`
The full saved message (with populated `sender`) plus your `tempId`.
```json
{
  "_id": "...", "conversation": "...", "sender": { "_id": "...", "name": "..." },
  "receiver": "...", "senderRole": "host", "receiverRole": "cleaner",
  "content": "Hello!", "messageType": "text",
  "fileUrl": null, "fileName": null, "fileSize": null,
  "status": "sent", "isRead": false, "isEdited": false, "isDeleted": false,
  "createdAt": "...", "tempId": "temp-123"
}
```

### `message:edited`
```json
{ "_id": "...", "content": "Updated text" }
```

### `message:deleted`
```json
{ "messageId": "...", "deleteFor": "everyone" }
```

### `notification:message`  (sent to the receiver's personal room)
```json
{ "conversationId": "...", "senderId": "...", "preview": "Hello!" }
```

### `typing:start` / `typing:stop`
```json
{ "userId": "..." }
```

### `messages:read`
```json
{ "conversationId": "...", "userId": "..." }
```

### `users:online`
```json
["userId1", "userId2"]
```

### `message:error`
```json
{ "error": "Conversation not found" }
```

---

## Typical flow

1. `POST /chat/conversation { receiverId }` → get `conversationId`.
2. `socket.emit("conversation:join", { conversationId })`.
3. Send text: `socket.emit("message:send", { conversationId, content, messageType: "text" })`.
4. Send file: `POST /chat/upload` → `socket.emit("message:send", { conversationId, messageType, fileUrl, fileName, fileSize })`.
5. Listen for `message:new`, `typing:*`, `messages:read`, `users:online`.
6. On opening a chat: `socket.emit("messages:read", { conversationId })`.
