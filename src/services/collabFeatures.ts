import { getAccessToken, requestApi } from "@/services/api";
import type {
  ChatMessage,
  ChatRoom,
  ChatThread,
  MediaAnnotation,
  MediaFile,
  ResourceId,
  Spreadsheet,
  SpreadsheetCell,
  TaskBoard,
  TaskCard,
  TaskColumn,
  Whiteboard,
  WhiteboardElement,
} from "@/types/collab-features";

export type CollabFeature = "whiteboard" | "chat" | "task-board" | "spreadsheet" | "media";
export type FeatureSocketStatus = "connecting" | "connected" | "disconnected";
export type FeatureEvent = Record<string, unknown> & { type?: string };

const asList = <T>(data: unknown): T[] => {
  if (Array.isArray(data)) return data as T[];
  if (!data || typeof data !== "object") return [];
  const value = data as Record<string, unknown>;
  const list = value.list ?? value.records ?? value.items ?? value.rows ?? value.messages ?? value.data;
  return Array.isArray(list) ? (list as T[]) : [];
};

const get = <T>(url: string, params?: Record<string, unknown>) => requestApi<T>({ method: "GET", url, params });
const post = <T>(url: string, data?: unknown) => requestApi<T>({ method: "POST", url, data });
const put = <T>(url: string, data?: unknown) => requestApi<T>({ method: "PUT", url, data });
const remove = <T>(url: string, params?: Record<string, unknown>) => requestApi<T>({ method: "DELETE", url, params });

export const collabApi = {
  async listWhiteboards(documentId: ResourceId) {
    return asList<Whiteboard>(await get<unknown>(`/whiteboard/document/${documentId}`));
  },
  createWhiteboard(documentId: ResourceId) {
    return post<Whiteboard>("/whiteboard", { documentId: Number(documentId), title: "协作白板", description: "文档协作绘图区域" });
  },
  getWhiteboard(id: ResourceId) { return get<Whiteboard>(`/whiteboard/${id}`); },
  addWhiteboardElement(id: ResourceId, data: Omit<WhiteboardElement, "id" | "whiteboardId">) {
    return post<WhiteboardElement>(`/whiteboard/${id}/element`, data);
  },
  updateWhiteboardElement(id: ResourceId, elementId: ResourceId, data: Partial<WhiteboardElement>) {
    return put<WhiteboardElement>(`/whiteboard/${id}/element/${elementId}`, data);
  },
  deleteWhiteboardElement(id: ResourceId, elementId: ResourceId) {
    return remove<void>(`/whiteboard/${id}/element/${elementId}`);
  },

  getOrCreateChatRoom(documentId: ResourceId) {
    return post<ChatRoom>("/chat/room", { documentId: Number(documentId), name: "文档讨论区" });
  },
  async getChatMessages(documentId: ResourceId, params: Record<string, unknown> = {}) {
    return asList<ChatMessage>(await get<unknown>(`/chat/room/${documentId}/messages`, {
      page: 1,
      limit: 50,
      contextType: "chat",
      ...params,
    }));
  },
  async getChatReplies(messageId: ResourceId) {
    return asList<ChatMessage>(await get<unknown>(`/chat/message/${messageId}/replies`));
  },
  sendChatMessage(documentId: ResourceId, data: { content: string; messageType?: string; parentId?: ResourceId; mentions?: ResourceId[] }) {
    return post<ChatMessage>(`/chat/room/${documentId}/message`, { messageType: "text", ...data });
  },
  createInlineComment(documentId: ResourceId, data: { content: string; quotedText: string; mentions?: ResourceId[] }) {
    return post<ChatMessage>(`/chat/room/${documentId}/comment`, data);
  },
  getChatThread(messageId: ResourceId) {
    return get<ChatThread>(`/chat/message/${messageId}/thread`);
  },
  toggleReaction(messageId: ResourceId, emoji: string) {
    return post<ChatMessage>(`/chat/message/${messageId}/reaction`, { emoji });
  },

  async listTaskBoards(documentId: ResourceId) {
    return asList<TaskBoard>(await get<unknown>(`/task-board/document/${documentId}`));
  },
  createTaskBoard(documentId: ResourceId) {
    return post<TaskBoard>("/task-board", { documentId: Number(documentId), title: "研发任务", description: "文档关联任务看板" });
  },
  getTaskBoard(id: ResourceId) { return get<TaskBoard>(`/task-board/${id}`); },
  createTaskCard(columnId: ResourceId, data: Partial<TaskCard> & { title: string }) {
    return post<TaskCard>(`/task-board/column/${columnId}/card`, data);
  },
  updateTaskCard(cardId: ResourceId, data: Partial<TaskCard>) { return put<TaskCard>(`/task-board/card/${cardId}`, data); },
  moveTaskCard(cardId: ResourceId, targetColumnId: ResourceId, position: number) {
    return put<TaskCard>(`/task-board/card/${cardId}/move`, { targetColumnId: Number(targetColumnId), position });
  },
  createTaskColumn(boardId: ResourceId, data: Pick<TaskColumn, "title"> & Partial<TaskColumn>) {
    return post<TaskColumn>(`/task-board/${boardId}/column`, data);
  },

  async listSpreadsheets(documentId: ResourceId) {
    return asList<Spreadsheet>(await get<unknown>(`/spreadsheet/document/${documentId}`));
  },
  createSpreadsheet(documentId: ResourceId) {
    return post<Spreadsheet>("/spreadsheet", { documentId: Number(documentId), title: "协作数据表", rowCount: 100, colCount: 26 });
  },
  getSpreadsheet(id: ResourceId) { return get<Spreadsheet>(`/spreadsheet/${id}`); },
  updateCell(id: ResourceId, cell: SpreadsheetCell) { return put<SpreadsheetCell>(`/spreadsheet/${id}/cell`, cell); },
  updateCells(id: ResourceId, cells: SpreadsheetCell[]) {
    return put<SpreadsheetCell[]>(`/spreadsheet/${id}/cells`, { cells });
  },

  async listMedia(documentId: ResourceId) {
    return asList<MediaFile>(await get<unknown>(`/media/document/${documentId}`));
  },
  registerMedia(data: Omit<MediaFile, "id" | "annotations"> & { documentId: ResourceId }) {
    return post<MediaFile>("/media/upload", { ...data, documentId: Number(data.documentId) });
  },
  getMedia(id: ResourceId) { return get<MediaFile>(`/media/${id}`); },
  createAnnotation(id: ResourceId, data: Omit<MediaAnnotation, "id" | "mediaId">) {
    return post<MediaAnnotation>(`/media/${id}/annotation`, data);
  },
  deleteAnnotation(annotationId: ResourceId) { return remove<void>(`/media/annotation/${annotationId}`); },
};

