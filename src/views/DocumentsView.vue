<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import {
  clearAuthTokens,
  createDocument as createDocumentApi,
  createYjsDocument,
  deleteDocument as deleteDocumentApi,
  getDocumentList,
} from "@/services/api";
import { clearCurrentAccount, getCurrentAccount } from "@/utils/session";
import {
  getApiErrorMessage,
  getStorageDocumentId,
  mapDocument,
  roleClass,
  roleText,
  statusClass,
  statusText,
  toInitials,
  type DocumentItem,
} from "@/utils/workspace";
import IconBrandGoogleDrive from "~icons/tabler/brand-google-drive";
import IconClock from "~icons/tabler/clock";
import IconDotsVertical from "~icons/tabler/dots-vertical";
import IconFileText from "~icons/tabler/file-text";
import IconFolder from "~icons/tabler/folder";
import IconLayoutDashboard from "~icons/tabler/layout-dashboard";
import IconLogout from "~icons/tabler/logout";
import IconPlus from "~icons/tabler/plus";
import IconSearch from "~icons/tabler/search";
import IconSettings from "~icons/tabler/settings";
import IconTrash from "~icons/tabler/trash";
import IconX from "~icons/tabler/x";

const router = useRouter();
const documents = ref<DocumentItem[]>([]);
const searchText = ref("");
const isLoadingDocuments = ref(false);
const isCreatingDocument = ref(false);
const isCreateDialogOpen = ref(false);
const isDeletingDocumentId = ref<string | null>(null);
const errorMessage = ref("");
const currentAccount = ref(getCurrentAccount());
const onlineCount = ref(0);
const currentAccountInitials = computed(() => toInitials(currentAccount.value));

const createDocumentForm = ref({
  title: "",
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

const loadDocuments = async () => {
  isLoadingDocuments.value = true;
  errorMessage.value = "";

  try {
    const list = await getDocumentList();
    documents.value = list.map((document, index) => mapDocument(document, index, currentAccount.value));
  } catch (error) {
    errorMessage.value = getApiErrorMessage(error, "获取文档列表失败");
    documents.value = [];
  } finally {
    isLoadingDocuments.value = false;
  }
};

const openCreateDocumentDialog = () => {
  errorMessage.value = "";
  createDocumentForm.value.title = "";
  isCreateDialogOpen.value = true;
};

const closeCreateDocumentDialog = () => {
  if (isCreatingDocument.value) {
    return;
  }

  isCreateDialogOpen.value = false;
  createDocumentForm.value.title = "";
};

const createDocument = async () => {
  const title = createDocumentForm.value.title.trim();

  if (!title) {
    errorMessage.value = "请输入文档名称";
    return;
  }

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
      title,
    });
    const newDocument = mapDocument(response, documents.value.length, currentAccount.value);

    documents.value.unshift(newDocument);
    isCreateDialogOpen.value = false;
    createDocumentForm.value.title = "";
    await router.push({ name: "document-editor", params: { id: newDocument.id } });
  } catch (error) {
    errorMessage.value = getApiErrorMessage(error, "创建文档失败");
  } finally {
    isCreatingDocument.value = false;
  }
};

