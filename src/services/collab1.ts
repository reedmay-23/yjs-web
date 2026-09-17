import * as Y from "yjs";
import { Awareness, applyAwarenessUpdate, encodeAwarenessUpdate } from "y-protocols/awareness";
import { readSyncMessage, writeSyncStep1, writeUpdate } from "y-protocols/sync";
import { createDecoder, readVarUint, readVarUint8Array } from "lib0/decoding";
import { createEncoder, length, toUint8Array, writeVarUint, writeVarUint8Array } from "lib0/encoding";

const MESSAGE_SYNC = 0;
const MESSAGE_AWARENESS = 1;
const MESSAGE_PRESENCE = 2;

/** 断线重连退避：0.5s 起指数增长，最长 8s */
const RECONNECT_BASE_DELAY_MS = 500;
const RECONNECT_MAX_DELAY_MS = 8000;
const DEFAULT_MAX_RECONNECT_ATTEMPTS = 8;

/**
 * 服务端明确拒绝的原因，重连不会有任何帮助，直接放弃。
 * 这些 reason 由 yjs.gateway.ts 的 getCloseReason() 生成。
 */
const FATAL_CLOSE_REASONS = new Set([
  "forbidden",
  "document_not_found",
  "invalid_id",
  "invalid_room",
  "missing_doc_id",
  "Missing docId parameter",
  "document_rolled_back",
  "permission_changed",
  "collaborator_removed",
]);

/**
 * 服务端主动关闭连接时使用的状态码（见 handleConnection / handleDocumentAccessChanged）：
 * 4000 缺少 docId，4403 权限被回收，4409 文档被回滚。
 * 这些都属于「重连也无法解决」的情况。
 */
const FATAL_CLOSE_CODES = new Set([4000, 4403, 4409]);

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
  /**
   * 可选附加房间名。同一篇文档可以隔离出多个互不干扰的 Yjs 房间，
   * 例如五子棋使用 room=gomoku，避免和文档正文共用一份 Y.Doc。
   */
  room?: string;
  accessToken?: string;
  /** 重连时重新读取 token，access token 过期后仍能自动恢复连接 */
  resolveAccessToken?: () => string | undefined;
  enablePresence?: boolean;
  ydoc: Y.Doc;
  onStatus?: (status: CollabStatus) => void;
  onPresence?: (event: OnlineUsersChangedEvent) => void;
  onConnectionError?: (event: Event) => void;
  onClose?: (event: CloseEvent) => void;
  /** 网络异常时的最大重连次数，致命错误不会触发重连 */
  maxReconnectAttempts?: number;
};

export type Collab1Provider = {
  awareness: Awareness;
  /** 当前 WebSocket；自动重连后指向新的连接 */
  readonly ws: WebSocket;
  destroy: () => void;
};

const normalizeBaseWsUrl = (value: string) => value.replace(/\/+$/, "");

