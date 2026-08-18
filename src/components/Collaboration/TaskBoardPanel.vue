<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { collabApi, type FeatureEvent } from "@/services/collabFeatures";
import { useFeatureSocket } from "@/composables/useFeatureSocket";
import { getApiErrorMessage, toInitials } from "@/utils/workspace";
import type { ResourceId, TaskBoard, TaskCard, TaskColumn, TaskPriority } from "@/types/collab-features";
import FeatureStatus from "./FeatureStatus.vue";
import IconCalendar from "~icons/tabler/calendar";
import IconGripVertical from "~icons/tabler/grip-vertical";
import IconPlus from "~icons/tabler/plus";
import IconTag from "~icons/tabler/tag";
import IconUser from "~icons/tabler/user";
import IconX from "~icons/tabler/x";

const props = defineProps<{ documentId: ResourceId; canEdit: boolean; resourceId?: ResourceId; embedded?: boolean }>();
const emit = defineEmits<{ (event: "resource-ready", id: ResourceId): void }>();
const board = ref<TaskBoard | null>(null);
const loading = ref(true);
const errorMessage = ref("");
const draggedCard = ref<TaskCard | null>(null);
const createInColumn = ref<TaskColumn | null>(null);
const form = ref({ title: "", description: "", priority: "medium" as TaskPriority, assigneeId: "", dueDate: "", tags: "" });
const { status, canWrite, connect, send } = useFeatureSocket();
const writable = computed(() => props.canEdit && canWrite.value);
const columns = computed(() => [...(board.value?.columns ?? [])].sort((a, b) => Number(a.position ?? 0) - Number(b.position ?? 0)));
const priorityStyle: Record<TaskPriority, string> = { low: "bg-slate-100 text-slate-600", medium: "bg-sky-50 text-sky-700", high: "bg-amber-50 text-amber-700", urgent: "bg-rose-50 text-rose-700" };
const priorityText: Record<TaskPriority, string> = { low: "低", medium: "中", high: "高", urgent: "紧急" };

const cardsFor = (column: TaskColumn) => [...(column.cards ?? [])].sort((a, b) => Number(a.position ?? 0) - Number(b.position ?? 0));
const assigneeName = (card: TaskCard) => typeof card.assignee === "string" ? card.assignee : card.assignee?.name ?? card.assignee?.account ?? card.assignee?.username ?? (card.assigneeId ? `用户 ${card.assigneeId}` : "未分配");

const loadDetail = async () => { if (board.value) board.value = await collabApi.getTaskBoard(board.value.id); };
const handleEvent = (event: FeatureEvent) => {
  if (["card_created", "card_updated", "card_deleted", "card_moved", "column_created", "column_updated", "column_deleted"].includes(String(event.type))) void loadDetail();
};

const initialize = async () => {
  loading.value = true;
  try {
    if (props.resourceId) board.value = await collabApi.getTaskBoard(props.resourceId);
    else if (props.embedded && props.canEdit) board.value = await collabApi.createTaskBoard(props.documentId);
    else {
      const list = await collabApi.listTaskBoards(props.documentId);
      board.value = list[0] ?? (props.canEdit ? await collabApi.createTaskBoard(props.documentId) : null);
    }
    if (!board.value) throw new Error("当前文档还没有任务看板，请由编辑者创建");
    emit("resource-ready", board.value.id);
    await loadDetail();
    connect("task-board", board.value.id, handleEvent, loadDetail);
  } catch (error) { errorMessage.value = getApiErrorMessage(error, "加载任务看板失败"); }
  finally { loading.value = false; }
};

const openCreate = (column: TaskColumn) => {
  if (!writable.value) return;
  createInColumn.value = column;
  form.value = { title: "", description: "", priority: "medium", assigneeId: "", dueDate: "", tags: "" };
};

const createCard = async () => {
  if (!createInColumn.value || !form.value.title.trim()) return;
  try {
    const card = await collabApi.createTaskCard(createInColumn.value.id, {
      title: form.value.title.trim(), description: form.value.description.trim(), priority: form.value.priority,
      assigneeId: form.value.assigneeId ? Number(form.value.assigneeId) : null,
      dueDate: form.value.dueDate || undefined,
      tags: form.value.tags.split(/[,，]/).map((tag) => tag.trim()).filter(Boolean),
    });
    createInColumn.value.cards = [...(createInColumn.value.cards ?? []), card];
    send({ type: "card_created", card });
    createInColumn.value = null;
  } catch (error) { errorMessage.value = getApiErrorMessage(error, "创建任务失败"); }
};

const dropCard = async (column: TaskColumn) => {
  const card = draggedCard.value;
  draggedCard.value = null;
  if (!card) return;
  try {
    const moved = await collabApi.moveTaskCard(card.id, column.id, cardsFor(column).length);
    await loadDetail();
    send({ type: "card_moved", card: moved });
  } catch (error) { errorMessage.value = getApiErrorMessage(error, "移动任务失败"); await loadDetail(); }
};

onMounted(initialize);
</script>

