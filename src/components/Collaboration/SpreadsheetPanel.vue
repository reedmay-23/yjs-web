<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from "vue";
import { collabApi, type FeatureEvent } from "@/services/collabFeatures";
import { useFeatureSocket } from "@/composables/useFeatureSocket";
import { getApiErrorMessage } from "@/utils/workspace";
import type { CellValidation, ResourceId, Spreadsheet, SpreadsheetCell } from "@/types/collab-features";
import FeatureStatus from "./FeatureStatus.vue";
import IconCheck from "~icons/tabler/check";
import IconClipboard from "~icons/tabler/clipboard";
import IconFunction from "~icons/tabler/math-function";

const props = defineProps<{ documentId: ResourceId; canEdit: boolean; resourceId?: ResourceId; embedded?: boolean }>();
const emit = defineEmits<{ (event: "resource-ready", id: ResourceId): void }>();
const sheet = ref<Spreadsheet | null>(null);
const cells = ref<Map<string, SpreadsheetCell>>(new Map());
const drafts = ref<Map<string, string>>(new Map());
const loading = ref(true);
const errorMessage = ref("");
const pasteMessage = ref("");
const selected = ref({ row: 0, col: 0 });
const selectionAnchor = ref({ row: 0, col: 0 });
const selectionEnd = ref({ row: 0, col: 0 });
const isPointerSelecting = ref(false);
const formulaBar = ref("");
const validationType = ref<"none" | "number" | "text">("none");
const validationMin = ref<number | undefined>();
const validationMax = ref<number | undefined>();
const savingCount = ref(0);
const pendingCells = new Set<string>();
const { status, canWrite, connect, send } = useFeatureSocket();

const writable = computed(() => props.canEdit && canWrite.value);
const saving = computed(() => savingCount.value > 0);
const rowCount = computed(() => Math.min(Math.max(Number(sheet.value?.rowCount ?? 100), 24), 100));
const colCount = computed(() => Math.min(Math.max(Number(sheet.value?.colCount ?? 26), 12), 26));
const selectionBounds = computed(() => ({
  top: Math.min(selectionAnchor.value.row, selectionEnd.value.row),
  bottom: Math.max(selectionAnchor.value.row, selectionEnd.value.row),
  left: Math.min(selectionAnchor.value.col, selectionEnd.value.col),
  right: Math.max(selectionAnchor.value.col, selectionEnd.value.col),
}));

const keyOf = (row: number, col: number) => `${row}:${col}`;
const formulaStack = new Set<string>();
const columnLabel = (index: number) => {
  let value = index + 1;
  let label = "";
  while (value) { value -= 1; label = String.fromCharCode(65 + (value % 26)) + label; value = Math.floor(value / 26); }
  return label;
};
const parseCellRef = (refValue: string) => {
  const match = /^([A-Z]+)(\d+)$/.exec(refValue.toUpperCase());
  if (!match) return null;
  let col = 0;
  for (const letter of match[1]!) col = col * 26 + letter.charCodeAt(0) - 64;
  return { row: Number(match[2]!) - 1, col: col - 1 };
};
const rawCell = (row: number, col: number) => cells.value.get(keyOf(row, col));
const rawInputValue = (row: number, col: number) => {
  const draft = drafts.value.get(keyOf(row, col));
  if (draft !== undefined) return draft;
  const cell = rawCell(row, col);
  return cell?.formula || String(cell?.value ?? "");
};
const numericCell = (refValue: string): number => {
  const position = parseCellRef(refValue);
  if (!position) return 0;
  return Number(displayValue(position.row, position.col)) || 0;
};
const calculateFormula = (formula: string): string => {
  const normalized = formula.trim().replace(/^=/, "").toUpperCase();
  const range = /^(SUM|AVERAGE)\(([A-Z]+\d+):([A-Z]+\d+)\)$/.exec(normalized);
  if (range) {
    const start = parseCellRef(range[2]!); const end = parseCellRef(range[3]!);
    if (!start || !end) return "#ERROR";
    const values: number[] = [];
    for (let row = Math.min(start.row, end.row); row <= Math.max(start.row, end.row); row += 1) {
      for (let col = Math.min(start.col, end.col); col <= Math.max(start.col, end.col); col += 1) values.push(Number(displayValue(row, col)) || 0);
    }
    const sum = values.reduce((total, value) => total + value, 0);
    return String(range[1] === "AVERAGE" ? Math.round((sum / Math.max(values.length, 1)) * 100) / 100 : sum);
  }
  const binary = /^([A-Z]+\d+|-?\d+(?:\.\d+)?)\s*([+\-*/])\s*([A-Z]+\d+|-?\d+(?:\.\d+)?)$/.exec(normalized);
  if (binary) {
    const number = (token: string): number => /^[A-Z]/.test(token) ? numericCell(token) : Number(token);
    const left = number(binary[1]!); const right = number(binary[3]!);
    if (binary[2] === "+") return String(left + right);
    if (binary[2] === "-") return String(left - right);
    if (binary[2] === "*") return String(left * right);
    return right === 0 ? "#DIV/0!" : String(left / right);
  }
  if (/^[A-Z]+\d+$/.test(normalized)) return String(numericCell(normalized));
  return "#ERROR";
};
function displayValue(row: number, col: number): string {
  const key = keyOf(row, col);
  if (formulaStack.has(key)) return "#CYCLE!";
  const cell = rawCell(row, col);
  if (!cell) return "";
  if (!cell.formula) return String(cell.value ?? "");
  formulaStack.add(key);
  const result = calculateFormula(cell.formula);
  formulaStack.delete(key);
  return result;
}

