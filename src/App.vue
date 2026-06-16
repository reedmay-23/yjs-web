<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import TipTapEditor from "./components/TipTapEditor/TipTapEditor.vue";
import example from "./assets/example.txt?raw";
import {
  clearAuthTokens,
  createDocument as createDocumentApi,
  createYjsDocument,
  deleteDocument as deleteDocumentApi,
  getActiveSessions,
  getDocumentList,
  hasAuthToken,
  login,
  register,
  setAuthTokens,
  tryExtractTokens,
  type ApiDocument,
  type SessionUser,
} from "./services/api";
import IconBrandGoogleDrive from "~icons/tabler/brand-google-drive";
import IconChevronLeft from "~icons/tabler/chevron-left";
import IconClock from "~icons/tabler/clock";
import IconDotsVertical from "~icons/tabler/dots-vertical";
import IconFileText from "~icons/tabler/file-text";
import IconFolder from "~icons/tabler/folder";
import IconLayoutDashboard from "~icons/tabler/layout-dashboard";
import IconLogout from "~icons/tabler/logout";
import IconMail from "~icons/tabler/mail";
import IconPlus from "~icons/tabler/plus";
import IconSearch from "~icons/tabler/search";
import IconSettings from "~icons/tabler/settings";
import IconShieldCheck from "~icons/tabler/shield-check";
import IconSparkles from "~icons/tabler/sparkles";
import IconTrash from "~icons/tabler/trash";
import IconUsers from "~icons/tabler/users";

type AuthMode = "login" | "register";
type ViewMode = "auth" | "documents" | "editor";
type DocumentStatus = "editing" | "review" | "synced";

interface DocumentItem {
  id: string;
  title: string;
  summary: string;
  owner: string;
  updatedAt: string;
  collaborators: string[];
  status: DocumentStatus;
  color: string;
}

const initialDocuments: DocumentItem[] = [
  {
    id: "81263",
    title: "产品需求评审",
    summary: "实时协作评审本周迭代范围、关键路径与接口依赖。",
    owner: "林澈",
    updatedAt: "刚刚更新",
    collaborators: ["LC", "QY", "MX"],
    status: "editing",
    color: "bg-sky-500",
  },
  {
    id: "92716",
    title: "会议纪要模板",
    summary: "同步团队会议结论、待办事项、负责人和交付时间。",
    owner: "秦远",
    updatedAt: "18 分钟前",
    collaborators: ["QY", "ZX"],
    status: "synced",
    color: "bg-emerald-500",
  },
  {
    id: "57320",
    title: "运营活动排期",
    summary: "多渠道发布计划、素材检查列表和跨团队排期表。",
    owner: "孟夏",
    updatedAt: "今天 10:12",
    collaborators: ["MX", "HY", "LC", "QY"],
    status: "review",
    color: "bg-amber-500",
  },
];

const documents = ref<DocumentItem[]>([]);

const authMode = ref<AuthMode>("login");
const viewMode = ref<ViewMode>("auth");
const searchText = ref("");
const selectedDoc = ref<DocumentItem>(initialDocuments[0]!);
const content = ref<string>(example);
const isSubmittingAuth = ref(false);
const isLoadingDocuments = ref(false);
const isCreatingDocument = ref(false);
const isDeletingDocumentId = ref<string | null>(null);
const errorMessage = ref("");
const currentAccount = ref(localStorage.getItem("yjs_docs_account") ?? "我");
const onlineCount = ref(0);

const loginForm = ref({
  account: "system",
  password: "123456",
});

const registerForm = ref({
  account: "",
  password: "",
});

const filteredDocuments = computed(() => {
  const keyword = searchText.value.trim().toLowerCase();

  if (!keyword) {
    return documents.value;
  }

  return documents.value.filter((document) => {
    return [document.title, document.summary, document.owner]
      .join(" ")
      .toLowerCase()
      .includes(keyword);
  });
});

const statusText: Record<DocumentStatus, string> = {
  editing: "协作中",
  review: "待确认",
  synced: "已同步",
};

const statusClass: Record<DocumentStatus, string> = {
  editing: "bg-sky-100 text-sky-700 ring-sky-200",
  review: "bg-amber-100 text-amber-700 ring-amber-200",
  synced: "bg-emerald-100 text-emerald-700 ring-emerald-200",
};

