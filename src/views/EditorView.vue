<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import CollaboratorPanel from "@/components/Editor/CollaboratorPanel.vue";
import EditorHeader from "@/components/Editor/EditorHeader.vue";
import TipTapEditor from "@/components/TipTapEditor/TipTapEditor.vue";
import { getActiveSessions, getDocumentList } from "@/services/api";
import type { OnlineUsersChangedEvent } from "@/services/collab1";
import { getCurrentAccount } from "@/utils/session";
import {
  getApiErrorMessage,
  mapDocument,
  mapSessionName,
  toInitials,
  type DocumentItem,
} from "@/utils/workspace";

const route = useRoute();
const router = useRouter();
const selectedDoc = ref<DocumentItem | null>(null);
const content = ref("");
const currentAccount = ref(getCurrentAccount());
const onlineCount = ref(0);
const errorMessage = ref("");
const isLoadingDocument = ref(false);
const isCollaboratorPanelOpen = ref(false);

const routeDocId = computed(() => String(route.params.id ?? ""));
const selectedDocRole = computed(() => selectedDoc.value?.role);
const selectedDocCanEdit = computed(() => selectedDocRole.value === "owner" || selectedDocRole.value === "editor");
const selectedDocCanManageCollaborators = computed(() => selectedDocRole.value === "owner");

const fallbackDocument = (id: string): DocumentItem => ({
  id,
  yjsDocId: id,
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

// The header avatars represent active users when presence is available; otherwise they keep the document list fallback.
const updateOnlineUsers = (users: Array<{ user?: unknown } | Record<string, unknown>>, count = users.length) => {
  if (!selectedDoc.value) {
    return;
  }

  const activeCollaborators = users.map((user) => mapSessionName(user as never)).map(toInitials);
  selectedDoc.value = {
    ...selectedDoc.value,
    collaborators: activeCollaborators.length ? activeCollaborators : selectedDoc.value.collaborators,
  };
  onlineCount.value = count;
};

const loadActiveSessions = async () => {
  if (!selectedDoc.value) {
    return;
  }

  try {
    const sessions = await getActiveSessions(selectedDoc.value.yjsDocId);
    updateOnlineUsers(sessions, sessions.length);
  } catch (error) {
    console.warn("获取在线协作者失败", error);
  }
};

const handleOnlineUsersChanged = (event: OnlineUsersChangedEvent) => {
  if (!selectedDoc.value || (event.docId !== selectedDoc.value.yjsDocId && event.docId !== selectedDoc.value.id)) {
    return;
  }

  updateOnlineUsers(event.users, event.count);
};

const loadDocument = async () => {
  const docId = routeDocId.value;

  if (!docId) {
    selectedDoc.value = null;
    return;
  }

  isLoadingDocument.value = true;
  errorMessage.value = "";
  content.value = "";

  try {
    const list = await getDocumentList();
    const mapped = list.map((document, index) => mapDocument(document, index, currentAccount.value));
    selectedDoc.value = mapped.find((document) => document.id === docId) ?? fallbackDocument(docId);
    await loadActiveSessions();
  } catch (error) {
    selectedDoc.value = fallbackDocument(docId);
    errorMessage.value = getApiErrorMessage(error, "获取文档信息失败");
  } finally {
    isLoadingDocument.value = false;
  }
};

const openCollaboratorPanel = () => {
  if (selectedDoc.value) {
    isCollaboratorPanelOpen.value = true;
  }
};

const closeCollaboratorPanel = () => {
  isCollaboratorPanelOpen.value = false;
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
      <EditorHeader
        :document="selectedDoc"
        :can-manage-collaborators="selectedDocCanManageCollaborators"
        :online-count="onlineCount"
        @back="backToDocuments"
        @open-collaborators="openCollaboratorPanel"
      />

      <div class="mx-auto max-w-6xl px-4 py-5 md:px-6">
        <p v-if="errorMessage" class="mb-4 rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {{ errorMessage }}
        </p>

        <TipTapEditor
          v-if="selectedDocCanEdit"
          :key="selectedDoc.id"
          v-model="content"
          :doc-id="selectedDoc.yjsDocId"
          :user-name="currentAccount"
          @collab-connected="loadActiveSessions"
          @online-users-changed="handleOnlineUsersChanged"
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

    <CollaboratorPanel
      v-if="isCollaboratorPanelOpen && selectedDoc"
      :document="selectedDoc"
      :can-manage="selectedDocCanManageCollaborators"
      @close="closeCollaboratorPanel"
      @collaborators-change="syncSelectedCollaborators"
    />
  </main>
</template>
