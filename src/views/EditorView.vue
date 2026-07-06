<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import TipTapEditor from "@/components/TipTapEditor/TipTapEditor.vue";
import {
  addCollaborator,
  getActiveSessions,
  getCollaborators,
  getDocumentList,
  removeCollaborator,
  updateCollaboratorRole,
  type CollaboratorRole,
} from "@/services/api";
import { getCurrentAccount } from "@/utils/session";
import {
  getApiErrorMessage,
  getNumericDocumentId,
  mapCollaborator,
  mapDocument,
  mapSessionName,
  roleClass,
  roleText,
  statusText,
  toInitials,
  type CollaboratorItem,
  type DocumentItem,
} from "@/utils/workspace";
import IconChevronLeft from "~icons/tabler/chevron-left";
import IconTrash from "~icons/tabler/trash";
import IconUserPlus from "~icons/tabler/user-plus";
import IconUsers from "~icons/tabler/users";
import IconX from "~icons/tabler/x";

const route = useRoute();
const router = useRouter();
const selectedDoc = ref<DocumentItem | null>(null);
const content = ref("");
const currentAccount = ref(getCurrentAccount());
const onlineCount = ref(0);
const errorMessage = ref("");
const isLoadingDocument = ref(false);
const isCollaboratorPanelOpen = ref(false);
const isLoadingCollaborators = ref(false);
const isAddingCollaborator = ref(false);
const updatingCollaboratorId = ref<number | null>(null);
const removingCollaboratorId = ref<number | null>(null);
const collaboratorMessage = ref("");
const collaboratorMessageType = ref<"success" | "error">("error");
const collaborators = ref<CollaboratorItem[]>([]);
const collaboratorForm = ref({
  userId: "",
  role: "editor" as CollaboratorRole,
});

const routeDocId = computed(() => String(route.params.id ?? ""));
const selectedDocRole = computed(() => selectedDoc.value?.role);
const selectedDocCanEdit = computed(() => selectedDocRole.value === "owner" || selectedDocRole.value === "editor");
const selectedDocCanManageCollaborators = computed(() => selectedDocRole.value === "owner");

const fallbackDocument = (id: string): DocumentItem => ({
  id,
  title: `文档 ${id}`,
  summary: "协作文档，打开后开始多人实时编辑。",
  owner: currentAccount.value,
  updatedAt: "刚刚更新",
  collaborators: [toInitials(currentAccount.value)],
  status: "editing",
  color: "bg-sky-500",
  role: "editor",
});

const syncSelectedCollaborators = (collaboratorNames: string[]) => {
  if (!selectedDoc.value) {
    return;
  }

  const initials = collaboratorNames.length ? collaboratorNames.map(toInitials) : [toInitials(selectedDoc.value.owner)];
  selectedDoc.value = {
    ...selectedDoc.value,
    collaborators: initials,
  };
};

const loadDocument = async () => {
  const docId = routeDocId.value;

  if (!docId) {
    selectedDoc.value = null;
    return;
  }

  isLoadingDocument.value = true;
  errorMessage.value = "";
  collaborators.value = [];
  content.value = "";

  try {
    const list = await getDocumentList();
    const mapped = list.map((document, index) => mapDocument(document, index, currentAccount.value));
    selectedDoc.value = mapped.find((document) => document.id === docId) ?? fallbackDocument(docId);
    await loadActiveSessions();
    await loadCollaborators(selectedDoc.value, false);
  } catch (error) {
    selectedDoc.value = fallbackDocument(docId);
    errorMessage.value = getApiErrorMessage(error, "获取文档信息失败");
  } finally {
    isLoadingDocument.value = false;
  }
};

const loadActiveSessions = async () => {
  if (!selectedDoc.value) {
    return;
  }

  try {
    const sessions = await getActiveSessions(selectedDoc.value.id);
    const activeCollaborators = sessions.map(mapSessionName).map(toInitials);
    selectedDoc.value = {
      ...selectedDoc.value,
      collaborators: activeCollaborators.length ? activeCollaborators : selectedDoc.value.collaborators,
    };
    onlineCount.value = activeCollaborators.length;
  } catch (error) {
    console.warn("获取在线协作者失败", error);
  }
};