const openDocument = async (document: DocumentItem) => {
  await router.push({ name: "document-editor", params: { id: document.id } });
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

const logout = async () => {
  clearAuthTokens();
  clearCurrentAccount();
  documents.value = [];
  await router.replace({ name: "login" });
};

onMounted(loadDocuments);
</script>

<template>
  <main class="min-h-screen bg-[#f6f7fb] text-slate-950">
    <section class="flex h-screen overflow-hidden bg-slate-100">
      <aside class="hidden h-screen w-64 shrink-0 border-r border-slate-200/80 bg-white/95 px-4 py-5 shadow-sm lg:flex lg:flex-col">
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
          <button class="flex h-10 w-full items-center gap-3 rounded-lg bg-sky-50 px-3 text-left text-sm font-semibold text-sky-700 ring-1 ring-sky-100">
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

        <div class="mt-auto pt-6">
          <div class="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p class="mb-3 text-xs font-medium text-slate-500">当前用户</p>
            <div class="flex min-w-0 items-center gap-3">
              <div class="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-slate-950 text-sm font-semibold text-white">
                {{ currentAccountInitials }}
              </div>
              <div class="min-w-0 flex-1">
                <p class="truncate text-sm font-semibold text-slate-950">{{ currentAccount }}</p>
                <p class="mt-0.5 text-xs text-slate-500">已登录</p>
              </div>
              <button
                type="button"
                class="grid h-8 w-8 shrink-0 place-items-center rounded-md text-slate-400 transition hover:bg-white hover:text-rose-600"
                title="退出登录"
                @click="logout"
              >
                <IconLogout class="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </aside>

      <div class="flex min-w-0 flex-1 flex-col">
        <header class="z-20 border-b border-slate-200/80 bg-white/90 px-5 py-4 shadow-sm backdrop-blur md:px-8">
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
                  class="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm outline-none transition focus:border-sky-500 focus:bg-white focus:ring-4 focus:ring-sky-100 sm:w-72"
                  placeholder="搜索文档、成员或摘要"
                  type="search"
                />
              </div>
              <button
                type="button"
                class="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-sky-600 px-4 text-sm font-semibold text-white shadow-sm shadow-sky-600/20 transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:bg-slate-400 disabled:shadow-none"
                :disabled="isCreatingDocument"
                @click="openCreateDocumentDialog"
              >
                <IconPlus class="h-4 w-4" />
                {{ isCreatingDocument ? "创建中" : "新建文档" }}
              </button>
            </div>
          </div>
        </header>

        <div class="flex-1 overflow-y-auto px-5 py-6 md:px-8">
          <p v-if="errorMessage" class="mb-4 rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {{ errorMessage }}
          </p>

          <div class="mb-6 grid gap-4 md:grid-cols-3">
            <div class="rounded-lg border border-slate-200/80 bg-white p-5 shadow-sm">
              <p class="text-sm text-slate-500">协作文档</p>
              <p class="mt-2 text-3xl font-semibold">{{ documents.length }}</p>
            </div>
            <div class="rounded-lg border border-slate-200/80 bg-white p-5 shadow-sm">
              <p class="text-sm text-slate-500">在线协作者</p>
              <p class="mt-2 text-3xl font-semibold">{{ onlineCount }}</p>
            </div>
            <div class="rounded-lg border border-slate-200/80 bg-white p-5 shadow-sm">
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
              class="group rounded-lg border border-slate-200/80 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-sky-200 hover:shadow-md hover:shadow-slate-200/80"
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

              <div class="mt-5 flex flex-wrap items-center justify-between gap-3">
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
                <span :class="['rounded-full px-2.5 py-1 text-xs font-medium ring-1', roleClass[document.role]]">
                  {{ roleText[document.role] }}
                </span>
              </div>

              <div class="mt-5 flex items-center justify-between gap-3 border-t border-slate-100 pt-4">
                <p class="inline-flex items-center gap-1.5 text-xs text-slate-500">
                  <IconClock class="h-4 w-4" />
                  {{ document.updatedAt }}
                </p>
                <button
                  type="button"
                  class="rounded-md px-3 py-1.5 text-sm font-medium text-sky-700 transition hover:bg-sky-50"
                  @click="openDocument(document)"
                >
                  {{ document.role === "viewer" ? "查看" : "打开" }}
                </button>
                <button
                  v-if="document.role === 'owner'"
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

    <div
      v-if="isCreateDialogOpen"
      class="fixed inset-0 z-50 grid place-items-center bg-slate-950/45 px-4 py-6 backdrop-blur-sm"
      @click.self="closeCreateDocumentDialog"
    >
      <form
        class="w-full max-w-md rounded-lg border border-slate-200 bg-white p-5 shadow-xl"
        @submit.prevent="createDocument"
      >
        <div class="mb-5 flex items-start justify-between gap-4">
          <div>
            <h3 class="text-lg font-semibold text-slate-950">创建文档</h3>
            <p class="mt-1 text-sm text-slate-500">先填写基础信息，确认后再创建文档。</p>
          </div>
          <button
            type="button"
            class="grid h-8 w-8 shrink-0 place-items-center rounded-md text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
            title="关闭"
            :disabled="isCreatingDocument"
            @click="closeCreateDocumentDialog"
          >
            <IconX class="h-5 w-5" />
          </button>
        </div>

        <label class="block">
          <span class="text-sm font-medium text-slate-700">文档名称</span>
          <input
            v-model="createDocumentForm.title"
            class="mt-2 h-11 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm outline-none transition focus:border-sky-500 focus:bg-white focus:ring-4 focus:ring-sky-100"
            maxlength="60"
            placeholder="请输入文档名称"
            type="text"
            autofocus
            required
          />
        </label>

        <p v-if="errorMessage" class="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {{ errorMessage }}
        </p>

        <div class="mt-6 flex justify-end gap-3">
          <button
            type="button"
            class="inline-flex h-10 items-center justify-center rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            :disabled="isCreatingDocument"
            @click="closeCreateDocumentDialog"
          >
            取消
          </button>
          <button
            type="submit"
            class="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-sky-600 px-4 text-sm font-semibold text-white shadow-sm shadow-sky-600/20 transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:bg-slate-400 disabled:shadow-none"
            :disabled="isCreatingDocument"
          >
            <IconPlus class="h-4 w-4" />
            {{ isCreatingDocument ? "创建中" : "确定创建" }}
          </button>
        </div>
      </form>
    </div>
  </main>
</template>
