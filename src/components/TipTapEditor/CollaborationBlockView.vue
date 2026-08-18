<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { NodeViewWrapper, type NodeViewProps } from "@tiptap/vue-3";
import ChatPanel from "@/components/Collaboration/ChatPanel.vue";
import MediaPanel from "@/components/Collaboration/MediaPanel.vue";
import SpreadsheetPanel from "@/components/Collaboration/SpreadsheetPanel.vue";
import TaskBoardPanel from "@/components/Collaboration/TaskBoardPanel.vue";
import WhiteboardPanel from "@/components/Collaboration/WhiteboardPanel.vue";
import type { ResourceId } from "@/types/collab-features";
import IconChevronDown from "~icons/tabler/chevron-down";
import IconChevronUp from "~icons/tabler/chevron-up";
import IconGripVertical from "~icons/tabler/grip-vertical";
import IconMaximize from "~icons/tabler/maximize";
import IconMinimize from "~icons/tabler/minimize";
import IconTrash from "~icons/tabler/trash";

const props = defineProps<NodeViewProps>();
const collapsed = ref(false);
const fullscreen = ref(false);
const previousBodyOverflow = document.body.style.overflow;

const featureMeta = {
  whiteboard: { title: "协作白板", english: "Collaborative Whiteboard", badge: "WB", component: WhiteboardPanel },
  chat: { title: "实时讨论", english: "Realtime Chat", badge: "@", component: ChatPanel },
  "task-board": { title: "任务看板", english: "Task Board", badge: "KB", component: TaskBoardPanel },
  spreadsheet: { title: "协作表格", english: "Spreadsheet", badge: "FX", component: SpreadsheetPanel },
  media: { title: "媒体标注", english: "Media Annotation", badge: "AV", component: MediaPanel },
} as const;

type FeatureKey = keyof typeof featureMeta;
const feature = computed<FeatureKey>(() => {
  const value = String(props.node.attrs.feature ?? "whiteboard") as FeatureKey;
  return value in featureMeta ? value : "whiteboard";
});
const meta = computed(() => featureMeta[feature.value]);
const documentId = computed<ResourceId>(() => String(props.node.attrs.documentId ?? ""));
const resourceId = computed<ResourceId | undefined>(() => props.node.attrs.resourceId || undefined);

const bindResource = (id: ResourceId) => {
  if (String(resourceId.value ?? "") !== String(id)) props.updateAttributes({ resourceId: id });
};

watch(fullscreen, (value) => {
  document.body.style.overflow = value ? "hidden" : previousBodyOverflow;
});

onBeforeUnmount(() => {
  document.body.style.overflow = previousBodyOverflow;
});
</script>

<template>
  <NodeViewWrapper
    as="section"
    :class="[
      'embedded-collaboration-node not-prose my-5 overflow-hidden rounded-2xl border bg-white shadow-sm',
      selected ? 'border-sky-400 ring-4 ring-sky-100' : 'border-slate-200',
      fullscreen ? 'fixed inset-3 z-[90] m-0 flex flex-col rounded-2xl shadow-2xl' : '',
    ]"
    contenteditable="false"
    :data-feature="feature"
  >
    <header class="flex h-13 shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-3">
      <button
        type="button"
        data-drag-handle
        draggable="true"
        class="grid h-9 w-8 cursor-grab place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 active:cursor-grabbing"
        title="拖动整个区块"
      >
        <IconGripVertical class="h-5 w-5" />
      </button>
      <span class="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-slate-950 text-[10px] font-extrabold tracking-wide text-white">{{ meta.badge }}</span>
      <div class="min-w-0 flex-1">
        <p class="truncate text-sm font-semibold text-slate-900">{{ node.attrs.title || meta.title }}</p>
        <p class="truncate text-[10px] font-medium uppercase tracking-wide text-slate-400">{{ meta.english }}</p>
      </div>
      <span v-if="resourceId" class="hidden rounded-md bg-slate-100 px-2 py-1 text-[10px] text-slate-400 sm:inline">ID {{ resourceId }}</span>
      <button type="button" class="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700" :title="collapsed ? '展开' : '折叠'" @mousedown.prevent.stop @click="collapsed = !collapsed">
        <IconChevronDown v-if="collapsed" class="h-4 w-4" /><IconChevronUp v-else class="h-4 w-4" />
      </button>
      <button type="button" class="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700" :title="fullscreen ? '退出全屏' : '全屏'" @mousedown.prevent.stop @click="fullscreen = !fullscreen">
        <IconMinimize v-if="fullscreen" class="h-4 w-4" /><IconMaximize v-else class="h-4 w-4" />
      </button>
      <button type="button" class="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600" title="删除区块" @mousedown.prevent.stop @click="deleteNode"><IconTrash class="h-4 w-4" /></button>
    </header>

    <div
      v-if="!collapsed"
      contenteditable="false"
      :class="['min-h-0 overflow-hidden bg-slate-100', fullscreen ? 'flex-1' : 'h-[620px]']"
      draggable="false"
      @mousedown.stop
      @mouseup.stop
      @click.stop
      @dblclick.stop
      @pointerdown.stop
      @pointermove.stop
      @pointerup.stop
      @pointercancel.stop
      @touchstart.stop
      @touchmove.stop
      @touchend.stop
      @dragstart.stop.prevent
      @dragover.stop
      @drop.stop
      @keydown.stop
      @keyup.stop
      @beforeinput.stop
      @input.stop
      @compositionstart.stop
      @compositionupdate.stop
      @compositionend.stop
    >
      <component
        :is="meta.component"
        :document-id="documentId"
        :resource-id="resourceId"
        :can-edit="true"
        embedded
        @resource-ready="bindResource"
      />
    </div>
    <button v-else type="button" class="flex w-full items-center justify-center gap-2 bg-slate-50 px-4 py-3 text-xs font-medium text-slate-500 hover:bg-slate-100" @click="collapsed = false">
      <IconChevronDown class="h-4 w-4" />展开 {{ meta.title }}
    </button>
  </NodeViewWrapper>
</template>