const loadCollaborators = async (document: DocumentItem | null = selectedDoc.value, reportError = true) => {
  const documentId = getNumericDocumentId(document);

  if (!documentId) {
    if (reportError) {
      collaboratorMessage.value = "当前文档 ID 无效，无法查询协作者";
      collaboratorMessageType.value = "error";
    }
    return;
  }

  isLoadingCollaborators.value = true;
  collaboratorMessage.value = "";

  try {
    const list = await getCollaborators({ documentId });
    collaborators.value = list.map(mapCollaborator).filter((user) => user.userId > 0);
    syncSelectedCollaborators(collaborators.value.map((user) => user.name));
  } catch (error) {
    if (reportError) {
      collaboratorMessage.value = getApiErrorMessage(error, "获取协作者列表失败");
      collaboratorMessageType.value = "error";
    }
  } finally {
    isLoadingCollaborators.value = false;
  }
};

const openCollaboratorPanel = async () => {
  if (!selectedDoc.value) {
    return;
  }

  isCollaboratorPanelOpen.value = true;
  await loadCollaborators();
};

const closeCollaboratorPanel = () => {
  isCollaboratorPanelOpen.value = false;
  collaboratorMessage.value = "";
  collaboratorMessageType.value = "error";
  collaboratorForm.value.userId = "";
  collaboratorForm.value.role = "editor";
};

const submitAddCollaborator = async () => {
  if (!selectedDoc.value) {
    collaboratorMessage.value = "请先选择文档";
    collaboratorMessageType.value = "error";
    return;
  }

  const documentId = getNumericDocumentId(selectedDoc.value);
  const userId = Number(collaboratorForm.value.userId);

  if (!selectedDocCanManageCollaborators.value) {
    collaboratorMessage.value = "只有文档所有者可以添加协作者";
    collaboratorMessageType.value = "error";
    return;
  }

  if (!documentId) {
    collaboratorMessage.value = "当前文档 ID 无效，无法添加协作者";
    collaboratorMessageType.value = "error";
    return;
  }

  if (!Number.isInteger(userId) || userId <= 0) {
    collaboratorMessage.value = "请输入有效的用户 ID";
    collaboratorMessageType.value = "error";
    return;
  }

  if (collaborators.value.some((user) => user.userId === userId)) {
    collaboratorMessage.value = "该用户已经是协作者";
    collaboratorMessageType.value = "error";
    return;
  }

  isAddingCollaborator.value = true;
  collaboratorMessage.value = "";

  try {
    await addCollaborator({ documentId, userId, role: collaboratorForm.value.role });
    collaboratorForm.value.userId = "";
    collaboratorForm.value.role = "editor";
    await loadCollaborators(selectedDoc.value);
    collaboratorMessage.value = "协作者添加成功";
    collaboratorMessageType.value = "success";
  } catch (error) {
    collaboratorMessage.value = getApiErrorMessage(error, "添加协作者失败");
    collaboratorMessageType.value = "error";
  } finally {
    isAddingCollaborator.value = false;
  }
};

const submitUpdateCollaboratorRole = async (user: CollaboratorItem, role: CollaboratorRole) => {
  if (!selectedDoc.value) {
    collaboratorMessage.value = "请先选择文档";
    collaboratorMessageType.value = "error";
    return;
  }

  const documentId = getNumericDocumentId(selectedDoc.value);

  if (!selectedDocCanManageCollaborators.value) {
    collaboratorMessage.value = "只有文档所有者可以修改协作者角色";
    collaboratorMessageType.value = "error";
    return;
  }

  if (!documentId) {
    collaboratorMessage.value = "当前文档 ID 无效，无法修改协作者角色";
    collaboratorMessageType.value = "error";
    return;
  }

  if (user.role === role) {
    return;
  }

  updatingCollaboratorId.value = user.userId;
  collaboratorMessage.value = "";

  try {
    await updateCollaboratorRole({ documentId, userId: user.userId, role });
    await loadCollaborators(selectedDoc.value);
    collaboratorMessage.value = "协作者角色已更新";
    collaboratorMessageType.value = "success";
  } catch (error) {
    collaboratorMessage.value = getApiErrorMessage(error, "修改协作者角色失败");
    collaboratorMessageType.value = "error";
  } finally {
    updatingCollaboratorId.value = null;
  }
};

