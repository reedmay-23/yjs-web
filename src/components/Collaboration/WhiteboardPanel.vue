<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { collabApi, type FeatureEvent } from "@/services/collabFeatures";
import { useFeatureSocket } from "@/composables/useFeatureSocket";
import { getApiErrorMessage } from "@/utils/workspace";
import type { ResourceId, Whiteboard, WhiteboardElement } from "@/types/collab-features";
import AppDialog from "@/components/Common/AppDialog.vue";
import FeatureStatus from "./FeatureStatus.vue";
import IconBrush from "~icons/tabler/brush";
import IconEraser from "~icons/tabler/eraser";
import IconPointer from "~icons/tabler/pointer";
import IconRectangle from "~icons/tabler/rectangle";
import IconTextSize from "~icons/tabler/text-size";
import IconTrash from "~icons/tabler/trash";

type Tool = "select" | "pen" | "shape" | "text" | "eraser";
type Point = [number, number];

const props = defineProps<{ documentId: ResourceId; canEdit: boolean; resourceId?: ResourceId; embedded?: boolean }>();
const emit = defineEmits<{ (event: "resource-ready", id: ResourceId): void }>();
const board = ref<Whiteboard | null>(null);
const elements = ref<WhiteboardElement[]>([]);
const activeTool = ref<Tool>("select");
const strokeColor = ref("#0f172a");
const strokeWidth = ref(3);
const loading = ref(true);
const saving = ref(false);
const errorMessage = ref("");
const draftPoints = ref<Point[]>([]);
const pointerStart = ref<Point | null>(null);
const selectedId = ref<ResourceId | null>(null);
const moveOrigin = ref<{ point: Point; properties: Record<string, unknown> } | null>(null);
const svgRef = ref<SVGSVGElement | null>(null);
const textDialog = ref<{ point: Point; text: string } | null>(null);
const { status, canWrite, connect, send } = useFeatureSocket();

const writable = computed(() => props.canEdit && canWrite.value);
const sortedElements = computed(() => [...elements.value].sort((a, b) => Number(a.zIndex ?? 0) - Number(b.zIndex ?? 0)));
const draftRectangle = computed(() => {
  const first = draftPoints.value[0];
  const second = draftPoints.value[1];
  if (!first || !second) return null;
  return {
    x: Math.min(first[0], second[0]), y: Math.min(first[1], second[1]),
    width: Math.abs(second[0] - first[0]), height: Math.abs(second[1] - first[1]),
  };
});

const pointFromEvent = (event: PointerEvent): Point => {
  const rect = svgRef.value?.getBoundingClientRect();
  if (!rect) return [0, 0];
  return [((event.clientX - rect.left) / rect.width) * 1200, ((event.clientY - rect.top) / rect.height) * 700];
};

const upsertElement = (element: WhiteboardElement) => {
  const index = elements.value.findIndex((item) => String(item.id) === String(element.id));
  if (index >= 0) elements.value[index] = element;
  else elements.value.push(element);
};

const loadBoardDetail = async () => {
  if (!board.value) return;
  const detail = await collabApi.getWhiteboard(board.value.id);
  board.value = detail;
  elements.value = detail.elements ?? [];
};

const handleEvent = (event: FeatureEvent) => {
  const element = event.element as WhiteboardElement | undefined;
  if ((event.type === "element_added" || event.type === "element_updated") && element) upsertElement(element);
  if (event.type === "element_deleted") {
    const id = event.elementId ?? (element?.id as unknown);
    elements.value = elements.value.filter((item) => String(item.id) !== String(id));
  }
};

const initialize = async () => {
  loading.value = true;
  errorMessage.value = "";
  try {
    if (props.resourceId) board.value = await collabApi.getWhiteboard(props.resourceId);
    else if (props.embedded && props.canEdit) board.value = await collabApi.createWhiteboard(props.documentId);
    else {
      const list = await collabApi.listWhiteboards(props.documentId);
      board.value = list[0] ?? (props.canEdit ? await collabApi.createWhiteboard(props.documentId) : null);
    }
    if (!board.value) throw new Error("当前文档还没有白板，请由编辑者创建");
    emit("resource-ready", board.value.id);
    await loadBoardDetail();
    connect("whiteboard", board.value.id, handleEvent, loadBoardDetail);
  } catch (error) {
    errorMessage.value = getApiErrorMessage(error, "加载协作白板失败");
  } finally {
    loading.value = false;
  }
};

