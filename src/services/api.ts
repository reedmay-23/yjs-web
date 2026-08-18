import axios, { AxiosError, type AxiosRequestConfig } from "axios";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "/api";
const ACCESS_TOKEN_KEY = "yjs_docs_access_token";
const REFRESH_TOKEN_KEY = "yjs_docs_refresh_token";
const ACCESS_TOKEN_EXPIRED_CODE = 40100;
const REFRESH_TOKEN_EXPIRED_CODE = 40101;

export type AuthPayload = {
  account: string;
  password: string;
};

export type AuthTokens = {
  accessToken: string;
  refreshToken?: string;
};

export type DocumentPayload = {
  id?: number;
  title: string;
};

export type CollaboratorRole = "viewer" | "editor";

export type AddCollaboratorPayload = {
  documentId: number;
  userId: number;
  role?: CollaboratorRole;
};

export type CollaboratorPayload = {
  documentId: number;
};

export type RemoveCollaboratorPayload = {
  documentId: number;
  userId: number;
};

export type UpdateCollaboratorRolePayload = {
  documentId: number;
  userId: number;
  role: CollaboratorRole;
};

export type ApiUserProfile = {
  id?: string | number;
  userId?: string | number;
  user_id?: string | number;
  account?: string;
  username?: string;
  name?: string;
};

export type ApiUserSearchItem = ApiUserProfile;

export type ApiCollaborator = {
  id?: string | number;
  userId?: string | number;
  user_id?: string | number;
  account?: string;
  username?: string;
  name?: string;
  role?: string;
  createdAt?: string;
  createTime?: string;
  user?: ApiUserProfile;
  collaborator?: ApiUserProfile;
};

export type ApiDocument = {
  id?: string | number;
  docId?: string | number;
  documentId?: string | number;
  yjsDocId?: string | number;
  yjsDocumentId?: string | number;
  yjsStorageId?: string | number;
  storageId?: string | number;
  storageDocId?: string | number;
  title?: string;
  name?: string;
  summary?: string;
  description?: string;
  owner?: string | ApiUserProfile;
  ownerName?: string;
  creator?: string;
  createdBy?: string;
  updatedAt?: string;
  updateTime?: string;
  createdAt?: string;
  createTime?: string;
  collaborators?: string[];
  users?: Array<string | { name?: string; account?: string; username?: string }>;
  role?: string;
  status?: string;
};

export type SessionUser = {
  id?: string | number;
  userId?: string | number;
  name?: string;
  account?: string;
  username?: string;
  color?: string;
};

const apiClient = axios.create({
  baseURL: API_BASE_URL,
});

type RetriableRequestConfig = AxiosRequestConfig & { _retry?: boolean };

let refreshTokenPromise: Promise<AuthTokens> | null = null;
let authExpiredHandler: (() => void) | null = null;

export const setAuthExpiredHandler = (handler: () => void) => {
  authExpiredHandler = handler;
};

const notifyAuthExpired = () => {
  authExpiredHandler?.();
};

const getBusinessCode = (payload: unknown) => {
  if (!payload || typeof payload !== "object" || !("code" in payload)) {
    return null;
  }

  const code = (payload as { code?: unknown }).code;
  const normalizedCode = Number(code);
  return Number.isFinite(normalizedCode) ? normalizedCode : null;
};

const isAccessTokenExpired = (payload: unknown) => getBusinessCode(payload) === ACCESS_TOKEN_EXPIRED_CODE;
const isRefreshTokenExpired = (payload: unknown) => getBusinessCode(payload) === REFRESH_TOKEN_EXPIRED_CODE;

const unwrap = <T>(payload: unknown): T => {
  const value = payload as Record<string, unknown>;

  if (value && typeof value === "object") {
    if ("data" in value) {
      return unwrap<T>(value.data);
    }

    if ("result" in value) {
      return unwrap<T>(value.result);
    }
  }

  return payload as T;
};

export const getAccessToken = () => sessionStorage.getItem(ACCESS_TOKEN_KEY);
const getRefreshToken = () => sessionStorage.getItem(REFRESH_TOKEN_KEY);