const submitRemoveCollaborator = async (user: CollaboratorItem) => {
  if (!selectedDoc.value) {
    collaboratorMessage.value = "请先选择文档";
    collaboratorMessageType.value = "error";
    return;
  }

  const documentId = getNumericDocumentId(selectedDoc.value);

  if (!selectedDocCanManageCollaborators.value) {
    collaboratorMessage.value = "只有文档所有者可以移除协作者";
    collaboratorMessageType.value = "error";
    return;
  }

  if (!documentId) {
    collaboratorMessage.value = "当前文档 ID 无效，无法移除协作者";
    collaboratorMessageType.value = "error";
    return;
  }

  removingCollaboratorId.value = user.userId;
  collaboratorMessage.value = "";

  try {
    await removeCollaborator({ documentId, userId: user.userId });
    await loadCollaborators(selectedDoc.value);
    collaboratorMessage.value = "协作者已移除";
    collaboratorMessageType.value = "success";
  } catch (error) {
    collaboratorMessage.value = getApiErrorMessage(error, "移除协作者失败");
    collaboratorMessageType.value = "error";
  } finally {
    removingCollaboratorId.value = null;
  }
};

const backToDocuments = async () => {
  await router.push({ name: "documents" });
};

onMounted(loadDocument);
watch(routeDocId, loadDocument);
</script>

