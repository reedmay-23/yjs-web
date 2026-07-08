<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { NAlert, NButton, NSelect, NSpin, type SelectOption } from "naive-ui";
import {
  addCollaborator,
  getCollaborators,
  removeCollaborator,
  searchUsers,
  updateCollaboratorRole,
  type ApiUserSearchItem,
  type CollaboratorRole,
} from "@/services/api";
import {
  getApiErrorMessage,
  getNumericDocumentId,
  mapCollaborator,
  roleClass,
  roleText,
  toInitials,
  type CollaboratorItem,
  type DocumentItem,
} from "@/utils/workspace";
import IconTrash from "~icons/tabler/trash";
import IconUserPlus from "~icons/tabler/user-plus";
import IconX from "~icons/tabler/x";

const props = defineProps<{
  document: DocumentItem;
  canManage: boolean;
}>();

const emit = defineEmits<{
  (event: "close"): void;
  (event: "collaborators-change", names: string[]): void;
}>();

const isLoadingCollaborators = ref(false);
const isAddingCollaborator = ref(false);
const updatingCollaboratorId = ref<number | null>(null);
const removingCollaboratorId = ref<number | null>(null);
const message = ref("");
const messageType = ref<"success" | "error">("error");
const collaborators = ref<CollaboratorItem[]>([]);

// Keep all add-collaborator form state local to the panel so EditorView only owns document/editor state.
const collaboratorForm = ref({
  userId: null as number | null,
  role: "editor" as CollaboratorRole,
});
const userSearchResults = ref<ApiUserSearchItem[]>([]);
const selectedUser = ref<ApiUserSearchItem | null>(null);
const isSearchingUsers = ref(false);
const userSearchRequestId = ref(0);
let userSearchTimer: ReturnType<typeof window.setTimeout> | null = null;

const roleOptions = computed<SelectOption[]>((() => [
  { label: roleText.editor, value: "editor" },
  { label: roleText.viewer, value: "viewer" },
]) as () => SelectOption[]);

const getSearchUserId = (user: ApiUserSearchItem | null) => {
  const id = Number(user?.id ?? user?.userId ?? user?.user_id);
  return Number.isFinite(id) ? id : 0;
};

const getSearchUserName = (user: ApiUserSearchItem) => {
  return String(user.name ?? user.username ?? user.account ?? user.id ?? "协作者");
};

const getSearchUserMeta = (user: ApiUserSearchItem) => {
  return [user.account, user.username].filter(Boolean).join(" / ");
};

const userSelectOptions = computed<SelectOption[]>(() =>
  userSearchResults.value.map((user) => {
    const id = getSearchUserId(user);
    const meta = getSearchUserMeta(user);

    return {
      label: `${getSearchUserName(user)} · ID ${id}${meta ? ` · ${meta}` : ""}`,
      value: id,
      user,
    };
  }),
);

const clearUserSearchTimer = () => {
  if (userSearchTimer) {
    window.clearTimeout(userSearchTimer);
    userSearchTimer = null;
  }
};

const resetUserSearch = () => {
  userSearchRequestId.value += 1;
  userSearchResults.value = [];
  selectedUser.value = null;
  collaboratorForm.value.userId = null;
  isSearchingUsers.value = false;
  clearUserSearchTimer();
};

const emitCollaboratorNames = () => {
  emit(
    "collaborators-change",
    collaborators.value.map((user) => user.name),
  );
};

const loadCollaborators = async (reportError = true) => {
  const documentId = getNumericDocumentId(props.document);

  if (!documentId) {
    if (reportError) {
      message.value = "当前文档 ID 无效，无法查询协作者";
      messageType.value = "error";
    }
    return;
  }

  isLoadingCollaborators.value = true;
  message.value = "";

  try {
    const list = await getCollaborators({ documentId });
    collaborators.value = list.map(mapCollaborator).filter((user) => user.userId > 0);
    emitCollaboratorNames();
  } catch (error) {
    if (reportError) {
      message.value = getApiErrorMessage(error, "获取协作者列表失败");
      messageType.value = "error";
    }
  } finally {
    isLoadingCollaborators.value = false;
  }
};

