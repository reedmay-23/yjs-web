import axios, { AxiosError, type AxiosRequestConfig } from "axios";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "/api";
const ACCESS_TOKEN_KEY = "yjs_docs_access_token";
const REFRESH_TOKEN_KEY = "yjs_docs_refresh_token";

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

export type ApiDocument = {
  id?: string | number;
  docId?: string | number;
  documentId?: string | number;
  title?: string;
  name?: string;
  summary?: string;
  description?: string;
  owner?: string;
  ownerName?: string;
  creator?: string;
  createdBy?: string;
  updatedAt?: string;
  updateTime?: string;
  createdAt?: string;
  createTime?: string;
  collaborators?: string[];
  users?: Array<string | { name?: string; account?: string; username?: string }>;
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

const getAccessToken = () => localStorage.getItem(ACCESS_TOKEN_KEY);
const getRefreshToken = () => localStorage.getItem(REFRESH_TOKEN_KEY);

export const setAuthTokens = (tokens: Partial<AuthTokens>) => {
  if (tokens.accessToken) {
    localStorage.setItem(ACCESS_TOKEN_KEY, tokens.accessToken);
  }

  if (tokens.refreshToken) {
    localStorage.setItem(REFRESH_TOKEN_KEY, tokens.refreshToken);
  }
};

export const clearAuthTokens = () => {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
};

export const hasAuthToken = () => Boolean(getAccessToken());

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

apiClient.interceptors.request.use((config) => {
  const token = getAccessToken();

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const config = error.config as (AxiosRequestConfig & { _retry?: boolean }) | undefined;

    if (error.response?.status !== 401 || !config || config._retry) {
      return Promise.reject(error);
    }

    const refreshToken = getRefreshToken();

    if (!refreshToken) {
      clearAuthTokens();
      return Promise.reject(error);
    }

    config._retry = true;

    try {
      const response = await axios.post(
        `${API_BASE_URL}/auth/refresh`,
        undefined,
        {
          headers: {
            Authorization: `Bearer ${refreshToken}`,
          },
        },
      );
      const tokens = extractTokens(response.data);
      setAuthTokens(tokens);
      config.headers = {
        ...config.headers,
        Authorization: `Bearer ${tokens.accessToken}`,
      };

      return apiClient(config);
    } catch (refreshError) {
      clearAuthTokens();
      return Promise.reject(refreshError);
    }
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
