# WebRTC Reliability Plan — CineLink MVP

## Overview

The core media pipeline architecture is already correct:
`local MP4 → <video> → captureStream() → RTCPeerConnection per viewer → viewer <video>`.
WebSocket carries control messages (PLAY / PAUSE / SEEK / SYNC_STATE / CHAT).

This plan fixes 6 bugs and 2 UX gaps that prevent the pipeline from working reliably.
No architectural changes are required — only targeted fixes to existing code.

---

## Sub-Tasks

---

### Sub-Task 1 — Fix: deduplicate `captureStream()` calls and canonicalise the host stream

**Status:** [x] done

**Intent**
`captureStream()` is called in three separate places (ROOM_JOINED handler, `attachFileToHostPlayer`, and `handlePlay`).
Each call produces a new `MediaStream` with new track IDs. Passing successive new streams to `setLocalStream`
causes `replaceTrack` to silently fail or create duplicate senders, and ultimately sends no media to viewers.

The fix is to call `captureStream()` exactly once per video element lifecycle and store the result.
All subsequent calls to `setLocalStream` must reuse that same captured stream object.

**Expected Outcomes**
- `captureStream()` is called at most once after the video element has loaded data.
- `HostWebRTCManager.setLocalStream()` always receives the same `MediaStream` reference.
- No duplicate senders appear on any `RTCPeerConnection`.

**Todo List**
1. Add a `capturedStreamRef` ref in `RoomPage` (initialised to `null`).
2. Replace all three `captureStream()` call-sites with a single helper `getCapturedStream(videoEl)`:
   - If `capturedStreamRef.current` is non-null, return it.
   - Otherwise call `videoEl.captureStream()` (or `mozCaptureStream()`), store it, and return it.
3. In `attachFileToHostPlayer`, call `getCapturedStream` inside `oncanplay` only (remove `onloadedmetadata` and `onloadeddata` duplicates — a single `oncanplay` is sufficient and fires after tracks are ready).
4. Remove the `captureStream` call inside `handlePlay` (it is redundant once `oncanplay` has run).
5. In the `ROOM_JOINED` handler, attempt `getCapturedStream` only if the video already has `readyState >= 3` (HAVE_FUTURE_DATA).

**Relevant Context**
- `src/app/r/[roomCode]/page.tsx` lines 149–155, 362–378, 436–446
- `src/lib/webrtc.ts` `setLocalStream` (line 28)

---

### Sub-Task 2 — Fix: premature offer creation when `localStream` is null

**Status:** [x] done

**Intent**
`handlePeerJoined()` unconditionally creates an SDP offer immediately, even when `localStream` is `null`
(viewer joins before host has picked a file). The offer contains no media sections.
When `setLocalStream` is later called, `replaceTrack` or `addTrack` fires and triggers renegotiation
from an inconsistent state, often resulting in a failed `setRemoteDescription` on the viewer side.

The fix is: if `localStream` is not yet available when a viewer joins, defer the offer until
`setLocalStream` is first called.

**Expected Outcomes**
- If a viewer joins before the host has loaded a file, no offer is sent until the host calls `setLocalStream`.
- If a viewer joins after the host already has a stream, the offer is sent immediately as before.
- Viewers who join early receive a stream as soon as the host presses play.

**Todo List**
1. In `HostWebRTCManager.handlePeerJoined()`, after adding tracks: check if `this.localStream` is null.
   - If null: set up the `RTCPeerConnection` (ICE handlers, state change handlers) but **do not** call `createOffer`. Instead, mark the connection as "pending offer" (e.g. a `Set<string>` called `pendingOfferPeers`).
   - If non-null: proceed with `createOffer` as today.
2. In `HostWebRTCManager.setLocalStream()`, after adding tracks to a peer connection, check if that viewer is in `pendingOfferPeers`. If so, send the initial offer now and remove the viewer from the set.
3. Remove the duplicate offer logic in `setLocalStream` for the non-pending case (it already triggers renegotiation via `replaceTrack`/`addTrack` — only explicit renegotiation should fire offers).

**Relevant Context**
- `src/lib/webrtc.ts` `handlePeerJoined` (line 72), `setLocalStream` (line 28)

---