export const createCollab1Provider = ({
  baseWsUrl,
  docId,
  room,
  accessToken,
  resolveAccessToken,
  enablePresence = false,
  ydoc,
  onStatus,
  onPresence,
  onConnectionError,
  onClose,
  maxReconnectAttempts = DEFAULT_MAX_RECONNECT_ATTEMPTS,
}: CreateCollab1ProviderOptions): Collab1Provider => {
  const awareness = new Awareness(ydoc);
  // 记录来自服务端 socket 的 update 来源，避免把自己收到的更新再回写一遍。
  // 断线重连会更换 socket 对象，所以这里是一个集合而不是单一引用。
  const remoteOrigins = new WeakSet<object>();

  let socket: WebSocket | null = null;
  let reconnectTimer: number | null = null;
  let reconnectAttempts = 0;
  let destroyed = false;
  let currentAccessToken = accessToken;

  const isRemoteOrigin = (origin: unknown) =>
    typeof origin === "object" && origin !== null && remoteOrigins.has(origin);

  const buildUrl = () => {
    const wsUrl = new URL(`${normalizeBaseWsUrl(baseWsUrl)}/collab1`);
    wsUrl.searchParams.set("docId", String(docId));

    if (room) {
      wsUrl.searchParams.set("room", room);
    }

    if (currentAccessToken) {
      wsUrl.searchParams.set("accessToken", currentAccessToken);
    }

    if (enablePresence) {
      wsUrl.searchParams.set("presence", "1");
    }

    return wsUrl;
  };

  const send = (message: Uint8Array) => {
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(message);
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
    if (isRemoteOrigin(origin)) {
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
    if (isRemoteOrigin(origin)) {
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

  const clearReconnectTimer = () => {
    if (reconnectTimer !== null) {
      window.clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  };

  const scheduleReconnect = () => {
    if (destroyed) {
      return;
    }

    if (reconnectAttempts >= maxReconnectAttempts) {
      onStatus?.("disconnected");
      return;
    }

    reconnectAttempts += 1;
    const delay = Math.min(
      RECONNECT_BASE_DELAY_MS * 2 ** (reconnectAttempts - 1),
      RECONNECT_MAX_DELAY_MS,
    );

    clearReconnectTimer();
    onStatus?.("connecting");
    reconnectTimer = window.setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, delay);
  };

  const handleRemoteClose = (event: CloseEvent) => {
    onStatus?.("disconnected");
    onClose?.(event);

    // 正常关闭（组件卸载）不需要重连
    if (event.code === 1000 || destroyed) {
      return;
    }

    if (FATAL_CLOSE_CODES.has(event.code) || FATAL_CLOSE_REASONS.has(event.reason)) {
      return;
    }

    if (event.reason === "unauthorized") {
      // access token 未变时重连毫无意义；变了说明刚刷新过，可以再试一次
      const nextToken = resolveAccessToken?.();
      if (nextToken && nextToken !== currentAccessToken) {
        currentAccessToken = nextToken;
        reconnectAttempts = 0;
      } else {
        return;
      }
    }

    scheduleReconnect();
  };

  const connect = () => {
    if (destroyed) {
      return;
    }

    const url = buildUrl();
    const ws = new WebSocket(url);
    ws.binaryType = "arraybuffer";
    // 任何来自该 socket 的 Yjs update / awareness update 都不再回写，避免回环。
    remoteOrigins.add(ws);
    socket = ws;

    onStatus?.("connecting");

    ws.onopen = () => {
      if (destroyed || socket !== ws) {
        return;
      }

      reconnectAttempts = 0;
      onStatus?.("connected");
      sendSyncStep1();

      if (awareness.getLocalState()) {
        sendAwareness([ydoc.clientID]);
      }
    };

    ws.onmessage = (event) => {
      if (socket !== ws) {
        return;
      }

      const data = new Uint8Array(event.data as ArrayBuffer);
      const decoder = createDecoder(data);
      const encoder = createEncoder();
      const messageType = readVarUint(decoder);

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
      if (socket !== ws) {
        return;
      }

      handleRemoteClose(event);
    };
  };

  ydoc.on("update", handleDocUpdate);
  awareness.on("update", handleAwarenessUpdate);

  const destroy = () => {
    destroyed = true;
    clearReconnectTimer();

    const localClientId = ydoc.clientID;

    // 先把本地 awareness 状态清空并广播，让其他客户端立刻移除本端光标
    awareness.setLocalState(null);
    sendAwareness([localClientId]);
    awareness.off("update", handleAwarenessUpdate);
    ydoc.off("update", handleDocUpdate);
    awareness.destroy();

    const ws = socket;
    socket = null;

    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
      ws.close();
    }
  };

  connect();

  return {
    awareness,
    get ws() {
      if (!socket) {
        throw new Error("collab1 provider already destroyed");
      }

      return socket;
    },
    destroy,
  };
};