const createElement = async (elementType: WhiteboardElement["elementType"], properties: Record<string, unknown>) => {
  if (!board.value || !writable.value) return;
  saving.value = true;
  try {
    const element = await collabApi.addWhiteboardElement(board.value.id, {
      elementType,
      properties,
      zIndex: elements.value.length,
    });
    upsertElement(element);
    send({ type: "element_added", element });
  } catch (error) {
    errorMessage.value = getApiErrorMessage(error, "保存绘图元素失败");
  } finally {
    saving.value = false;
  }
};

const deleteElement = async (element: WhiteboardElement) => {
  if (!board.value || !writable.value) return;
  try {
    await collabApi.deleteWhiteboardElement(board.value.id, element.id);
    elements.value = elements.value.filter((item) => String(item.id) !== String(element.id));
    selectedId.value = null;
    send({ type: "element_deleted", elementId: element.id });
  } catch (error) {
    errorMessage.value = getApiErrorMessage(error, "删除元素失败");
  }
};

const handlePointerDown = (event: PointerEvent) => {
  if (!writable.value || activeTool.value === "select" || activeTool.value === "eraser") return;
  const point = pointFromEvent(event);
  if (activeTool.value === "text") {
    textDialog.value = { point, text: "" };
    return;
  }
  pointerStart.value = point;
  draftPoints.value = [point];
  svgRef.value?.setPointerCapture(event.pointerId);
};

const insertTextElement = () => {
  const dialog = textDialog.value;
  const text = dialog?.text.trim();
  if (!dialog || !text) return;

  textDialog.value = null;
  void createElement("text", {
    x: dialog.point[0],
    y: dialog.point[1],
    text,
    color: strokeColor.value,
    fontSize: 24,
  });
};

const handlePointerMove = (event: PointerEvent) => {
  if (!pointerStart.value) return;
  const point = pointFromEvent(event);
  if (activeTool.value === "pen") draftPoints.value.push(point);
  else draftPoints.value = [pointerStart.value, point];
};

const handlePointerUp = async (event: PointerEvent) => {
  if (!pointerStart.value) return;
  svgRef.value?.releasePointerCapture(event.pointerId);
  const points = [...draftPoints.value];
  const start = pointerStart.value;
  pointerStart.value = null;
  draftPoints.value = [];
  if (activeTool.value === "pen" && points.length > 1) {
    await createElement("pen", { points, strokeColor: strokeColor.value, strokeWidth: strokeWidth.value });
  } else if (activeTool.value === "shape" && points.length === 2) {
    const end = points[1]!;
    await createElement("shape", {
      shape: "rectangle",
      x: Math.min(start[0], end[0]), y: Math.min(start[1], end[1]),
      width: Math.abs(end[0] - start[0]), height: Math.abs(end[1] - start[1]),
      strokeColor: strokeColor.value, strokeWidth: strokeWidth.value, fillColor: "transparent",
    });
  }
};

const elementPointerDown = (event: PointerEvent, element: WhiteboardElement) => {
  event.stopPropagation();
  if (activeTool.value === "eraser") { void deleteElement(element); return; }
  if (activeTool.value !== "select") return;
  selectedId.value = element.id;
  moveOrigin.value = { point: pointFromEvent(event), properties: structuredClone(element.properties) };
  svgRef.value?.setPointerCapture(event.pointerId);
};