const getApiErrorMessage = (error: unknown, fallback: string) => {
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

const getDocumentId = (document: ApiDocument | unknown) => {
  if (!document || typeof document !== "object") {
    return "";
  }

  const value = document as ApiDocument;
  return String(value.id ?? value.docId ?? value.documentId ?? "");
};

const getStorageDocumentId = (payload: unknown) => {
  const id = getDocumentId(payload);
  return /^\d+$/.test(id) ? Number(id) : undefined;
};

const formatTime = (value?: string) => {
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

const toInitials = (name: string) => name.trim().slice(0, 2).toUpperCase() || "ME";

const mapSessionName = (user: SessionUser) => {
  return String(user.name ?? user.account ?? user.username ?? user.userId ?? user.id ?? "协作者");
};

const mapDocument = (document: ApiDocument, index: number): DocumentItem => {
  const id = getDocumentId(document) || String(Date.now() + index);
  const title = document.title ?? document.name ?? "未命名文档";
  const owner = String(document.owner ?? document.ownerName ?? document.creator ?? document.createdBy ?? currentAccount.value);
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
  };
};

const loadDocuments = async () => {
  isLoadingDocuments.value = true;
  errorMessage.value = "";

  try {
    const list = await getDocumentList();
    documents.value = list.map(mapDocument);

    if (!documents.value.length) {
      selectedDoc.value = initialDocuments[0]!;
    }
  } catch (error) {
    errorMessage.value = getApiErrorMessage(error, "获取文档列表失败");
    documents.value = initialDocuments;
  } finally {
    isLoadingDocuments.value = false;
  }
};

const submitAuth = async () => {
  isSubmittingAuth.value = true;
  errorMessage.value = "";

  const payload =
    authMode.value === "login"
      ? {
          account: loginForm.value.account.trim(),
          password: loginForm.value.password,
        }
      : {
          account: registerForm.value.account.trim(),
          password: registerForm.value.password,
        };

  try {
    if (authMode.value === "register") {
      const registerResponse = await register(payload);
      const tokens = tryExtractTokens(registerResponse) ?? (await login(payload));
      setAuthTokens(tokens);
    } else {
      setAuthTokens(await login(payload));
    }

    currentAccount.value = payload.account;
    localStorage.setItem("yjs_docs_account", payload.account);
    viewMode.value = "documents";
    await loadDocuments();
  } catch (error) {
    errorMessage.value = getApiErrorMessage(error, authMode.value === "login" ? "登录失败" : "注册失败");
  } finally {
    isSubmittingAuth.value = false;
  }
};

const switchAuthMode = (mode: AuthMode) => {
  authMode.value = mode;
};

const openDocument = async (document: DocumentItem) => {
  selectedDoc.value = document;
  viewMode.value = "editor";
  onlineCount.value = document.collaborators.length;

  try {
    const sessions = await getActiveSessions(document.id);
    const collaborators = sessions.map(mapSessionName).map(toInitials);
    selectedDoc.value = {
      ...document,
      collaborators: collaborators.length ? collaborators : document.collaborators,
    };
    onlineCount.value = collaborators.length;
  } catch (error) {
    console.warn("获取在线协作者失败", error);
  }
};

const createDocument = async () => {
  isCreatingDocument.value = true;
  errorMessage.value = "";

  try {
    let storageId: number | undefined;

    try {
      storageId = getStorageDocumentId(await createYjsDocument());
    } catch (error) {
      console.warn("创建 Yjs 文档实例失败，继续创建文档元数据", error);
    }

    const response = await createDocumentApi({
      id: storageId,
      title: "未命名文档",
    });
    const newDocument = mapDocument(response, documents.value.length);

    documents.value.unshift(newDocument);
    await openDocument(newDocument);
  } catch (error) {
    errorMessage.value = getApiErrorMessage(error, "创建文档失败");
  } finally {
    isCreatingDocument.value = false;
  }
};

const removeDocument = async (document: DocumentItem) => {
  isDeletingDocumentId.value = document.id;
  errorMessage.value = "";

  try {
    await deleteDocumentApi(document.id);
    documents.value = documents.value.filter((item) => item.id !== document.id);
  } catch (error) {
    errorMessage.value = getApiErrorMessage(error, "删除文档失败");
  } finally {
    isDeletingDocumentId.value = null;
  }
};

const logout = () => {
  clearAuthTokens();
  localStorage.removeItem("yjs_docs_account");
  viewMode.value = "auth";
  authMode.value = "login";
  documents.value = [];
};

onMounted(async () => {
  if (hasAuthToken()) {
    viewMode.value = "documents";
    await loadDocuments();
  }
});
</script>

<template>
  <main class="min-h-screen bg-[#f6f7fb] text-slate-950">
    <section
      v-if="viewMode === 'auth'"
      class="grid min-h-screen grid-cols-1 overflow-hidden lg:grid-cols-[1.05fr_0.95fr]"
    >
      <div class="relative flex min-h-[360px] flex-col justify-between bg-slate-950 p-8 text-white sm:p-10 lg:min-h-screen">
        <div class="absolute inset-0 bg-[radial-gradient(circle_at_20%_15%,rgba(20,184,166,0.34),transparent_28%),radial-gradient(circle_at_80%_20%,rgba(59,130,246,0.26),transparent_30%),linear-gradient(135deg,rgba(15,23,42,0.96),rgba(2,6,23,1))]" />
        <div class="relative z-10 flex items-center gap-3">
          <div class="grid h-10 w-10 place-items-center rounded-lg bg-white text-slate-950">
            <IconBrandGoogleDrive class="h-6 w-6" />
          </div>
          <div>
            <p class="text-lg font-semibold leading-none">Yjs Docs</p>
            <p class="mt-1 text-sm text-slate-300">在线协同编辑器</p>
          </div>
        </div>

        <div class="relative z-10 max-w-2xl py-12 lg:py-0">
          <p class="mb-5 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-sm text-cyan-100 ring-1 ring-white/15">
            <IconSparkles class="h-4 w-4" />
            多人编辑、状态同步、团队文档工作台
          </p>
          <h1 class="max-w-xl text-4xl font-semibold leading-tight tracking-normal sm:text-5xl">
            把团队文档、评论和实时光标放在一个清爽界面里。
          </h1>
          <p class="mt-5 max-w-xl text-base leading-7 text-slate-300">
            面向产品、运营、研发协作场景设计，登录后直接进入文档列表，创建或打开文档即可进入实时编辑。
          </p>
        </div>

        <div class="relative z-10 grid gap-3 sm:grid-cols-3">
          <div class="rounded-lg border border-white/10 bg-white/8 p-4">
            <IconUsers class="h-5 w-5 text-cyan-200" />
            <p class="mt-3 text-2xl font-semibold">12</p>
            <p class="mt-1 text-sm text-slate-300">在线成员</p>
          </div>
          <div class="rounded-lg border border-white/10 bg-white/8 p-4">
            <IconFileText class="h-5 w-5 text-emerald-200" />
            <p class="mt-3 text-2xl font-semibold">36</p>
            <p class="mt-1 text-sm text-slate-300">团队文档</p>
          </div>
          <div class="rounded-lg border border-white/10 bg-white/8 p-4">
            <IconShieldCheck class="h-5 w-5 text-amber-200" />
            <p class="mt-3 text-2xl font-semibold">99%</p>
            <p class="mt-1 text-sm text-slate-300">同步成功率</p>
          </div>
        </div>
      </div>

      <div class="flex items-center justify-center px-5 py-10 sm:px-8">
        <div class="w-full max-w-[440px] rounded-lg border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <div class="mb-7">
            <p class="text-sm font-medium text-slate-500">
              {{ authMode === "login" ? "欢迎回来" : "创建账号" }}
            </p>
            <h2 class="mt-2 text-3xl font-semibold tracking-normal">
              {{ authMode === "login" ? "登录工作台" : "注册团队账号" }}
            </h2>
          </div>

          <div class="mb-6 grid grid-cols-2 rounded-lg bg-slate-100 p-1">
            <button
              type="button"
              class="rounded-md px-4 py-2 text-sm font-medium transition"
              :class="authMode === 'login' ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-500 hover:text-slate-800'"
              @click="switchAuthMode('login')"
            >
              登录
            </button>
            <button
              type="button"
              class="rounded-md px-4 py-2 text-sm font-medium transition"
              :class="authMode === 'register' ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-500 hover:text-slate-800'"
              @click="switchAuthMode('register')"
            >
              注册
            </button>
          </div>

          <form class="space-y-4" @submit.prevent="submitAuth">
            <template v-if="authMode === 'login'">
              <label class="block">
                <span class="text-sm font-medium text-slate-700">账号</span>
                <div class="relative mt-2">
                  <IconMail class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    v-model="loginForm.account"
                    class="h-11 w-full rounded-lg border border-slate-200 bg-white px-9 text-sm outline-none transition focus:border-sky-500 focus:ring-4 focus:ring-sky-100"
                    placeholder="请输入账号"
                    type="text"
                    autocomplete="username"
                    required
                  />
                </div>
              </label>

              <label class="block">
                <span class="text-sm font-medium text-slate-700">密码</span>
                <input
                  v-model="loginForm.password"
                  class="mt-2 h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-sky-500 focus:ring-4 focus:ring-sky-100"
                  placeholder="请输入密码"
                  type="password"
                  autocomplete="current-password"
                  required
                />
              </label>
            </template>

            <template v-else>
              <label class="block">
                <span class="text-sm font-medium text-slate-700">账号</span>
                <div class="relative mt-2">
                  <IconMail class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    v-model="registerForm.account"
                    class="h-11 w-full rounded-lg border border-slate-200 bg-white px-9 text-sm outline-none transition focus:border-sky-500 focus:ring-4 focus:ring-sky-100"
                    placeholder="请输入账号"
                    type="text"
                    autocomplete="username"
                    required
                  />
                </div>
              </label>

              <label class="block">
                <span class="text-sm font-medium text-slate-700">密码</span>
                <input
                  v-model="registerForm.password"
                  class="mt-2 h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-sky-500 focus:ring-4 focus:ring-sky-100"
                  placeholder="请输入密码"
                  type="password"
                  autocomplete="new-password"
                  required
                />
              </label>
            </template>

            <p v-if="errorMessage" class="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {{ errorMessage }}
            </p>

            <button
              type="submit"
              class="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
              :disabled="isSubmittingAuth"
            >
              {{ isSubmittingAuth ? "处理中..." : authMode === "login" ? "登录" : "注册并进入" }}
            </button>
          </form>
        </div>
      </div>
    </section>

    <section v-else-if="viewMode === 'documents'" class="flex min-h-screen">
      <aside class="hidden w-64 shrink-0 border-r border-slate-200 bg-white px-4 py-5 lg:block">
        <div class="mb-8 flex items-center gap-3 px-2">
          <div class="grid h-10 w-10 place-items-center rounded-lg bg-slate-950 text-white">
            <IconBrandGoogleDrive class="h-6 w-6" />
          </div>
          <div>
            <p class="font-semibold leading-none">Yjs Docs</p>
            <p class="mt-1 text-xs text-slate-500">协同文档空间</p>
          </div>
        </div>

        <nav class="space-y-1">
          <button class="flex h-10 w-full items-center gap-3 rounded-lg bg-slate-100 px-3 text-left text-sm font-medium text-slate-950">
            <IconLayoutDashboard class="h-5 w-5" />
            文档首页
          </button>
          <button class="flex h-10 w-full items-center gap-3 rounded-lg px-3 text-left text-sm font-medium text-slate-500 hover:bg-slate-50 hover:text-slate-900">
            <IconFolder class="h-5 w-5" />
            团队空间
          </button>
          <button class="flex h-10 w-full items-center gap-3 rounded-lg px-3 text-left text-sm font-medium text-slate-500 hover:bg-slate-50 hover:text-slate-900">
            <IconSettings class="h-5 w-5" />
            设置
          </button>
        </nav>

        <button
          type="button"
          class="mt-8 flex h-10 w-full items-center gap-3 rounded-lg px-3 text-left text-sm font-medium text-slate-500 hover:bg-slate-50 hover:text-slate-900"
          @click="logout"
        >
          <IconLogout class="h-5 w-5" />
          退出登录
        </button>
      </aside>

      <div class="min-w-0 flex-1">
        <header class="sticky top-0 z-20 border-b border-slate-200 bg-white/95 px-5 py-4 backdrop-blur md:px-8">
          <div class="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p class="text-sm text-slate-500">工作台</p>
              <h2 class="mt-1 text-2xl font-semibold tracking-normal">文档列表</h2>
            </div>

            <div class="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div class="relative">
                <IconSearch class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  v-model="searchText"
                  class="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none transition focus:border-sky-500 focus:ring-4 focus:ring-sky-100 sm:w-72"
                  placeholder="搜索文档、成员或摘要"
                  type="search"
                />
              </div>
              <button
                type="button"
                class="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
                :disabled="isCreatingDocument"
                @click="createDocument"
              >
                <IconPlus class="h-4 w-4" />
                {{ isCreatingDocument ? "创建中" : "新建文档" }}
              </button>
            </div>
          </div>
        </header>

        <div class="px-5 py-6 md:px-8">
          <p v-if="errorMessage" class="mb-4 rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {{ errorMessage }}
          </p>

          <div class="mb-6 grid gap-4 md:grid-cols-3">
            <div class="rounded-lg border border-slate-200 bg-white p-5">
              <p class="text-sm text-slate-500">协作文档</p>
              <p class="mt-2 text-3xl font-semibold">{{ documents.length }}</p>
            </div>
            <div class="rounded-lg border border-slate-200 bg-white p-5">
              <p class="text-sm text-slate-500">在线协作者</p>
              <p class="mt-2 text-3xl font-semibold">{{ onlineCount }}</p>
            </div>
            <div class="rounded-lg border border-slate-200 bg-white p-5">
              <p class="text-sm text-slate-500">今日更新</p>
              <p class="mt-2 text-3xl font-semibold">{{ documents.filter((item) => item.updatedAt.includes('今天')).length }}</p>
            </div>
          </div>

          <div v-if="isLoadingDocuments" class="rounded-lg border border-slate-200 bg-white px-5 py-10 text-center text-sm text-slate-500">
            正在加载文档...
          </div>

          <div v-else-if="!filteredDocuments.length" class="rounded-lg border border-slate-200 bg-white px-5 py-10 text-center text-sm text-slate-500">
            暂无文档
          </div>

          <div v-else class="grid gap-4 xl:grid-cols-3">
            <article
              v-for="document in filteredDocuments"
              :key="document.id"
              class="group rounded-lg border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"
            >
              <div class="mb-5 flex items-start justify-between gap-4">
                <div class="flex min-w-0 items-center gap-3">
                  <div :class="['grid h-11 w-11 shrink-0 place-items-center rounded-lg text-white', document.color]">
                    <IconFileText class="h-6 w-6" />
                  </div>
                  <div class="min-w-0">
                    <h3 class="truncate text-base font-semibold">{{ document.title }}</h3>
                    <p class="mt-1 text-xs text-slate-500">所有者：{{ document.owner }}</p>
                  </div>
                </div>
                <button type="button" class="grid h-8 w-8 place-items-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                  <IconDotsVertical class="h-5 w-5" />
                </button>
              </div>

              <p class="min-h-12 text-sm leading-6 text-slate-600">{{ document.summary }}</p>

              <div class="mt-5 flex items-center justify-between gap-3">
                <div class="flex -space-x-2">
                  <span
                    v-for="collaborator in document.collaborators"
                    :key="collaborator"
                    class="grid h-8 w-8 place-items-center rounded-full border-2 border-white bg-slate-100 text-[11px] font-semibold text-slate-700"
                  >
                    {{ collaborator }}
                  </span>
                </div>
                <span :class="['rounded-full px-2.5 py-1 text-xs font-medium ring-1', statusClass[document.status]]">
                  {{ statusText[document.status] }}
                </span>
              </div>

              <div class="mt-5 flex items-center justify-between border-t border-slate-100 pt-4">
                <p class="inline-flex items-center gap-1.5 text-xs text-slate-500">
                  <IconClock class="h-4 w-4" />
                  {{ document.updatedAt }}
                </p>
                <button
                  type="button"
                  class="rounded-md px-3 py-1.5 text-sm font-medium text-sky-700 transition hover:bg-sky-50"
                  @click="openDocument(document)"
                >
                  打开
                </button>
                <button
                  type="button"
                  class="grid h-8 w-8 place-items-center rounded-md text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-50"
                  :disabled="isDeletingDocumentId === document.id"
                  title="删除文档"
                  @click="removeDocument(document)"
                >
                  <IconTrash class="h-4 w-4" />
                </button>
              </div>
            </article>
          </div>
        </div>
      </div>
    </section>

    <section v-else class="min-h-screen bg-slate-100">
      <header class="sticky top-0 z-30 border-b border-slate-200 bg-white px-4 py-3 md:px-6">
        <div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div class="flex min-w-0 items-center gap-3">
            <button
              type="button"
              class="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
              @click="viewMode = 'documents'"
            >
              <IconChevronLeft class="h-5 w-5" />
            </button>
            <div class="min-w-0">
              <h2 class="truncate text-lg font-semibold">{{ selectedDoc.title }}</h2>
              <p class="text-sm text-slate-500">{{ selectedDoc.updatedAt }} · {{ statusText[selectedDoc.status] }}</p>
            </div>
          </div>

          <div class="flex items-center gap-3">
            <div class="hidden -space-x-2 sm:flex">
              <span
                v-for="collaborator in selectedDoc.collaborators"
                :key="collaborator"
                class="grid h-8 w-8 place-items-center rounded-full border-2 border-white bg-slate-100 text-[11px] font-semibold text-slate-700"
              >
                {{ collaborator }}
              </span>
            </div>
            <button class="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50">
              <IconUsers class="h-4 w-4" />
              共享
            </button>
          </div>
        </div>
      </header>

      <div class="mx-auto max-w-6xl px-4 py-5 md:px-6">
        <TipTapEditor
          :key="selectedDoc.id"
          v-model="content"
          :doc-id="selectedDoc.id"
          :user-name="currentAccount"
        />
      </div>
    </section>
  </main>
</template>