const cellInputValue = (row: number, col: number) => {
  const isActive = selected.value.row === row && selected.value.col === col;
  return isActive || drafts.value.has(keyOf(row, col)) ? rawInputValue(row, col) : displayValue(row, col);
};
const isInSelection = (row: number, col: number) => {
  const bounds = selectionBounds.value;
  return row >= bounds.top && row <= bounds.bottom && col >= bounds.left && col <= bounds.right;
};
const upsert = (cell: SpreadsheetCell) => {
  cells.value.set(keyOf(cell.row, cell.col), cell);
  cells.value = new Map(cells.value);
};
const clearDraft = (row: number, col: number) => {
  drafts.value.delete(keyOf(row, col));
  drafts.value = new Map(drafts.value);
};
const loadDetail = async () => {
  if (!sheet.value) return;
  sheet.value = await collabApi.getSpreadsheet(sheet.value.id);
  cells.value = new Map((sheet.value.cells ?? []).map((cell) => [keyOf(cell.row, cell.col), cell]));
  drafts.value = new Map();
};
const handleEvent = (event: FeatureEvent) => {
  if (event.type === "cell_updated" && event.cell) upsert(event.cell as SpreadsheetCell);
  if (event.type === "cells_batch_updated" && Array.isArray(event.cells)) (event.cells as SpreadsheetCell[]).forEach(upsert);
};

const selectCell = (row: number, col: number, extend = false) => {
  selected.value = { row, col };
  if (!extend) selectionAnchor.value = { row, col };
  selectionEnd.value = { row, col };
  formulaBar.value = rawInputValue(row, col);
  const cell = rawCell(row, col);
  validationType.value = cell?.validation?.type === "number" || cell?.validation?.type === "text" ? cell.validation.type : "none";
  validationMin.value = cell?.validation?.min;
  validationMax.value = cell?.validation?.max;
  send({ type: "selection_change", selection: { startRow: selectionAnchor.value.row, startCol: selectionAnchor.value.col, endRow: row, endCol: col } });
};
const handleCellMouseDown = (event: MouseEvent, row: number, col: number) => {
  if (event.button !== 0) return;
  selectCell(row, col, event.shiftKey);
  isPointerSelecting.value = true;
};
const handleCellMouseEnter = (event: MouseEvent, row: number, col: number) => {
  if (!isPointerSelecting.value || event.buttons !== 1) return;
  selected.value = { row, col };
  selectionEnd.value = { row, col };
  formulaBar.value = rawInputValue(row, col);
};
const handleCellFocus = (row: number, col: number) => {
  if (selected.value.row !== row || selected.value.col !== col) selectCell(row, col);
};
const stopPointerSelection = () => { isPointerSelecting.value = false; };
const focusCell = async (row: number, col: number) => {
  const nextRow = Math.max(0, Math.min(row, rowCount.value - 1));
  const nextCol = Math.max(0, Math.min(col, colCount.value - 1));
  selectCell(nextRow, nextCol);
  await nextTick();
  document.getElementById(`sheet-cell-${nextRow}-${nextCol}`)?.focus();
};