const moveSelected = (event: PointerEvent) => {
  if (!moveOrigin.value || selectedId.value === null) return;
  const element = elements.value.find((item) => String(item.id) === String(selectedId.value));
  if (!element) return;
  const point = pointFromEvent(event);
  const dx = point[0] - moveOrigin.value.point[0];
  const dy = point[1] - moveOrigin.value.point[1];
  const source = moveOrigin.value.properties;
  if (Array.isArray(source.points)) {
    element.properties = { ...source, points: (source.points as Point[]).map(([x, y]) => [x + dx, y + dy]) };
  } else {
    element.properties = { ...source, x: Number(source.x ?? 0) + dx, y: Number(source.y ?? 0) + dy };
  }
};

const finishMove = async (event: PointerEvent) => {
  if (!moveOrigin.value || selectedId.value === null || !board.value) return;
  const element = elements.value.find((item) => String(item.id) === String(selectedId.value));
  moveOrigin.value = null;
  svgRef.value?.releasePointerCapture(event.pointerId);
  if (!element) return;
  try {
    const updated = await collabApi.updateWhiteboardElement(board.value.id, element.id, { properties: element.properties });
    upsertElement(updated);
    send({ type: "element_updated", element: updated });
  } catch (error) {
    errorMessage.value = getApiErrorMessage(error, "移动元素失败");
    await loadBoardDetail();
  }
};

const pathFor = (points: unknown) => Array.isArray(points)
  ? (points as Point[]).map(([x, y], index) => `${index ? "L" : "M"}${x},${y}`).join(" ")
  : "";

onMounted(initialize);
</script>