<template>
  <section class="flex h-full min-h-0 flex-col bg-slate-100">
    <div class="flex items-center justify-between border-b border-slate-200 bg-white px-5 py-3"><div><h3 class="font-semibold text-slate-900">{{ board?.title ?? '任务看板' }}</h3><p class="mt-0.5 text-xs text-slate-500">拖动卡片即可同步任务状态</p></div><FeatureStatus :status="status" :can-write="writable" /></div>
    <p v-if="errorMessage" class="mx-5 mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{{ errorMessage }}</p>
    <div v-if="loading" class="grid flex-1 place-items-center text-sm text-slate-500">正在准备任务看板...</div>
    <div v-else class="min-h-0 flex-1 overflow-x-auto p-4 md:p-6">
      <div class="flex h-full min-w-max gap-4">
        <section v-for="(column, columnIndex) in columns" :key="column.id" class="flex h-full w-[310px] flex-col rounded-2xl border border-slate-200 bg-slate-50/80" @dragover.prevent @drop="dropCard(column)">
          <header class="flex items-center justify-between px-4 py-3"><div class="flex items-center gap-2"><span :class="['h-2.5 w-2.5 rounded-full', ['bg-slate-400', 'bg-sky-500', 'bg-emerald-500', 'bg-violet-500'][columnIndex % 4]]" /><h4 class="text-sm font-semibold text-slate-800">{{ column.title }}</h4><span class="rounded-full bg-white px-2 py-0.5 text-xs text-slate-500 ring-1 ring-slate-200">{{ cardsFor(column).length }}</span></div><button type="button" :disabled="!writable" class="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-white hover:text-sky-600 disabled:opacity-30" @click="openCreate(column)"><IconPlus class="h-4 w-4" /></button></header>
          <div class="min-h-20 flex-1 space-y-3 overflow-y-auto px-3 pb-3">
            <article v-for="card in cardsFor(column)" :key="card.id" :draggable="writable" class="group cursor-grab rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-sky-200 hover:shadow-md active:cursor-grabbing" @dragstart="draggedCard = card">
              <div class="flex items-start justify-between gap-2"><span :class="['rounded-md px-2 py-1 text-[11px] font-semibold', priorityStyle[card.priority ?? 'medium']]">{{ priorityText[card.priority ?? 'medium'] }}优先级</span><IconGripVertical class="h-4 w-4 text-slate-300 opacity-0 group-hover:opacity-100" /></div>
              <h5 class="mt-3 text-sm font-semibold leading-5 text-slate-900">{{ card.title }}</h5><p v-if="card.description" class="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{{ card.description }}</p>
              <div v-if="card.tags?.length" class="mt-3 flex flex-wrap gap-1"><span v-for="tag in card.tags" :key="tag" class="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1 text-[10px] text-slate-600"><IconTag class="h-3 w-3" />{{ tag }}</span></div>
              <div class="mt-4 flex items-center justify-between border-t border-slate-100 pt-3"><span class="inline-flex items-center gap-1 text-[11px] text-slate-500"><IconCalendar class="h-3.5 w-3.5" />{{ card.dueDate?.slice(0, 10) || '无截止日期' }}</span><span class="grid h-7 w-7 place-items-center rounded-full bg-slate-900 text-[9px] font-bold text-white" :title="assigneeName(card)">{{ card.assigneeId ? toInitials(assigneeName(card)) : '?' }}</span></div>
            </article>
            <button type="button" :disabled="!writable" class="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 py-3 text-xs font-medium text-slate-500 hover:border-sky-300 hover:bg-white hover:text-sky-600 disabled:hidden" @click="openCreate(column)"><IconPlus class="h-4 w-4" />添加任务</button>
          </div>
        </section>
      </div>
    </div>

    <div v-if="createInColumn" class="fixed inset-0 z-50 grid place-items-center bg-slate-950/35 p-4 backdrop-blur-sm" @mousedown.self="createInColumn = null"><form class="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl" @submit.prevent="createCard"><div class="flex items-center justify-between"><div><h3 class="text-lg font-semibold">新建任务</h3><p class="mt-1 text-sm text-slate-500">添加到“{{ createInColumn.title }}”</p></div><button type="button" class="grid h-9 w-9 place-items-center rounded-lg hover:bg-slate-100" @click="createInColumn = null"><IconX class="h-5 w-5" /></button></div>
      <div class="mt-5 space-y-4"><label class="block text-sm font-medium text-slate-700">任务标题<input v-model="form.title" autofocus required class="mt-1.5 h-10 w-full rounded-lg border border-slate-200 px-3 outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-100" /></label><label class="block text-sm font-medium text-slate-700">说明<textarea v-model="form.description" rows="3" class="mt-1.5 w-full resize-none rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-sky-400" /></label><div class="grid grid-cols-2 gap-3"><label class="text-sm font-medium text-slate-700">优先级<select v-model="form.priority" class="mt-1.5 h-10 w-full rounded-lg border border-slate-200 px-3"><option value="low">低</option><option value="medium">中</option><option value="high">高</option><option value="urgent">紧急</option></select></label><label class="text-sm font-medium text-slate-700">截止日期<input v-model="form.dueDate" type="date" class="mt-1.5 h-10 w-full rounded-lg border border-slate-200 px-3" /></label></div><div class="grid grid-cols-2 gap-3"><label class="text-sm font-medium text-slate-700">负责人 ID<div class="relative"><IconUser class="absolute left-3 top-1/2 mt-0.5 h-4 w-4 -translate-y-1/2 text-slate-400" /><input v-model="form.assigneeId" type="number" min="1" class="mt-1.5 h-10 w-full rounded-lg border border-slate-200 pl-9 pr-3" placeholder="可选" /></div></label><label class="text-sm font-medium text-slate-700">标签<input v-model="form.tags" class="mt-1.5 h-10 w-full rounded-lg border border-slate-200 px-3" placeholder="前端, 协作" /></label></div></div>
      <div class="mt-6 flex justify-end gap-3"><button type="button" class="h-10 rounded-lg px-4 text-sm font-medium text-slate-600 hover:bg-slate-100" @click="createInColumn = null">取消</button><button type="submit" class="h-10 rounded-lg bg-sky-600 px-5 text-sm font-semibold text-white hover:bg-sky-700">创建任务</button></div></form></div>
  </section>
</template>