const runUserSearch = async (keyword: string) => {
  const normalizedKeyword = keyword.trim();
  const requestId = ++userSearchRequestId.value;

  if (!normalizedKeyword) {
    userSearchResults.value = [];
    isSearchingUsers.value = false;
    return;
  }

  isSearchingUsers.value = true;

  try {
    const list = await searchUsers(normalizedKeyword);

    if (requestId !== userSearchRequestId.value) {
      return;
    }

    userSearchResults.value = list.filter((user) => getSearchUserId(user) > 0);
  } catch (error) {
    if (requestId === userSearchRequestId.value) {
      userSearchResults.value = [];
      message.value = getApiErrorMessage(error, "搜索用户失败");
      messageType.value = "error";
    }
  } finally {
    if (requestId === userSearchRequestId.value) {
      isSearchingUsers.value = false;
    }
  }
};

const handleUserSearchInput = (keyword: string) => {
  selectedUser.value = null;
  collaboratorForm.value.userId = null;
  message.value = "";
  clearUserSearchTimer();

  userSearchTimer = window.setTimeout(() => {
    void runUserSearch(keyword);
  }, 300);
};

const handleUserSelect = (value: string | number | null) => {
  clearUserSearchTimer();
  userSearchRequestId.value += 1;
  collaboratorForm.value.userId = typeof value === "number" ? value : null;
  selectedUser.value = userSearchResults.value.find((user) => getSearchUserId(user) === value) ?? null;
  message.value = "";
};

const submitAddCollaborator = async () => {
  const documentId = getNumericDocumentId(props.document);
  const userId = Number(collaboratorForm.value.userId);

  if (!props.canManage) {
    message.value = "只有文档所有者可以添加协作者";
    messageType.value = "error";
    return;
  }

  if (!documentId) {
    message.value = "当前文档 ID 无效，无法添加协作者";
    messageType.value = "error";
    return;
  }

  if (!Number.isInteger(userId) || userId <= 0) {
    message.value = "请先搜索并选择要添加的用户";
    messageType.value = "error";
    return;
  }

  if (collaborators.value.some((user) => user.userId === userId)) {
    message.value = "该用户已经是协作者";
    messageType.value = "error";
    return;
  }

  isAddingCollaborator.value = true;
  message.value = "";

  try {
    await addCollaborator({ documentId, userId, role: collaboratorForm.value.role });
    collaboratorForm.value.role = "editor";
    resetUserSearch();
    await loadCollaborators();
    message.value = "协作者添加成功";
    messageType.value = "success";
  } catch (error) {
    message.value = getApiErrorMessage(error, "添加协作者失败");
    messageType.value = "error";
  } finally {
    isAddingCollaborator.value = false;
  }
};

const submitUpdateCollaboratorRole = async (user: CollaboratorItem, role: CollaboratorRole) => {
  const documentId = getNumericDocumentId(props.document);

  if (!props.canManage) {
    message.value = "只有文档所有者可以修改协作者角色";
    messageType.value = "error";
    return;
  }

  if (!documentId) {
    message.value = "当前文档 ID 无效，无法修改协作者角色";
    messageType.value = "error";
    return;
  }

  if (user.role === role) {
    return;
  }

  updatingCollaboratorId.value = user.userId;
  message.value = "";

  try {
    await updateCollaboratorRole({ documentId, userId: user.userId, role });
    await loadCollaborators();
    message.value = "协作者角色已更新";
    messageType.value = "success";
  } catch (error) {
    message.value = getApiErrorMessage(error, "修改协作者角色失败");
    messageType.value = "error";
  } finally {
    updatingCollaboratorId.value = null;
  }
};

const handleCollaboratorRoleChange = (user: CollaboratorItem, role: string | number | null) => {
  if (role === "editor" || role === "viewer") {
    void submitUpdateCollaboratorRole(user, role);
  }
};

const submitRemoveCollaborator = async (user: CollaboratorItem) => {
  const documentId = getNumericDocumentId(props.document);

  if (!props.canManage) {
    message.value = "只有文档所有者可以移除协作者";
    messageType.value = "error";
    return;
  }

  if (!documentId) {
    message.value = "当前文档 ID 无效，无法移除协作者";
    messageType.value = "error";
    return;
  }

  removingCollaboratorId.value = user.userId;
  message.value = "";

  try {
    await removeCollaborator({ documentId, userId: user.userId });
    await loadCollaborators();
    message.value = "协作者已移除";
    messageType.value = "success";
  } catch (error) {
    message.value = getApiErrorMessage(error, "移除协作者失败");
    messageType.value = "error";
  } finally {
    removingCollaboratorId.value = null;
  }
};