const defaultWsUrl = () => {
  if (import.meta.env.DEV) return "ws://localhost:3892/collab-features";
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/collab-features`;
};

export const createFeatureSocket = (options: {
  feature: CollabFeature;
  roomId: ResourceId;
  onEvent: (event: FeatureEvent) => void;
  onStatus?: (status: FeatureSocketStatus) => void;
  onReady?: (canWrite: boolean) => void;
}) => {
  let socket: WebSocket | null = null;
  let retry = 0;
  let timer: number | null = null;
  let closedByUser = false;
  let writable = true;

  const connect = () => {
    options.onStatus?.("connecting");
    const url = new URL(import.meta.env.VITE_COLLAB_FEATURES_WS_URL || defaultWsUrl());
    url.searchParams.set("feature", options.feature);
    url.searchParams.set("roomId", String(options.roomId));
    const token = getAccessToken();
    if (token) url.searchParams.set("accessToken", token);
    socket = new WebSocket(url);

    socket.onopen = () => {
      retry = 0;
      options.onStatus?.("connected");
    };
    socket.onmessage = (message) => {
      try {
        const event = JSON.parse(String(message.data)) as FeatureEvent;
        if (event.type === "connected") {
          // Chat is explicitly writable for every document reader in the backend permission rules.
          writable = options.feature === "chat" || event.canWrite !== false;
          options.onReady?.(writable);
        }
        options.onEvent(event);
      } catch (error) {
        console.warn("Invalid collaboration feature event", error);
      }
    };
    socket.onerror = () => options.onStatus?.("disconnected");
    socket.onclose = () => {
      options.onStatus?.("disconnected");
      if (closedByUser) return;
      const delay = Math.min(1000 * 2 ** retry, 15000);
      retry += 1;
      timer = window.setTimeout(connect, delay);
    };
  };

  connect();

  return {
    get canWrite() { return writable; },
    send(event: FeatureEvent) {
      if (!writable || socket?.readyState !== WebSocket.OPEN) return false;
      socket.send(JSON.stringify(event));
      return true;
    },
    close() {
      closedByUser = true;
      if (timer !== null) window.clearTimeout(timer);
      socket?.close();
    },
  };
};