export const setAuthTokens = (tokens: Partial<AuthTokens>) => {
  if (tokens.accessToken) {
    sessionStorage.setItem(ACCESS_TOKEN_KEY, tokens.accessToken);
    localStorage.removeItem(ACCESS_TOKEN_KEY);
  }

  if (tokens.refreshToken) {
    sessionStorage.setItem(REFRESH_TOKEN_KEY, tokens.refreshToken);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
  }
};

export const clearAuthTokens = () => {
  sessionStorage.removeItem(ACCESS_TOKEN_KEY);
  sessionStorage.removeItem(REFRESH_TOKEN_KEY);
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
};

export const hasAuthToken = () => Boolean(getAccessToken());

export const hasRefreshToken = () => Boolean(getRefreshToken());

const extractTokens = (payload: unknown): AuthTokens => {
  const value = unwrap<Record<string, unknown>>(payload);
  const accessToken =
    value.accessToken ?? value.access_token ?? value.token ?? value.access;
  const refreshToken = value.refreshToken ?? value.refresh_token ?? value.refresh;

  if (typeof accessToken !== "string" || !accessToken) {
    throw new Error("接口未返回 access token");
  }

  return {
    accessToken,
    refreshToken: typeof refreshToken === "string" ? refreshToken : undefined,
  };
};

export const tryExtractTokens = (payload: unknown): AuthTokens | null => {
  try {
    return extractTokens(payload);
  } catch {
    return null;
  }
};

const isAuthRequest = (config?: AxiosRequestConfig) => {
  const url = config?.url ?? "";
  return url.includes("/auth/login") || url.includes("/auth/register");
};

const isRefreshRequest = (config?: AxiosRequestConfig) => {
  const url = config?.url ?? "";
  return url.includes("/auth/refresh");
};

const requestTokenRefresh = async () => {
  const refreshToken = getRefreshToken();

  if (!refreshToken) {
    throw new Error("refresh token 不存在");
  }

  const response = await axios.post(
    `${API_BASE_URL}/auth/refresh`,
    undefined,
    {
      headers: {
        Authorization: `Bearer ${refreshToken}`,
      },
    },
  );

  if (isRefreshTokenExpired(response.data)) {
    throw new Error("refresh token 已失效");
  }

  const tokens = extractTokens(response.data);
  setAuthTokens(tokens);
  return tokens;
};

const getRefreshTokenPromise = () => {
  if (!refreshTokenPromise) {
    refreshTokenPromise = requestTokenRefresh().finally(() => {
      refreshTokenPromise = null;
    });
  }

  return refreshTokenPromise;
};

const expireAuth = () => {
  clearAuthTokens();
  notifyAuthExpired();
};

const retryWithRefreshedToken = async (config: RetriableRequestConfig) => {
  if (config._retry || isRefreshRequest(config) || !hasRefreshToken()) {
    expireAuth();
    throw new Error("登录状态已失效");
  }

  config._retry = true;

  try {
    const tokens = await getRefreshTokenPromise();
    config.headers = {
      ...config.headers,
      Authorization: `Bearer ${tokens.accessToken}`,
    };

    return apiClient(config);
  } catch (refreshError) {
    expireAuth();
    throw refreshError;
  }
};