const validate = (value: string, validation?: CellValidation) => {
  if (!validation) return "";
  if (validation.type === "number") {
    const number = Number(value);
    if (!value || Number.isNaN(number)) return "请输入有效数字";
    if (validation.min !== undefined && number < validation.min) return `数值不能小于 ${validation.min}`;
    if (validation.max !== undefined && number > validation.max) return `数值不能大于 ${validation.max}`;
  }
  return "";
};
const selectedValidation = (): CellValidation | undefined => validationType.value === "none" ? undefined : {
  type: validationType.value,
  min: validationType.value === "number" ? validationMin.value : undefined,
  max: validationType.value === "number" ? validationMax.value : undefined,
};
const commitCell = async (row: number, col: number, rawValue: string, validation = rawCell(row, col)?.validation) => {
  if (!sheet.value || !writable.value) return;
  const key = keyOf(row, col);
  if (pendingCells.has(key)) return;
  const formula = rawValue.trim().startsWith("=") ? rawValue.trim() : undefined;
  const value = formula ? calculateFormula(formula) : rawValue;
  const current = rawCell(row, col);
  if ((current?.formula ?? "") === (formula ?? "") && String(current?.value ?? "") === value && JSON.stringify(current?.validation) === JSON.stringify(validation)) {
    clearDraft(row, col);
    return;
  }
  const validationError = validate(value, validation);
  if (validationError) { errorMessage.value = `${columnLabel(col)}${row + 1}：${validationError}`; return; }
  pendingCells.add(key);
  savingCount.value += 1;
  errorMessage.value = "";
  try {
    const cell = await collabApi.updateCell(sheet.value.id, { row, col, value, formula, validation, format: current?.format });
    upsert(cell);
    clearDraft(row, col);
    send({ type: "cell_updated", cell });
  } catch (error) {
    errorMessage.value = getApiErrorMessage(error, "保存单元格失败");
    await loadDetail();
  } finally {
    pendingCells.delete(key);
    savingCount.value -= 1;
  }
};
const setCellDraft = (row: number, col: number, value: string) => {
  drafts.value.set(keyOf(row, col), value);
  drafts.value = new Map(drafts.value);
  if (selected.value.row === row && selected.value.col === col) formulaBar.value = value;
};
const handleCellInput = (event: Event, row: number, col: number) => setCellDraft(row, col, (event.target as HTMLInputElement).value);
const commitDirectCell = (event: Event, row: number, col: number) => {
  const value = (event.target as HTMLInputElement).value;
  const validation = selected.value.row === row && selected.value.col === col ? selectedValidation() : rawCell(row, col)?.validation;
  void commitCell(row, col, value, validation);
};
const commitAndMove = async (event: Event, row: number, col: number, rowOffset: number, colOffset: number) => {
  await commitCell(row, col, (event.target as HTMLInputElement).value, selectedValidation());
  await focusCell(row + rowOffset, col + colOffset);
};
const saveFormulaBar = async () => {
  const { row, col } = selected.value;
  setCellDraft(row, col, formulaBar.value);
  await commitCell(row, col, formulaBar.value, selectedValidation());
};

