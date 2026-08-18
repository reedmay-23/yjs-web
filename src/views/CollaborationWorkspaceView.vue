<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import ChatPanel from "@/components/Collaboration/ChatPanel.vue";
import MediaPanel from "@/components/Collaboration/MediaPanel.vue";
import SpreadsheetPanel from "@/components/Collaboration/SpreadsheetPanel.vue";
import TaskBoardPanel from "@/components/Collaboration/TaskBoardPanel.vue";
import WhiteboardPanel from "@/components/Collaboration/WhiteboardPanel.vue";
import { getDocumentList } from "@/services/api";
import { getCurrentAccount } from "@/utils/session";
import { getApiErrorMessage, mapDocument, toInitials, type DocumentItem } from "@/utils/workspace";
import IconArrowLeft from "~icons/tabler/arrow-left";
import IconBrush from "~icons/tabler/brush";
import IconFileText from "~icons/tabler/file-text";
import IconLayoutKanban from "~icons/tabler/layout-kanban";
import IconMessageCircle from "~icons/tabler/message-circle";
import IconPhoto from "~icons/tabler/photo";
import IconTable from "~icons/tabler/table";

type FeatureKey = "whiteboard" | "chat" | "task-board" | "spreadsheet" | "media";

const route = useRoute();
const router = useRouter();
const document = ref<DocumentItem | null>(null);
const loading = ref(true);
const errorMessage = ref("");
const currentAccount = getCurrentAccount();
const routeDocumentId = computed(() => String(route.params.id ?? ""));
const routeFeature = computed(() => String(route.params.feature ?? "whiteboard"));
const featureKeys: FeatureKey[] = ["whiteboard", "chat", "task-board", "spreadsheet", "media"];
const activeFeature = computed<FeatureKey>(() => featureKeys.includes(routeFeature.value as FeatureKey) ? routeFeature.value as FeatureKey : "whiteboard");
const canEdit = computed(() => document.value?.role === "owner" || document.value?.role === "editor");

const features = [
  { key: "whiteboard" as const, label: "协作白板", description: "绘图与构思", icon: IconBrush, component: WhiteboardPanel },
  { key: "chat" as const, label: "实时讨论", description: "消息与评论", icon: IconMessageCircle, component: ChatPanel },
  { key: "task-board" as const, label: "任务看板", description: "任务与进度", icon: IconLayoutKanban, component: TaskBoardPanel },
  { key: "spreadsheet" as const, label: "协作表格", description: "数据与公式", icon: IconTable, component: SpreadsheetPanel },
  { key: "media" as const, label: "媒体标注", description: "音视频审阅", icon: IconPhoto, component: MediaPanel },
];
const activeConfig = computed<(typeof features)[number]>(() => features.find((item) => item.key === activeFeature.value) ?? features[0]!);

const fallbackDocument = (id: string): DocumentItem => ({
  id, yjsDocId: id, title: `文档 ${id}`, summary: "协作文档", owner: currentAccount,
  updatedAt: "刚刚更新", collaborators: [toInitials(currentAccount)], status: "editing", color: "bg-sky-500", role: "editor",
});

const loadDocument = async () => {
  loading.value = true;
  errorMessage.value = "";
  try {
    const list = await getDocumentList();
    const mapped = list.map((item, index) => mapDocument(item, index, currentAccount));
    document.value = mapped.find((item) => item.id === routeDocumentId.value) ?? fallbackDocument(routeDocumentId.value);
  } catch (error) {
    document.value = fallbackDocument(routeDocumentId.value);
    errorMessage.value = getApiErrorMessage(error, "获取文档信息失败");
  } finally { loading.value = false; }
};

const switchFeature = (key: FeatureKey) => router.replace({ name: "document-collaboration", params: { id: routeDocumentId.value, feature: key } });
const backToEditor = () => router.push({ name: "document-editor", params: { id: routeDocumentId.value } });
const backToDocuments = () => router.push({ name: "documents" });

onMounted(loadDocument);
watch(routeDocumentId, loadDocument);
</script>

<template>
  <main class="h-screen overflow-hidden bg-slate-100 text-slate-950">
    <div v-if="loading" class="grid h-full place-items-center text-sm text-slate-500">正在进入协作空间...</div>
    <div v-else-if="document" class="flex h-full min-h-0 flex-col">
      <header class="z-30 flex h-16 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 shadow-sm md:px-6">
        <div class="flex min-w-0 items-center gap-3">
          <button type="button" class="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50" title="返回文档列表" @click="backToDocuments"><IconArrowLeft class="h-5 w-5" /></button>
          <div class="min-w-0"><div class="flex items-center gap-2"><h1 class="truncate text-base font-semibold md:text-lg">{{ document.title }}</h1><span class="hidden rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-semibold text-violet-700 sm:inline">协作空间</span></div><p class="truncate text-xs text-slate-500">五类协作工具与当前文档关联</p></div>
        </div>
        <div class="flex items-center gap-3">
          <div class="hidden -space-x-2 sm:flex"><span v-for="collaborator in document.collaborators.slice(0, 4)" :key="collaborator" class="grid h-8 w-8 place-items-center rounded-full border-2 border-white bg-slate-100 text-[10px] font-bold text-slate-700">{{ collaborator }}</span></div>
          <button type="button" class="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 hover:border-sky-200 hover:bg-sky-50 hover:text-sky-700" @click="backToEditor"><IconFileText class="h-4 w-4" /><span class="hidden sm:inline">返回文档编辑</span><span class="sm:hidden">文档</span></button>
        </div>
      </header>

      <p v-if="errorMessage" class="shrink-0 bg-amber-50 px-5 py-2 text-xs text-amber-700">{{ errorMessage }}</p>
      <div class="flex min-h-0 flex-1 flex-col md:flex-row">
        <aside class="shrink-0 border-b border-slate-200 bg-white p-2 md:w-56 md:border-b-0 md:border-r md:p-3">
          <nav class="flex gap-1 overflow-x-auto md:block md:space-y-1">
            <button v-for="feature in features" :key="feature.key" type="button" :class="['flex min-w-max items-center gap-3 rounded-xl px-3 py-2.5 text-left transition md:w-full', activeFeature === feature.key ? 'bg-sky-50 text-sky-800 ring-1 ring-sky-100' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900']" @click="switchFeature(feature.key)">
              <span :class="['grid h-9 w-9 shrink-0 place-items-center rounded-lg', activeFeature === feature.key ? 'bg-sky-600 text-white shadow-sm' : 'bg-slate-100 text-slate-500']"><component :is="feature.icon" class="h-4.5 w-4.5" /></span>
              <span><span class="block text-sm font-semibold">{{ feature.label }}</span><span class="hidden text-[11px] text-slate-400 md:block">{{ feature.description }}</span></span>
            </button>
          </nav>
          <div class="mt-6 hidden rounded-xl bg-slate-900 p-4 text-white md:block"><p class="text-xs font-semibold">权限状态</p><p class="mt-1.5 text-xs leading-5 text-slate-300">{{ canEdit ? '你可以编辑并实时广播变更。' : '当前为查看权限，聊天仍可正常参与。' }}</p></div>
        </aside>
        <div class="min-h-0 min-w-0 flex-1"><component :is="activeConfig.component" :key="`${routeDocumentId}-${activeFeature}`" :document-id="routeDocumentId" :can-edit="canEdit" /></div>
      </div>
    </div>
    <div v-else class="grid h-full place-items-center"><button type="button" class="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white" @click="backToDocuments">返回文档列表</button></div>
  </main>
</template>