<template>
  <main class="min-h-screen bg-[#f6f7fb] text-slate-950">
    <section v-if="isLoadingDocument" class="grid min-h-screen place-items-center bg-slate-100 px-4">
      <div class="rounded-lg border border-slate-200 bg-white px-6 py-8 text-center text-sm text-slate-500 shadow-sm">
        正在加载文档...
      </div>
    </section>

    <section v-else-if="selectedDoc" class="min-h-screen bg-slate-100">
      <header class="sticky top-0 z-30 border-b border-slate-200 bg-white px-4 py-3 md:px-6">
        <div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div class="flex min-w-0 items-center gap-3">
            <button
              type="button"
              class="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
              @click="backToDocuments"
            >
              <IconChevronLeft class="h-5 w-5" />
            </button>
            <div class="min-w-0">
              <h2 class="truncate text-lg font-semibold">{{ selectedDoc.title }}</h2>
              <p class="text-sm text-slate-500">
                {{ selectedDoc.updatedAt }} · {{ statusText[selectedDoc.status] }} · {{ roleText[selectedDoc.role] }} · 在线 {{ onlineCount }}
              </p>
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
            <button
              type="button"
              class="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
              @click="openCollaboratorPanel"
            >
              <IconUsers class="h-4 w-4" />
              {{ selectedDocCanManageCollaborators ? "共享" : "协作者" }}
            </button>
          </div>
        </div>
      </header>

      <div class="mx-auto max-w-6xl px-4 py-5 md:px-6">
        <p v-if="errorMessage" class="mb-4 rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {{ errorMessage }}
        </p>

        <TipTapEditor
          v-if="selectedDocCanEdit"
          :key="selectedDoc.id"
          v-model="content"
          :doc-id="selectedDoc.id"
          :user-name="currentAccount"
        />
        <div v-else class="rounded-lg border border-slate-200 bg-white px-6 py-10 text-center shadow-sm">
          <p class="text-base font-semibold text-slate-900">当前文档为只读权限</p>
          <p class="mt-2 text-sm text-slate-500">
            viewer 只能查看文档信息和协作者列表，不能连接写作协作 WebSocket。需要编辑请联系文档所有者调整为 editor。
          </p>
        </div>
      </div>
    </section>

    <section v-else class="grid min-h-screen place-items-center bg-slate-100 px-4">
      <div class="rounded-lg border border-slate-200 bg-white px-6 py-8 text-center shadow-sm">
        <p class="text-base font-semibold text-slate-900">未选择文档</p>
        <button
          type="button"
          class="mt-4 rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
          @click="backToDocuments"
        >
          返回文档列表
        </button>
      </div>
    </section>

    <div
      v-if="isCollaboratorPanelOpen && selectedDoc"
      class="fixed inset-0 z-50 bg-slate-950/35 px-4 py-6 backdrop-blur-sm sm:flex sm:items-start sm:justify-end"
      @click.self="closeCollaboratorPanel"
    >
      <aside class="ml-auto flex h-full w-full max-w-md flex-col rounded-lg border border-slate-200 bg-white shadow-xl">
        <header class="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div>
            <h3 class="text-lg font-semibold">协作者管理</h3>
            <p class="mt-1 text-sm text-slate-500">{{ selectedDoc.title }}</p>
          </div>
          <button
            type="button"
            class="grid h-8 w-8 shrink-0 place-items-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-900"
            title="关闭"
            @click="closeCollaboratorPanel"
          >
            <IconX class="h-5 w-5" />
          </button>
        </header>

        <div class="flex-1 overflow-y-auto px-5 py-4">
          <form v-if="selectedDocCanManageCollaborators" class="mb-5 grid gap-3 sm:grid-cols-[1fr_128px_auto]" @submit.prevent="submitAddCollaborator">
            <label class="min-w-0 flex-1">
              <span class="mb-2 block text-sm font-medium text-slate-700">用户 ID</span>
              <input
                v-model="collaboratorForm.userId"
                class="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-sky-500 focus:ring-4 focus:ring-sky-100"
                inputmode="numeric"
                placeholder="输入要添加的用户 ID"
                type="number"
                min="1"
                required
              />
            </label>
            <label>
              <span class="mb-2 block text-sm font-medium text-slate-700">角色</span>
              <select
                v-model="collaboratorForm.role"
                class="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-sky-500 focus:ring-4 focus:ring-sky-100"
              >
                <option value="editor">editor</option>
                <option value="viewer">viewer</option>
              </select>
            </label>
            <button
              type="submit"
              class="mt-7 inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
              :disabled="isAddingCollaborator"
            >
              <IconUserPlus class="h-4 w-4" />
              {{ isAddingCollaborator ? "添加中" : "添加" }}
            </button>
          </form>
          <p v-else class="mb-5 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
            当前角色只能查看协作者列表，协作者管理由文档所有者操作。
          </p>

          <p
            v-if="collaboratorMessage"
            :class="[
              'mb-4 rounded-lg px-3 py-2 text-sm',
              collaboratorMessageType === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700',
            ]"
          >
            {{ collaboratorMessage }}
          </p>

          <div class="mb-3 flex items-center justify-between">
            <p class="text-sm font-medium text-slate-700">已添加协作者</p>
            <button
              type="button"
              class="rounded-md px-2.5 py-1.5 text-sm font-medium text-sky-700 hover:bg-sky-50 disabled:cursor-not-allowed disabled:text-slate-400"
              :disabled="isLoadingCollaborators"
              @click="loadCollaborators()"
            >
              {{ isLoadingCollaborators ? "刷新中" : "刷新" }}
            </button>
          </div>

          <div v-if="isLoadingCollaborators" class="rounded-lg border border-slate-200 px-4 py-8 text-center text-sm text-slate-500">
            正在加载协作者...
          </div>

          <div v-else-if="!collaborators.length" class="rounded-lg border border-slate-200 px-4 py-8 text-center text-sm text-slate-500">
            暂无协作者
          </div>

          <ul v-else class="space-y-2">
            <li
              v-for="collaborator in collaborators"
              :key="collaborator.userId"
              class="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-3"
            >
              <div class="flex min-w-0 items-center gap-3">
                <span class="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-slate-100 text-xs font-semibold text-slate-700">
                  {{ toInitials(collaborator.name) }}
                </span>
                <div class="min-w-0">
                  <p class="truncate text-sm font-medium text-slate-900">{{ collaborator.name }}</p>
                  <p class="mt-0.5 text-xs text-slate-500">ID {{ collaborator.userId }} · {{ collaborator.role }}</p>
                </div>
              </div>
              <div class="flex shrink-0 items-center gap-2">
                <select
                  v-if="selectedDocCanManageCollaborators && collaborator.role !== 'owner'"
                  :value="collaborator.role"
                  class="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-700 outline-none focus:border-sky-500"
                  :disabled="updatingCollaboratorId === collaborator.userId"
                  @change="submitUpdateCollaboratorRole(collaborator, ($event.target as HTMLSelectElement).value as CollaboratorRole)"
                >
                  <option value="editor">editor</option>
                  <option value="viewer">viewer</option>
                </select>
                <span
                  v-else
                  :class="['rounded-full px-2.5 py-1 text-xs font-medium ring-1', roleClass[collaborator.role]]"
                >
                  {{ roleText[collaborator.role] }}
                </span>
                <button
                  v-if="selectedDocCanManageCollaborators && collaborator.role !== 'owner'"
                  type="button"
                  class="grid h-8 w-8 shrink-0 place-items-center rounded-md text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-50"
                  :disabled="removingCollaboratorId === collaborator.userId"
                  title="移除协作者"
                  @click="submitRemoveCollaborator(collaborator)"
                >
                  <IconTrash class="h-4 w-4" />
                </button>
              </div>
            </li>
          </ul>
        </div>
      </aside>
    </div>
  </main>
</template>
