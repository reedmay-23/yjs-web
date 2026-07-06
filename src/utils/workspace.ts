import type { ApiCollaborator, ApiDocument, CollaboratorRole, SessionUser } from "@/services/api";

export type DocumentStatus = "editing" | "review" | "synced";
export type DocumentRole = "owner" | CollaboratorRole;

export interface DocumentItem {
  id: string;
  title: string;
  summary: string;
  owner: string;
  updatedAt: string;
  collaborators: string[];
  status: DocumentStatus;
  color: string;
  role: DocumentRole;
}

export interface CollaboratorItem {
  userId: number;
  name: string;
  role: DocumentRole;
  createdAt: string;
}

export const roleText: Record<DocumentRole, string> = {
  owner: "所有者",
  editor: "可编辑",
  viewer: "只读",
};

export const roleClass: Record<DocumentRole, string> = {
  owner: "bg-slate-950 text-white ring-slate-950",
  editor: "bg-sky-50 text-sky-700 ring-sky-200",
  viewer: "bg-slate-100 text-slate-600 ring-slate-200",
};

export const statusText: Record<DocumentStatus, string> = {
  editing: "协作中",
  review: "待确认",
  synced: "已同步",
};

export const statusClass: Record<DocumentStatus, string> = {
  editing: "bg-sky-100 text-sky-700 ring-sky-200",
  review: "bg-amber-100 text-amber-700 ring-amber-200",
  synced: "bg-emerald-100 text-emerald-700 ring-emerald-200",
};

export const getApiErrorMessage = (error: unknown, fallback: string) => {
  if (error && typeof error === "object" && "response" in error) {
    const response = (error as { response?: { data?: unknown } }).response;
    const data = response?.data;

    if (data && typeof data === "object" && "message" in data) {
      const message = (data as { message?: unknown }).message;
      return Array.isArray(message) ? message.join("，") : String(message);
    }
  }

  if (error instanceof Error) {
    return error.message;
  }

  return fallback;
};

export const getDocumentId = (document: ApiDocument | unknown) => {
  if (!document || typeof document !== "object") {
    return "";
  }

  const value = document as ApiDocument;
  return String(value.id ?? value.docId ?? value.documentId ?? "");
};

export const getStorageDocumentId = (payload: unknown) => {
  const id = getDocumentId(payload);
  return /^\d+$/.test(id) ? Number(id) : undefined;
};

export const getNumericDocumentId = (document: DocumentItem | null) => {
  const id = Number(document?.id);
  return Number.isFinite(id) ? id : null;
};

export const normalizeRole = (role: unknown): DocumentRole => {
  if (role === "owner" || role === "viewer" || role === "editor") {
    return role;
  }

  return "editor";
};

export const formatTime = (value?: string) => {
  if (!value) {
    return "刚刚更新";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

export const toInitials = (name: string) => name.trim().slice(0, 2).toUpperCase() || "ME";

export const mapSessionName = (user: SessionUser) => {
  return String(user.name ?? user.account ?? user.username ?? user.userId ?? user.id ?? "协作者");
};

const getCollaboratorProfile = (user: ApiCollaborator) => user.user ?? user.collaborator;

const mapCollaboratorName = (user: ApiCollaborator) => {
  const profile = getCollaboratorProfile(user);

  return String(
    user.name ??
      user.account ??
      user.username ??
      profile?.name ??
      profile?.account ??
      profile?.username ??
      user.userId ??
      user.user_id ??
      profile?.userId ??
      profile?.user_id ??
      profile?.id ??
      user.id ??
      "协作者",
  );
};

const getCollaboratorUserId = (user: ApiCollaborator) => {
  const profile = getCollaboratorProfile(user);
  const id = Number(user.userId ?? user.user_id ?? profile?.userId ?? profile?.user_id ?? profile?.id ?? user.id);
  return Number.isFinite(id) ? id : 0;
};

export const mapCollaborator = (user: ApiCollaborator): CollaboratorItem => ({
  userId: getCollaboratorUserId(user),
  name: mapCollaboratorName(user),
  role: normalizeRole(user.role),
  createdAt: formatTime(user.createdAt ?? user.createTime),
});

export const mapDocument = (document: ApiDocument, index: number, currentAccount: string): DocumentItem => {
  const id = getDocumentId(document) || String(Date.now() + index);
  const title = document.title ?? document.name ?? "未命名文档";
  const ownerProfile = document.owner;
  const owner =
    typeof ownerProfile === "object" && ownerProfile
      ? String(ownerProfile.username ?? ownerProfile.account ?? ownerProfile.name ?? ownerProfile.id ?? currentAccount)
      : String(ownerProfile ?? document.ownerName ?? document.creator ?? document.createdBy ?? currentAccount);
  const collaborators =
    document.collaborators ??
    document.users?.map((user) => (typeof user === "string" ? user : String(user.name ?? user.account ?? user.username ?? ""))).filter(Boolean);

  return {
    id,
    title,
    summary: document.summary ?? document.description ?? "协作文档，打开后开始多人实时编辑。",
    owner,
    updatedAt: formatTime(document.updatedAt ?? document.updateTime ?? document.createdAt ?? document.createTime),
    collaborators: collaborators?.length ? collaborators.map(toInitials) : [toInitials(owner)],
    status: document.status === "review" || document.status === "synced" ? document.status : "editing",
    color: ["bg-sky-500", "bg-emerald-500", "bg-amber-500", "bg-violet-500"][index % 4]!,
    role: normalizeRole(document.role),
  };
};