onMounted(() => {
  void loadCollaborators(false);
});

onBeforeUnmount(clearUserSearchTimer);
</script>

<template>
  <div
    class="fixed inset-0 z-50 bg-slate-950/35 px-4 py-6 backdrop-blur-sm sm:flex sm:items-start sm:justify-end"
    @click.self="emit('close')"
  >
    <aside class="ml-auto flex h-full w-full max-w-md flex-col rounded-lg border border-slate-200 bg-white shadow-xl">
      <header class="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
        <div>
          <h3 class="text-lg font-semibold">协作者管理</h3>
          <p class="mt-1 text-sm text-slate-500">{{ document.title }}</p>
        </div>
        <button
          type="button"
          class="grid h-8 w-8 shrink-0 place-items-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-900"
          title="关闭"
          @click="emit('close')"
        >
          <IconX class="h-5 w-5" />
        </button>
      </header>

      <div class="flex-1 overflow-y-auto px-5 py-4">
        <form v-if="canManage" class="mb-5 grid gap-3 sm:grid-cols-[1fr_128px_auto]" @submit.prevent="submitAddCollaborator">
          <label class="min-w-0 flex-1">
            <span class="mb-2 block text-sm font-medium text-slate-700">用户</span>
            <NSelect
              v-model:value="collaboratorForm.userId"
              clearable
              filterable
              remote
              :loading="isSearchingUsers"
              :options="userSelectOptions"
              placeholder="搜索账号或用户名"
              size="large"
              @search="handleUserSearchInput"
              @update:value="handleUserSelect"
            />
          </label>
          <label>
            <span class="mb-2 block text-sm font-medium text-slate-700">角色</span>
            <NSelect v-model:value="collaboratorForm.role" :options="roleOptions" size="large" />
          </label>
          <NButton
            attr-type="submit"
            color="#020617"
            class="mt-7"
            size="large"
            :loading="isAddingCollaborator"
            :disabled="isAddingCollaborator || !selectedUser"
          >
            <template #icon>
              <IconUserPlus class="h-4 w-4" />
            </template>
            {{ isAddingCollaborator ? "添加中" : "添加" }}
          </NButton>
        </form>
        <p v-else class="mb-5 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
          当前角色只能查看协作者列表，协作者管理由文档所有者操作。
        </p>

        <NAlert
          v-if="message"
          class="mb-4"
          :show-icon="false"
          :type="messageType"
        >
          {{ message }}
        </NAlert>

        <div class="mb-3 flex items-center justify-between">
          <p class="text-sm font-medium text-slate-700">已添加协作者</p>
          <NButton
            quaternary
            type="info"
            size="small"
            :disabled="isLoadingCollaborators"
            @click="loadCollaborators()"
          >
            {{ isLoadingCollaborators ? "刷新中" : "刷新" }}
          </NButton>
        </div>

        <div v-if="isLoadingCollaborators" class="rounded-lg border border-slate-200 px-4 py-8 text-center text-sm text-slate-500">
          <NSpin size="small" />
          <p class="mt-2">正在加载协作者...</p>
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
                <p class="mt-0.5 text-xs text-slate-500">ID {{ collaborator.userId }} · {{ roleText[collaborator.role] }}</p>
              </div>
            </div>
            <div class="flex shrink-0 items-center gap-2">
              <NSelect
                v-if="canManage && collaborator.role !== 'owner'"
                :value="collaborator.role"
                class="w-24"
                size="small"
                :options="roleOptions"
                :disabled="updatingCollaboratorId === collaborator.userId"
                @update:value="(value) => handleCollaboratorRoleChange(collaborator, value)"
              />
              <span
                v-else
                :class="['rounded-full px-2.5 py-1 text-xs font-medium ring-1', roleClass[collaborator.role]]"
              >
                {{ roleText[collaborator.role] }}
              </span>
              <NButton
                v-if="canManage && collaborator.role !== 'owner'"
                quaternary
                circle
                type="error"
                size="small"
                :disabled="removingCollaboratorId === collaborator.userId"
                title="移除协作者"
                @click="submitRemoveCollaborator(collaborator)"
              >
                <IconTrash class="h-4 w-4" />
              </NButton>
            </div>
          </li>
        </ul>
      </div>
    </aside>
  </div>
</template>