### Sub-Task 3 — Fix: renegotiation glare in `setLocalStream`

**Status:** [x] done

**Intent**
`setLocalStream` sends a new SDP offer whenever `signalingState === 'have-local-offer'`.
This means a new offer is sent while the viewer is still processing the previous one — a "glare"
condition. The viewer's `setRemoteDescription` call receives a conflicting offer and throws,
silently dropping the stream update.

The fix is to only renegotiate from `stable` state, and queue a renegotiation if the state is
`have-local-offer` (wait for the state to settle to `stable` before sending).

**Expected Outcomes**
- No `setRemoteDescription` failures due to offer glare.
- Track updates (e.g. host loads a new file) are reliably propagated to all viewers.

**Todo List**
1. In `HostWebRTCManager`, add a `pendingRenegotiation: Set<string>` to track viewers that need renegotiation but are not in `stable` state.
2. In `setLocalStream`, change the guard from `stable || have-local-offer` to `stable` only.
   - If state is `have-local-offer`, add the viewer to `pendingRenegotiation` instead of sending an offer.
3. In `pc.onsignalingstatechange`, when state transitions to `stable`, check `pendingRenegotiation` and send deferred offers for those viewers.

**Relevant Context**
- `src/lib/webrtc.ts` `setLocalStream` lines 52–67

---

### Sub-Task 4 — Fix: viewer unmute UX — wire `isMuted` to video element's actual muted state

**Status:** [x] done

**Intent**
Browsers block unmuted autoplay. When the viewer's `<video>` is force-muted to bypass this,
the `isMuted` React state in `CinemaPlayer` is initialised to `false`, so the "Click to Unmute" 
banner never shows. The viewer's video plays silently with no indication.

The fix is to initialise `isMuted` from the video element's actual `.muted` property and
listen to the video's `volumechange` event to keep the state in sync.

**Expected Outcomes**
- When viewer video is auto-muted by the browser or by forced mute fallback, the "Click to Unmute" banner appears automatically.
- Clicking the banner unmutes and the banner disappears.
- Volume slider correctly reflects the actual volume at all times.

**Todo List**
1. In `CinemaPlayer`, add a `useEffect` that runs once after mount:
   - Read `videoRef.current?.muted` and `videoRef.current?.volume` to set initial `isMuted` and `volume` state.
   - Attach a `volumechange` event listener on the video element to sync `isMuted` and `volume` state whenever they change externally.
   - Return a cleanup that removes the listener.
2. Remove the hard-coded `muted={!isHost || isMuted}` attribute from the `<video>` element in `CinemaPlayer` — muted state should be controlled programmatically via `videoRef.current.muted`, not by the JSX attribute, to avoid React re-render conflicts with the browser's own muted state.
3. In `RoomPage`, after the forced-mute fallback play succeeds for viewers, do not change `isMuted` state directly — the `volumechange` event listener will pick it up automatically.

**Relevant Context**
- `src/components/CinemaPlayer.tsx` lines 61, 151, 158–168
- `src/app/r/[roomCode]/page.tsx` lines 176–179

---

### Sub-Task 5 — Fix: missing `hostId` field in `WSClientMessage` type

**Status:** [x] done

**Intent**
The `ROOM_JOIN` client message sends a `hostId` field for host reconnect identity, but the
`WSClientMessage` union type does not declare it. The call-site casts to `any` to suppress
the error. This is a type safety hole — if the field name ever changes, there's no compile-time
check.

**Expected Outcomes**
- `ROOM_JOIN` type includes `hostId?: string`.
- The `as any` cast on line 82 of `page.tsx` is removed.
- TypeScript compiles cleanly with no new errors.

**Todo List**
1. In `src/types/index.ts`, add `hostId?: string` to the `ROOM_JOIN` variant of `WSClientMessage`.
2. In `src/app/r/[roomCode]/page.tsx` line 74, remove the `as any` cast from the `ws.send` call.

**Relevant Context**
- `src/types/index.ts` line 61
- `src/app/r/[roomCode]/page.tsx` line 82

---

### Sub-Task 6 — Gap: viewer "waiting for stream" state

**Status:** [x] done

