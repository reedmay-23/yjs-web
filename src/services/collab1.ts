import * as Y from "yjs";
import { Awareness, applyAwarenessUpdate, encodeAwarenessUpdate } from "y-protocols/awareness";
import { readSyncMessage, writeSyncStep1, writeUpdate } from "y-protocols/sync";
import { createDecoder, readVarUint, readVarUint8Array } from "lib0/decoding";
import { createEncoder, length, toUint8Array, writeVarUint, writeVarUint8Array } from "lib0/encoding";

const MESSAGE_SYNC = 0;
const MESSAGE_AWARENESS = 1;
const MESSAGE_PRESENCE = 2;

export type CollabStatus = "connecting" | "connected" | "disconnected";

export type OnlinePresenceUser = {
  id: number;
  username?: string;
  account?: string;
};

export type OnlineUsersChangedEvent = {
  type: "onlineUsersChanged";
  docId: string;
  count: number;
  users: OnlinePresenceUser[];
};

type CreateCollab1ProviderOptions = {
  baseWsUrl: string;
  docId: string | number;
  accessToken?: string;
  enablePresence?: boolean;
  ydoc: Y.Doc;
  onStatus?: (status: CollabStatus) => void;
  onPresence?: (event: OnlineUsersChangedEvent) => void;
  onConnectionError?: (event: Event) => void;
  onClose?: (event: CloseEvent) => void;
};

export type Collab1Provider = {
  awareness: Awareness;
  ws: WebSocket;
  destroy: () => void;
};

const normalizeBaseWsUrl = (value: string) => value.replace(/\/+$/, "");

export const createCollab1Provider = ({
  baseWsUrl,
  docId,
  accessToken,
  enablePresence = false,
  ydoc,
  onStatus,
  onPresence,
  onConnectionError,
  onClose,
}: CreateCollab1ProviderOptions): Collab1Provider => {
  const awareness = new Awareness(ydoc);
  const wsUrl = new URL(`${normalizeBaseWsUrl(baseWsUrl)}/collab1`);

  wsUrl.searchParams.set("docId", String(docId));

  if (accessToken) {
    wsUrl.searchParams.set("accessToken", accessToken);
  }

  if (enablePresence) {
    wsUrl.searchParams.set("presence", "1");
  }

  const ws = new WebSocket(wsUrl);
  ws.binaryType = "arraybuffer";
  onStatus?.("connecting");

  const send = (message: Uint8Array) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(message);
    }
  };

  const sendSyncStep1 = () => {
    const encoder = createEncoder();
    writeVarUint(encoder, MESSAGE_SYNC);
    writeSyncStep1(encoder, ydoc);
    send(toUint8Array(encoder));
  };

  const sendAwareness = (clientIds: number[]) => {
    if (!clientIds.length) {
      return;
    }

    const encoder = createEncoder();
    writeVarUint(encoder, MESSAGE_AWARENESS);
    writeVarUint8Array(encoder, encodeAwarenessUpdate(awareness, clientIds));
    send(toUint8Array(encoder));
  };

  const handleDocUpdate = (update: Uint8Array, origin: unknown) => {
    // console.log('监听yjs 变更', update, origin)
    if (origin === ws) {
      return;
    }

    const encoder = createEncoder();
    writeVarUint(encoder, MESSAGE_SYNC);
    writeUpdate(encoder, update);
    send(toUint8Array(encoder));
  };

  const handleAwarenessUpdate = (
    { added, updated, removed }: { added: number[]; updated: number[]; removed: number[] },
    origin: unknown,
  ) => {
    if (origin === ws) {
      return;
    }

    sendAwareness([...added, ...updated, ...removed]);
  };

  const handlePresenceMessage = (decoder: ReturnType<typeof createDecoder>) => {
    const jsonBytes = readVarUint8Array(decoder);
    const payload = JSON.parse(new TextDecoder().decode(jsonBytes)) as Partial<OnlineUsersChangedEvent>;

    if (
      payload.type === "onlineUsersChanged" &&
      typeof payload.docId === "string" &&
      typeof payload.count === "number" &&
      Array.isArray(payload.users)
    ) {
      onPresence?.({
        type: payload.type,
        docId: payload.docId,
        count: payload.count,
        users: payload.users,
      });
    }
  };

  ws.onopen = () => {
    onStatus?.("connected");
    sendSyncStep1();

    if (awareness.getLocalState()) {
      sendAwareness([ydoc.clientID]);
    }
  };

  ws.onmessage = (event) => {
    const data = new Uint8Array(event.data);
    const decoder = createDecoder(data);
    const encoder = createEncoder();
    const messageType = readVarUint(decoder);
    // console.log('websocket 数据', decoder, data)

    if (messageType === MESSAGE_SYNC) {
      writeVarUint(encoder, MESSAGE_SYNC);
      readSyncMessage(decoder, encoder, ydoc, ws);

      if (length(encoder) > 1) {
        send(toUint8Array(encoder));
      }

      return;
    }

    if (messageType === MESSAGE_AWARENESS) {
      applyAwarenessUpdate(awareness, readVarUint8Array(decoder), ws);
      return;
    }

    if (messageType === MESSAGE_PRESENCE) {
      handlePresenceMessage(decoder);
      return;
    }

    console.warn("Unsupported collab message type:", messageType);
  };

  ws.onerror = (event) => {
    onConnectionError?.(event);
  };

  ws.onclose = (event) => {
    onStatus?.("disconnected");
    onClose?.(event);
  };

  ydoc.on("update", handleDocUpdate);
  awareness.on("update", handleAwarenessUpdate);

  const destroy = () => {
    const localClientId = ydoc.clientID;

    awareness.setLocalState(null);
    sendAwareness([localClientId]);
    awareness.off("update", handleAwarenessUpdate);
    ydoc.off("update", handleDocUpdate);
    awareness.destroy();

    if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
      ws.close();
    }
  };

  return {
    awareness,
    ws,
    destroy,
  };
};