<template>
  <section class="flex h-full min-h-0 flex-col">
    <div class="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3">
      <div class="flex flex-wrap items-center gap-1 rounded-xl bg-slate-100 p-1">
        <button v-for="tool in ([['select', IconPointer, '选择'], ['pen', IconBrush, '画笔'], ['shape', IconRectangle, '矩形'], ['text', IconTextSize, '文字'], ['eraser', IconEraser, '擦除']] as const)" :key="tool[0]" type="button" :disabled="!writable" :class="['inline-flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-medium transition', activeTool === tool[0] ? 'bg-white text-sky-700 shadow-sm' : 'text-slate-600 hover:bg-white/70', !writable && 'cursor-not-allowed opacity-50']" @click="activeTool = tool[0]">
          <component :is="tool[1]" class="h-4 w-4" />{{ tool[2] }}
        </button>
      </div>
      <div class="flex items-center gap-3">
        <label class="flex items-center gap-2 text-xs text-slate-500">颜色 <input v-model="strokeColor" type="color" class="h-8 w-8 cursor-pointer rounded border-0 bg-transparent p-0" /></label>
        <label class="flex items-center gap-2 text-xs text-slate-500">粗细 <input v-model.number="strokeWidth" type="range" min="1" max="12" class="w-20 accent-sky-600" /></label>
        <button v-if="selectedId !== null" type="button" class="grid h-9 w-9 place-items-center rounded-lg text-rose-600 hover:bg-rose-50" title="删除选中元素" @click="deleteElement(elements.find((item) => String(item.id) === String(selectedId))!)"><IconTrash class="h-4 w-4" /></button>
        <FeatureStatus :status="status" :can-write="writable" />
      </div>
    </div>

    <p v-if="errorMessage" class="mx-4 mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{{ errorMessage }}</p>
    <div v-if="loading" class="grid flex-1 place-items-center text-sm text-slate-500">正在准备协作白板...</div>
    <div v-else class="min-h-0 flex-1 overflow-auto bg-slate-100 p-4">
      <svg ref="svgRef" draggable="false" viewBox="0 0 1200 700" class="mx-auto aspect-[12/7] min-w-[760px] max-w-[1200px] touch-none select-none rounded-2xl bg-white shadow-sm ring-1 ring-slate-200" :class="activeTool === 'eraser' ? 'cursor-crosshair' : activeTool === 'select' ? 'cursor-default' : 'cursor-crosshair'" @dragstart.prevent.stop @pointerdown.stop="handlePointerDown" @pointermove.stop="(event) => { handlePointerMove(event); moveSelected(event) }" @pointerup.stop="(event) => { handlePointerUp(event); finishMove(event) }">
        <defs><pattern id="board-grid" width="24" height="24" patternUnits="userSpaceOnUse"><path d="M 24 0 L 0 0 0 24" fill="none" stroke="#e2e8f0" stroke-width="1" /></pattern></defs>
        <rect width="1200" height="700" fill="url(#board-grid)" />
        <g v-for="element in sortedElements" :key="element.id" :class="activeTool === 'select' || activeTool === 'eraser' ? 'cursor-pointer' : ''" @pointerdown="elementPointerDown($event, element)">
          <path v-if="element.elementType === 'pen' || element.elementType === 'line' || element.elementType === 'arrow'" :d="pathFor(element.properties.points)" fill="none" :stroke="String(element.properties.strokeColor ?? '#0f172a')" :stroke-width="Number(element.properties.strokeWidth ?? 3)" stroke-linecap="round" stroke-linejoin="round" />
          <rect v-else-if="element.elementType === 'shape'" :x="Number(element.properties.x ?? 0)" :y="Number(element.properties.y ?? 0)" :width="Number(element.properties.width ?? 0)" :height="Number(element.properties.height ?? 0)" :fill="String(element.properties.fillColor ?? 'transparent')" :stroke="String(element.properties.strokeColor ?? '#0f172a')" :stroke-width="Number(element.properties.strokeWidth ?? 3)" rx="10" />
          <text v-else-if="element.elementType === 'text'" :x="Number(element.properties.x ?? 0)" :y="Number(element.properties.y ?? 0)" :fill="String(element.properties.color ?? '#0f172a')" :font-size="Number(element.properties.fontSize ?? 24)" font-family="Inter, sans-serif">{{ element.properties.text }}</text>
          <rect v-if="String(selectedId) === String(element.id)" :x="Number(element.properties.x ?? 0) - 8" :y="Number(element.properties.y ?? 0) - 8" :width="Number(element.properties.width ?? 100) + 16" :height="Number(element.properties.height ?? 40) + 16" fill="none" stroke="#0284c7" stroke-width="2" stroke-dasharray="7 5" pointer-events="none" />
        </g>
        <path v-if="draftPoints.length > 1 && activeTool === 'pen'" :d="pathFor(draftPoints)" fill="none" :stroke="strokeColor" :stroke-width="strokeWidth" stroke-linecap="round" stroke-linejoin="round" />
        <rect v-if="draftRectangle && activeTool === 'shape'" :x="draftRectangle.x" :y="draftRectangle.y" :width="draftRectangle.width" :height="draftRectangle.height" fill="transparent" :stroke="strokeColor" :stroke-width="strokeWidth" rx="10" />
      </svg>
    </div>
  </section>

  <AppDialog
    :open="textDialog !== null"
    title="添加白板文字"
    description="输入文字后，将添加到刚才点击的位置"
    max-width="sm"
    @close="textDialog = null"
  >
    <template #icon>
      <span class="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-sky-50 text-sky-700">
        <IconTextSize class="h-5 w-5" />
      </span>
    </template>
    <label v-if="textDialog" class="block text-sm font-semibold text-slate-700">
      文字内容
      <textarea
        v-model="textDialog.text"
        autofocus
        rows="4"
        class="mt-2 w-full resize-y rounded-xl border border-slate-200 px-3.5 py-3 text-sm leading-6 text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
        placeholder="输入白板文字……"
        @keydown.ctrl.enter.prevent="insertTextElement"
      />
    </label>
    <p class="mt-2 text-xs text-slate-400">Ctrl + Enter 快速添加</p>
    <template #footer>
      <div class="flex justify-end gap-2">
        <button type="button" class="h-9 rounded-lg px-4 text-sm font-medium text-slate-600 transition hover:bg-slate-200" @click="textDialog = null">取消</button>
        <button type="button" :disabled="!textDialog?.text.trim()" class="h-9 rounded-lg bg-sky-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50" @click="insertTextElement">添加文字</button>
      </div>
    </template>
  </AppDialog>
</template>