**Intent**
When a viewer joins before the host has loaded a file, the viewer sees a blank black screen
with no feedback. This looks like a broken app. The viewer should see a clear "Waiting for host
to start streaming" state until `ontrack` fires and `srcObject` is set.

**Expected Outcomes**
- Viewer sees a spinner / status overlay until the WebRTC stream arrives.
- Once the stream arrives and the video starts playing, the overlay disappears.
- The overlay re-appears if the stream is lost (e.g. host closes their browser).

**Todo List**
1. Add a `streamReady` boolean state to `RoomPage` (default `false` for viewers, `true` for host).
2. Set `streamReady = true` inside the `onRemoteStream` callback when `srcObject` is successfully assigned and the video begins playing.
3. Set `streamReady = false` when `HOST_DISCONNECTED` is received.
4. In `CinemaPlayer`, accept an optional `streamReady` prop (default `true` to avoid breaking host path).
5. When `!isHost && !streamReady`, render a centered overlay inside the player area:
   - Spinner icon
   - Text: "Waiting for host to start streaming…"
   - This overlays the black `<video>` element without replacing it (so the video can start as soon as `srcObject` is set).

**Relevant Context**
- `src/app/r/[roomCode]/page.tsx` lines 169–180 (onRemoteStream callback)
- `src/components/CinemaPlayer.tsx` lines 20–37 (props interface)
- `src/app/r/[roomCode]/page.tsx` lines 342–344 (HOST_DISCONNECTED handler)

---

### Sub-Task 7 — Gap: host WebRTC reconnect after page refresh

**Status:** [x] done

**Intent**
If the host refreshes the page, `HostWebRTCManager` is destroyed and all peer connections
are lost. Viewers see a frozen or blank stream with no recovery path. The host currently has no
mechanism to re-establish connections with existing viewers after a refresh.

The fix is: on the `ROOM_JOINED` message, if the host finds existing connected viewers in the
room snapshot, immediately call `handlePeerJoined` for each — which already exists in the code
but only runs if `localStream` is set (which it won't be right after refresh). Combined with
Sub-Task 2's deferred-offer mechanism, this will work: connections are set up immediately, offers
are deferred until the host re-selects their file.

In addition, the host's `loadHostFile()` (from IndexedDB) should be called eagerly on
`ROOM_JOINED` so the file is ready before the host presses play.

**Expected Outcomes**
- After host page refresh, the host re-joins the room and re-establishes peer connections with all viewers automatically.
- Viewers who were already watching receive a new stream without needing to refresh themselves.
- If the host's file was stored in IndexedDB, it is reloaded automatically.

**Todo List**
1. Confirm that Sub-Task 2's deferred-offer logic is in place first (this sub-task depends on it).
2. In the `ROOM_JOINED` handler in `RoomPage`, the existing loop `Object.values(msg.room.participants).forEach(p => hostManager.handlePeerJoined(p.id))` is already present — verify it runs even when `localStream` is null (it will, after Sub-Task 2).
3. Call `loadHostFile()` in the `ROOM_JOINED` handler for the host path. If a file is returned, call `attachFileToHostPlayer(file)` immediately (this triggers `oncanplay` → `getCapturedStream` → `setLocalStream` → deferred offers fire for all waiting viewers).
4. Display a non-blocking toast / status badge in the host player: "Reconnected — reloading your file..." while `loadHostFile` is in progress.

**Relevant Context**
- `src/app/r/[roomCode]/page.tsx` lines 141–188 (ROOM_JOINED handler)
- `src/lib/fileStore.ts` `loadHostFile` function
- Sub-Task 2 must be completed before this sub-task

---

## Implementation Order

The sub-tasks have the following dependency:

```
Sub-Task 5 (type fix)        — independent, do first
Sub-Task 1 (deduplicate captureStream)   — independent
Sub-Task 2 (defer offer when no stream) — independent
Sub-Task 3 (glare fix)       — depends on Sub-Task 2 being understood
Sub-Task 4 (viewer unmute UX)— independent
Sub-Task 6 (viewer waiting state) — independent
Sub-Task 7 (host reconnect)  — depends on Sub-Task 2
```

Recommended implementation order: 5 → 1 → 2 → 3 → 4 → 6 → 7