apiClient.interceptors.request.use((config) => {
  const token = getAccessToken();

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

apiClient.interceptors.response.use(
  async (response) => {
    const config = response.config as RetriableRequestConfig;

    if (isRefreshTokenExpired(response.data)) {
      expireAuth();
      return Promise.reject(response);
    }

    if (isAccessTokenExpired(response.data) && !isAuthRequest(config)) {
      return retryWithRefreshedToken(config);
    }

    return response;
  },
  async (error: AxiosError) => {
    const config = error.config as RetriableRequestConfig | undefined;
    const payload = error.response?.data;

    if (!config || isAuthRequest(config)) {
      return Promise.reject(error);
    }

    if (isRefreshTokenExpired(payload) || isRefreshRequest(config)) {
      expireAuth();
      return Promise.reject(error);
    }

    if (isAccessTokenExpired(payload)) {
      return retryWithRefreshedToken(config);
    }

    if (error.response?.status === 401) {
      expireAuth();
    }

    return Promise.reject(error);
  },
);

export const register = async (payload: AuthPayload) => {
  const response = await apiClient.post("/auth/register", payload);
  return unwrap<unknown>(response.data);
};

export const login = async (payload: AuthPayload) => {
  const response = await apiClient.post("/auth/login", payload);
  return extractTokens(response.data);
};

export const createYjsDocument = async () => {
  const response = await apiClient.post("/yjs-storage/create");
  return unwrap<unknown>(response.data);
};

export const createDocument = async (payload: DocumentPayload) => {
  const response = await apiClient.post("/document/create", payload);
  return unwrap<ApiDocument>(response.data);
};

export const getDocumentList = async () => {
  const response = await apiClient.get("/document/getList");
  const data = unwrap<unknown>(response.data);

  if (Array.isArray(data)) {
    return data as ApiDocument[];
  }

  if (data && typeof data === "object") {
    const value = data as Record<string, unknown>;
    const list = value.list ?? value.records ?? value.items ?? value.rows;

    if (Array.isArray(list)) {
      return list as ApiDocument[];
    }
  }

  return [];
};

export const deleteDocument = async (id: string | number) => {
  const response = await apiClient.delete(`/document/delete/${id}`);
  return unwrap<unknown>(response.data);
};

export const addCollaborator = async (payload: AddCollaboratorPayload) => {
  const response = await apiClient.post("/document/collaborators/add", {
    role: "editor",
    ...payload,
  });
  return unwrap<unknown>(response.data);
};

export const getCollaborators = async (payload: CollaboratorPayload) => {
  const response = await apiClient.post("/document/collaborators/list", payload);
  const data = unwrap<unknown>(response.data);

  if (Array.isArray(data)) {
    return data as ApiCollaborator[];
  }

  if (data && typeof data === "object") {
    const value = data as Record<string, unknown>;
    const list = value.list ?? value.records ?? value.items ?? value.rows ?? value.users ?? value.collaborators;

    if (Array.isArray(list)) {
      return list as ApiCollaborator[];
    }
  }

  return [];
};

export const removeCollaborator = async (payload: RemoveCollaboratorPayload) => {
  const response = await apiClient.post("/document/collaborators/remove", payload);
  return unwrap<unknown>(response.data);
};

export const updateCollaboratorRole = async (payload: UpdateCollaboratorRolePayload) => {
  const response = await apiClient.post("/document/collaborators/update-role", payload);
  return unwrap<unknown>(response.data);
};

export const searchUsers = async (keyword: string) => {
  const response = await apiClient.get("/users/search", {
    params: { keyword },
  });
  const data = unwrap<unknown>(response.data);

  if (Array.isArray(data)) {
    return data as ApiUserSearchItem[];
  }

  if (data && typeof data === "object") {
    const value = data as Record<string, unknown>;
    const list = value.list ?? value.records ?? value.items ?? value.rows ?? value.users;

    if (Array.isArray(list)) {
      return list as ApiUserSearchItem[];
    }
  }

  return [];
};

export const getActiveSessions = async (docId: string | number) => {
  const response = await apiClient.get(`/yjs-storage/sessions/${docId}`);
  const data = unwrap<unknown>(response.data);

  if (Array.isArray(data)) {
    return data as SessionUser[];
  }

  if (data && typeof data === "object") {
    const value = data as Record<string, unknown>;
    const list = value.list ?? value.records ?? value.items ?? value.users ?? value.sessions;

    if (Array.isArray(list)) {
      return list as SessionUser[];
    }
  }

  return [];
};

/**
 * Shared authenticated request entry for the document feature modules.
 * It deliberately reuses this client's token refresh and expiry handling.
 */
export const requestApi = async <T>(config: AxiosRequestConfig): Promise<T> => {
  const response = await apiClient.request(config);
  const code = getBusinessCode(response.data);

  if (code !== null && code !== 0) {
    const payload = response.data as { message?: unknown };
    throw new Error(typeof payload.message === "string" ? payload.message : "请求失败");
  }

  return unwrap<T>(response.data);
};