const pasteFromClipboard = async (event: ClipboardEvent) => {
  if (!sheet.value || !writable.value) return;
  const target = event.target;
  if (!(target instanceof HTMLElement) || target.dataset.sheetCell !== "true") return;
  const text = event.clipboardData?.getData("text/plain");
  if (text === undefined) return;
  event.preventDefault();
  const lines = text.replace(/\r/g, "").split("\n");
  if (lines[lines.length - 1] === "") lines.pop();
  const matrix = lines.map((line) => line.split("\t"));
  if (!matrix.length) return;
  const start = selected.value;
  const updates: SpreadsheetCell[] = [];
  matrix.forEach((rowValues, rowOffset) => rowValues.forEach((rawValue, colOffset) => {
    const row = start.row + rowOffset;
    const col = start.col + colOffset;
    if (row >= Number(sheet.value?.rowCount ?? 100) || col >= Number(sheet.value?.colCount ?? 26)) return;
    const current = rawCell(row, col);
    const formula = rawValue.trim().startsWith("=") ? rawValue.trim() : undefined;
    updates.push({ row, col, value: formula ? "" : rawValue, formula, format: current?.format, validation: current?.validation });
  }));
  if (!updates.length) return;

  updates.forEach(upsert);
  updates.forEach((cell) => { if (cell.formula) cell.value = calculateFormula(cell.formula); });
  const invalid = updates.find((cell) => validate(String(cell.value ?? ""), cell.validation));
  if (invalid) {
    errorMessage.value = `${columnLabel(invalid.col)}${invalid.row + 1}：${validate(String(invalid.value ?? ""), invalid.validation)}`;
    await loadDetail();
    return;
  }

  savingCount.value += 1;
  errorMessage.value = "";
  try {
    for (let index = 0; index < updates.length; index += 1000) {
      const chunk = updates.slice(index, index + 1000);
      const saved = await collabApi.updateCells(sheet.value.id, chunk);
      const broadcastCells = saved.length ? saved : chunk;
      broadcastCells.forEach(upsert);
      send({ type: "cells_batch_updated", cells: broadcastCells });
    }
    selectionAnchor.value = { ...start };
    selectionEnd.value = {
      row: Math.min(start.row + matrix.length - 1, rowCount.value - 1),
      col: Math.min(start.col + Math.max(...matrix.map((row) => row.length)) - 1, colCount.value - 1),
    };
    pasteMessage.value = `已粘贴 ${matrix.length} 行 × ${Math.max(...matrix.map((row) => row.length))} 列`;
    window.setTimeout(() => { pasteMessage.value = ""; }, 2500);
  } catch (error) {
    errorMessage.value = getApiErrorMessage(error, "批量粘贴失败");
    await loadDetail();
  } finally { savingCount.value -= 1; }
};
const copySelection = (event: ClipboardEvent) => {
  const target = event.target;
  if (!(target instanceof HTMLElement) || target.dataset.sheetCell !== "true") return;
  const bounds = selectionBounds.value;
  const lines: string[] = [];
  for (let row = bounds.top; row <= bounds.bottom; row += 1) {
    const values: string[] = [];
    for (let col = bounds.left; col <= bounds.right; col += 1) values.push(displayValue(row, col));
    lines.push(values.join("\t"));
  }
  event.preventDefault();
  event.clipboardData?.setData("text/plain", lines.join("\n"));
  pasteMessage.value = `已复制 ${bounds.bottom - bounds.top + 1} 行 × ${bounds.right - bounds.left + 1} 列`;
  window.setTimeout(() => { pasteMessage.value = ""; }, 1800);
};

const initialize = async () => {
  loading.value = true;
  try {
    if (props.resourceId) sheet.value = await collabApi.getSpreadsheet(props.resourceId);
    else if (props.embedded && props.canEdit) sheet.value = await collabApi.createSpreadsheet(props.documentId);
    else {
      const list = await collabApi.listSpreadsheets(props.documentId);
      sheet.value = list[0] ?? (props.canEdit ? await collabApi.createSpreadsheet(props.documentId) : null);
    }
    if (!sheet.value) throw new Error("当前文档还没有协作表格，请由编辑者创建");
    emit("resource-ready", sheet.value.id);
    await loadDetail();
    connect("spreadsheet", sheet.value.id, handleEvent, loadDetail);
    selectCell(0, 0);
  } catch (error) { errorMessage.value = getApiErrorMessage(error, "加载协作表格失败"); }
  finally { loading.value = false; }
};

onMounted(() => {
  window.addEventListener("mouseup", stopPointerSelection);
  void initialize();
});
onBeforeUnmount(() => window.removeEventListener("mouseup", stopPointerSelection));
</script>

