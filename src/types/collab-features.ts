export type ResourceId = string | number;

export type WhiteboardElementType = "pen" | "shape" | "text" | "image" | "line" | "arrow";

export type WhiteboardElement = {
  id: ResourceId;
  whiteboardId?: ResourceId;
  elementType: WhiteboardElementType;
  properties: Record<string, unknown>;
  zIndex?: number;
};

export type Whiteboard = {
  id: ResourceId;
  documentId?: ResourceId;
  title: string;
  description?: string;
  elements?: WhiteboardElement[];
};

export type ChatReaction = {
  emoji?: string;
  count?: number;
  userId?: ResourceId;
  users?: unknown[];
};

export type ChatMessage = {
  id: ResourceId;
  roomId?: ResourceId;
  content: string;
  messageType?: "text" | "image" | "file" | "system";
  contextType?: "chat" | "inline_comment";
  quotedText?: string | null;
  parentId?: ResourceId | null;
  userId?: ResourceId;
  authorId?: ResourceId;
  account?: string;
  username?: string;
  author?: { id?: ResourceId; account?: string; username?: string; name?: string };
  user?: { id?: ResourceId; account?: string; username?: string; name?: string };
  reactions?: ChatReaction[] | Record<string, number | unknown[]>;
  createdAt?: string;
};

export type ChatThread = {
  message: ChatMessage;
  replies: ChatMessage[];
};

export type ChatRoom = {
  id: ResourceId;
  documentId?: ResourceId;
  name?: string;
  messages?: ChatMessage[];
};

export type TaskPriority = "low" | "medium" | "high" | "urgent";

export type TaskCard = {
  id: ResourceId;
  columnId?: ResourceId;
  title: string;
  description?: string;
  priority?: TaskPriority;
  dueDate?: string;
  assigneeId?: ResourceId | null;
  assignee?: { account?: string; username?: string; name?: string } | string;
  tags?: string[];
  position?: number;
};

export type TaskColumn = {
  id: ResourceId;
  boardId?: ResourceId;
  title: string;
  position?: number;
  cards?: TaskCard[];
};

export type TaskBoard = {
  id: ResourceId;
  documentId?: ResourceId;
  title: string;
  description?: string;
  columns?: TaskColumn[];
};

export type CellValidation = {
  type?: "number" | "text" | "date" | "list";
  min?: number;
  max?: number;
  options?: string[];
};

export type SpreadsheetCell = {
  id?: ResourceId;
  spreadsheetId?: ResourceId;
  row: number;
  col: number;
  value?: string;
  formula?: string;
  format?: Record<string, unknown>;
  validation?: CellValidation;
};

export type Spreadsheet = {
  id: ResourceId;
  documentId?: ResourceId;
  title: string;
  rowCount?: number;
  colCount?: number;
  cells?: SpreadsheetCell[];
};

export type MediaAnnotation = {
  id: ResourceId;
  mediaId?: ResourceId;
  annotationType: "comment" | "highlight" | "drawing" | "timestamp";
  content: string;
  position?: { x?: number; y?: number; width?: number; height?: number };
  startTime?: number | null;
  endTime?: number | null;
  userId?: ResourceId;
  author?: { account?: string; username?: string; name?: string };
  createdAt?: string;
};

export type MediaFile = {
  id: ResourceId;
  documentId?: ResourceId;
  fileName: string;
  fileType: "image" | "video" | "audio";
  fileSize?: number;
  filePath: string;
  mimeType?: string;
  metadata?: Record<string, unknown>;
  annotations?: MediaAnnotation[];
};