<template>
  <section class="flex h-full min-h-0 flex-col bg-white" @paste="pasteFromClipboard" @copy="copySelection">
    <div class="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
      <div><h3 class="font-semibold text-slate-900">{{ sheet?.title ?? '协作数据表' }}</h3><p class="mt-0.5 text-xs text-slate-500">点击单元格直接输入；支持从 Excel / WPS 复制区域后直接粘贴</p></div>
      <div class="flex items-center gap-2"><span v-if="pasteMessage" class="rounded-full bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-700">{{ pasteMessage }}</span><FeatureStatus :status="status" :can-write="writable" /></div>
    </div>
    <p v-if="errorMessage" class="mx-4 mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{{ errorMessage }}</p>
    <div v-if="loading" class="grid flex-1 place-items-center text-sm text-slate-500">正在准备协作表格...</div>
    <template v-else>
      <div class="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2">
        <span class="grid h-9 w-16 place-items-center rounded-lg border border-slate-200 bg-white text-sm font-semibold text-slate-700">{{ columnLabel(selected.col) }}{{ selected.row + 1 }}</span>
        <div class="flex min-w-[280px] flex-1 items-center rounded-lg border border-slate-200 bg-white"><IconFunction class="ml-3 h-4 w-4 text-slate-400" /><input v-model="formulaBar" :disabled="!writable" class="h-9 min-w-0 flex-1 px-3 text-sm outline-none" placeholder="输入值或公式，例如 =SUM(B2:B10)" @keydown.enter.prevent="saveFormulaBar" /></div>
        <select v-model="validationType" :disabled="!writable" class="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs"><option value="none">无校验</option><option value="number">数字校验</option><option value="text">文本校验</option></select>
        <template v-if="validationType === 'number'"><input v-model.number="validationMin" type="number" class="h-9 w-24 rounded-lg border border-slate-200 px-3 text-xs" placeholder="最小值" /><input v-model.number="validationMax" type="number" class="h-9 w-24 rounded-lg border border-slate-200 px-3 text-xs" placeholder="最大值" /></template>
        <button type="button" :disabled="!writable || saving" class="inline-flex h-9 items-center gap-2 rounded-lg bg-sky-600 px-4 text-xs font-semibold text-white hover:bg-sky-700 disabled:bg-slate-300" @click="saveFormulaBar"><IconCheck class="h-4 w-4" />{{ saving ? '保存中' : '应用' }}</button>
        <span class="hidden items-center gap-1 text-[11px] text-slate-400 xl:inline-flex"><IconClipboard class="h-3.5 w-3.5" />Ctrl/Cmd + V 粘贴区域</span>
      </div>
      <div class="min-h-0 flex-1 overflow-auto bg-slate-100">
        <table class="border-separate border-spacing-0 bg-white text-sm">
          <thead class="sticky top-0 z-20"><tr><th class="sticky left-0 z-30 h-8 w-12 min-w-12 border-b border-r border-slate-300 bg-slate-100" /><th v-for="col in colCount" :key="col" class="h-8 min-w-28 border-b border-r border-slate-300 bg-slate-100 px-2 text-center text-xs font-semibold text-slate-500">{{ columnLabel(col - 1) }}</th></tr></thead>
          <tbody>
            <tr v-for="row in rowCount" :key="row">
              <th class="sticky left-0 z-10 h-8 border-b border-r border-slate-300 bg-slate-100 text-center text-[11px] font-medium text-slate-500">{{ row }}</th>
              <td
                v-for="col in colCount"
                :key="col"
                :class="[
                  'relative h-8 min-w-28 border-b border-r border-slate-200 bg-white p-0',
                  isInSelection(row - 1, col - 1) ? 'bg-sky-50' : '',
                  selected.row === row - 1 && selected.col === col - 1 ? 'z-10 outline-2 outline-sky-500 -outline-offset-2' : 'hover:bg-sky-50/40',
                ]"
                @mousedown="handleCellMouseDown($event, row - 1, col - 1)"
                @mouseenter="handleCellMouseEnter($event, row - 1, col - 1)"
              >
                <input
                  :id="`sheet-cell-${row - 1}-${col - 1}`"
                  data-sheet-cell="true"
                  :value="cellInputValue(row - 1, col - 1)"
                  :disabled="!writable"
                  :title="rawCell(row - 1, col - 1)?.formula || displayValue(row - 1, col - 1)"
                  class="h-8 w-full min-w-28 bg-transparent px-2 text-sm text-slate-700 outline-none placeholder:text-slate-300 disabled:cursor-not-allowed"
                  @focus="handleCellFocus(row - 1, col - 1)"
                  @input="handleCellInput($event, row - 1, col - 1)"
                  @blur="commitDirectCell($event, row - 1, col - 1)"
                  @keydown.enter.prevent="commitAndMove($event, row - 1, col - 1, 1, 0)"
                  @keydown.tab="commitDirectCell($event, row - 1, col - 1)"
                />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </section>
</template>
