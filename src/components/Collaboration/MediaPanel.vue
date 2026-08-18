<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from "vue";
import { collabApi, type FeatureEvent } from "@/services/collabFeatures";
import { useFeatureSocket } from "@/composables/useFeatureSocket";
import { getApiErrorMessage } from "@/utils/workspace";
import type { MediaAnnotation, MediaFile, ResourceId } from "@/types/collab-features";
import FeatureStatus from "./FeatureStatus.vue";
import IconPhoto from "~icons/tabler/photo";
import IconPlayerPlay from "~icons/tabler/player-play";
import IconPlus from "~icons/tabler/plus";
import IconTrash from "~icons/tabler/trash";
import IconUpload from "~icons/tabler/upload";

const props = defineProps<{ documentId: ResourceId; canEdit: boolean; resourceId?: ResourceId; embedded?: boolean }>();
const emit = defineEmits<{ (event: "resource-ready", id: ResourceId): void }>();
const mediaList = ref<MediaFile[]>([]);
const selected = ref<MediaFile | null>(null);
const annotations = ref<MediaAnnotation[]>([]);
const loading = ref(true);
const errorMessage = ref("");
const showRegister = ref(false);
const form = ref({ fileName: "", fileType: "image" as MediaFile["fileType"], filePath: "", mimeType: "image/jpeg" });
const annotationContent = ref("");
const annotationType = ref<MediaAnnotation["annotationType"]>("comment");
const mediaRef = ref<HTMLMediaElement | null>(null);
const imagePosition = ref<{ x: number; y: number } | null>(null);
const { status, canWrite, connect, send } = useFeatureSocket();
const writable = computed(() => props.canEdit && canWrite.value);
let lastPlaybackBroadcast = 0;
let applyingRemotePlayback = false;

const loadSelected = async () => {
  if (!selected.value) return;
  const detail = await collabApi.getMedia(selected.value.id);
  selected.value = detail;
  annotations.value = detail.annotations ?? [];
};
const handleEvent = (event: FeatureEvent) => {
  const annotation = event.annotation as MediaAnnotation | undefined;
  if ((event.type === "annotation_created" || event.type === "annotation_updated") && annotation) {
    const index = annotations.value.findIndex((item) => String(item.id) === String(annotation.id));
    if (index >= 0) annotations.value[index] = annotation; else annotations.value.push(annotation);
  }
  if (event.type === "annotation_deleted") annotations.value = annotations.value.filter((item) => String(item.id) !== String(event.annotationId));
  if (event.type === "playback_sync" && mediaRef.value) {
    applyingRemotePlayback = true;
    const time = Number(event.currentTime ?? 0);
    if (Math.abs(mediaRef.value.currentTime - time) > 1) mediaRef.value.currentTime = time;
    if (event.playing === true) void mediaRef.value.play().catch(() => undefined);
    if (event.playing === false) mediaRef.value.pause();
    window.setTimeout(() => { applyingRemotePlayback = false; }, 250);
  }
};
const selectMedia = async (item: MediaFile) => {
  selected.value = item; annotations.value = item.annotations ?? [];
  emit("resource-ready", item.id);
  connect("media", item.id, handleEvent, loadSelected);
  await loadSelected();
};
const initialize = async () => {
  loading.value = true;
  try {
    mediaList.value = await collabApi.listMedia(props.documentId);
    if (props.resourceId) {
      const existing = mediaList.value.find((item) => String(item.id) === String(props.resourceId));
      const item = existing ?? await collabApi.getMedia(props.resourceId);
      if (!existing) mediaList.value.push(item);
      await selectMedia(item);
    } else if (mediaList.value[0]) await selectMedia(mediaList.value[0]);
  } catch (error) { errorMessage.value = getApiErrorMessage(error, "加载媒体资料失败"); }
  finally { loading.value = false; }
};
const register = async () => {
  if (!form.value.fileName.trim() || !form.value.filePath.trim()) return;
  try {
    const item = await collabApi.registerMedia({ documentId: props.documentId, fileName: form.value.fileName.trim(), fileType: form.value.fileType, filePath: form.value.filePath.trim(), mimeType: form.value.mimeType, fileSize: 0, metadata: {} });
    mediaList.value.push(item); showRegister.value = false; await selectMedia(item);
  } catch (error) { errorMessage.value = getApiErrorMessage(error, "登记媒体失败"); }
};
const createAnnotation = async () => {
  if (!selected.value || !annotationContent.value.trim()) return;
  const time = mediaRef.value?.currentTime;
  try {
    const annotation = await collabApi.createAnnotation(selected.value.id, {
      annotationType: annotationType.value,
      content: annotationContent.value.trim(),
      position: imagePosition.value ? { x: imagePosition.value.x, y: imagePosition.value.y, width: 0, height: 0 } : undefined,
      startTime: annotationType.value === "timestamp" ? time ?? 0 : undefined,
      endTime: annotationType.value === "timestamp" ? (time ?? 0) + 0.1 : undefined,
    });
    annotations.value.push(annotation); send({ type: "annotation_created", annotation }); annotationContent.value = ""; imagePosition.value = null;
  } catch (error) { errorMessage.value = getApiErrorMessage(error, "创建标注失败"); }
};
const deleteAnnotation = async (annotation: MediaAnnotation) => {
  try { await collabApi.deleteAnnotation(annotation.id); annotations.value = annotations.value.filter((item) => String(item.id) !== String(annotation.id)); send({ type: "annotation_deleted", annotationId: annotation.id }); }
  catch (error) { errorMessage.value = getApiErrorMessage(error, "删除标注失败"); }
};
const broadcastPlayback = (playing: boolean) => {
  if (applyingRemotePlayback) return;
  const now = Date.now(); if (now - lastPlaybackBroadcast < 700 && playing) return; lastPlaybackBroadcast = now;
  send({ type: "playback_sync", currentTime: mediaRef.value?.currentTime ?? 0, playing });
};
const markImage = (event: MouseEvent) => {
  const target = event.currentTarget as HTMLElement; const rect = target.getBoundingClientRect();
  imagePosition.value = { x: Math.round(((event.clientX - rect.left) / rect.width) * 1000) / 10, y: Math.round(((event.clientY - rect.top) / rect.height) * 1000) / 10 };
  void nextTick(() => document.getElementById("annotation-input")?.focus());
};
const jumpTo = (annotation: MediaAnnotation) => { if (mediaRef.value && annotation.startTime !== undefined && annotation.startTime !== null) mediaRef.value.currentTime = Number(annotation.startTime); };
const formatTime = (seconds?: number | null) => { const value = Number(seconds ?? 0); return `${Math.floor(value / 60)}:${String(Math.floor(value % 60)).padStart(2, "0")}`; };

onMounted(initialize);
</script>

<template>
  <section class="flex h-full min-h-0 flex-col bg-slate-100">
    <div class="flex items-center justify-between border-b border-slate-200 bg-white px-5 py-3"><div><h3 class="font-semibold text-slate-900">多媒体协作标注</h3><p class="mt-0.5 text-xs text-slate-500">点击图片定位标注；音视频标注可跳转到时间点</p></div><div class="flex items-center gap-3"><button v-if="canEdit" type="button" class="inline-flex h-9 items-center gap-2 rounded-lg bg-sky-600 px-3 text-xs font-semibold text-white hover:bg-sky-700" @click="showRegister = !showRegister"><IconUpload class="h-4 w-4" />登记媒体</button><FeatureStatus v-if="selected" :status="status" :can-write="writable" /></div></div>
    <p v-if="errorMessage" class="mx-5 mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{{ errorMessage }}</p>
    <form v-if="showRegister" class="mx-5 mt-4 grid gap-3 rounded-xl border border-sky-200 bg-sky-50 p-4 md:grid-cols-[1fr_140px_2fr_120px]" @submit.prevent="register"><input v-model="form.fileName" required class="h-10 rounded-lg border border-slate-200 px-3 text-sm" placeholder="文件名，如 demo.mp4" /><select v-model="form.fileType" class="h-10 rounded-lg border border-slate-200 px-3 text-sm" @change="form.mimeType = `${form.fileType}/${form.fileType === 'image' ? 'jpeg' : form.fileType === 'video' ? 'mp4' : 'mpeg'}`"><option value="image">图片</option><option value="video">视频</option><option value="audio">音频</option></select><input v-model="form.filePath" required type="url" class="h-10 rounded-lg border border-slate-200 px-3 text-sm" placeholder="已上传文件的 HTTPS 地址" /><button type="submit" class="h-10 rounded-lg bg-slate-900 text-sm font-semibold text-white">确认登记</button></form>
    <div v-if="loading" class="grid flex-1 place-items-center text-sm text-slate-500">正在加载媒体资料...</div>
    <div v-else-if="!mediaList.length" class="grid flex-1 place-items-center p-6"><div class="max-w-sm text-center"><div class="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-white text-sky-600 shadow-sm"><IconPhoto class="h-7 w-7" /></div><h4 class="mt-4 font-semibold text-slate-800">还没有媒体资料</h4><p class="mt-2 text-sm leading-6 text-slate-500">先将文件上传到对象存储或文件服务，再在这里登记最终 URL。</p></div></div>
    <div v-else class="grid min-h-0 flex-1 lg:grid-cols-[210px_minmax(0,1fr)_320px]">
      <aside class="overflow-y-auto border-r border-slate-200 bg-white p-3"><button v-for="item in mediaList" :key="item.id" type="button" :class="['mb-2 flex w-full items-center gap-3 rounded-xl p-3 text-left transition', String(selected?.id) === String(item.id) ? 'bg-sky-50 text-sky-800 ring-1 ring-sky-100' : 'hover:bg-slate-50']" @click="selectMedia(item)"><span class="grid h-9 w-9 place-items-center rounded-lg bg-slate-100"><IconPlayerPlay v-if="item.fileType !== 'image'" class="h-4 w-4" /><IconPhoto v-else class="h-4 w-4" /></span><span class="min-w-0"><span class="block truncate text-sm font-medium">{{ item.fileName }}</span><span class="mt-0.5 block text-[11px] uppercase text-slate-400">{{ item.fileType }}</span></span></button></aside>
      <main class="flex min-h-0 items-center justify-center overflow-auto bg-slate-950 p-5">
        <div v-if="selected" class="relative max-h-full max-w-full">
          <img v-if="selected.fileType === 'image'" :src="selected.filePath" :alt="selected.fileName" class="max-h-[calc(100vh-250px)] max-w-full cursor-crosshair rounded-lg object-contain" @click="markImage" />
          <video v-else-if="selected.fileType === 'video'" ref="mediaRef" :src="selected.filePath" controls class="max-h-[calc(100vh-250px)] max-w-full rounded-lg" @play="broadcastPlayback(true)" @pause="broadcastPlayback(false)" @timeupdate="broadcastPlayback(true)" />
          <audio v-else ref="mediaRef" :src="selected.filePath" controls class="w-[min(560px,70vw)]" @play="broadcastPlayback(true)" @pause="broadcastPlayback(false)" @timeupdate="broadcastPlayback(true)" />
          <span v-if="imagePosition && selected.fileType === 'image'" class="pointer-events-none absolute grid h-7 w-7 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-sky-500 text-xs font-bold text-white ring-4 ring-white/70" :style="{ left: `${imagePosition.x}%`, top: `${imagePosition.y}%` }">+</span>
          <button v-for="(annotation, index) in annotations.filter((item) => item.position?.x !== undefined)" :key="annotation.id" type="button" class="absolute grid h-6 w-6 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-amber-400 text-[10px] font-bold text-slate-900 ring-2 ring-white" :style="{ left: `${annotation.position?.x}%`, top: `${annotation.position?.y}%` }" :title="annotation.content">{{ index + 1 }}</button>
        </div>
      </main>
      <aside class="flex min-h-0 flex-col border-l border-slate-200 bg-white"><div class="border-b border-slate-200 px-4 py-3"><h4 class="text-sm font-semibold">标注与评论</h4><p class="mt-0.5 text-xs text-slate-400">{{ annotations.length }} 条记录</p></div><div class="min-h-0 flex-1 space-y-3 overflow-y-auto p-4"><article v-for="annotation in annotations" :key="annotation.id" class="group rounded-xl border border-slate-200 p-3"><div class="flex items-start justify-between gap-2"><button v-if="annotation.startTime !== undefined && annotation.startTime !== null" type="button" class="rounded-md bg-sky-50 px-2 py-1 text-[11px] font-semibold text-sky-700" @click="jumpTo(annotation)">{{ formatTime(annotation.startTime) }}</button><span v-else class="rounded-md bg-slate-100 px-2 py-1 text-[11px] text-slate-600">{{ annotation.annotationType === 'comment' ? '评论' : '位置标注' }}</span><button v-if="writable" type="button" class="text-slate-300 opacity-0 hover:text-rose-600 group-hover:opacity-100" @click="deleteAnnotation(annotation)"><IconTrash class="h-4 w-4" /></button></div><p class="mt-2 text-sm leading-5 text-slate-700">{{ annotation.content }}</p></article></div>
        <form v-if="writable" class="border-t border-slate-200 p-4" @submit.prevent="createAnnotation"><div class="mb-2 flex gap-2"><button v-for="item in ([['comment', '评论'], ['timestamp', '时间点']] as const)" :key="item[0]" type="button" :class="['rounded-lg px-2.5 py-1 text-xs font-medium', annotationType === item[0] ? 'bg-sky-100 text-sky-700' : 'bg-slate-100 text-slate-500']" :disabled="selected?.fileType === 'image' && item[0] === 'timestamp'" @click="annotationType = item[0]">{{ item[1] }}</button></div><textarea id="annotation-input" v-model="annotationContent" rows="3" class="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-sky-400 focus:bg-white" :placeholder="imagePosition ? `标注位置 ${imagePosition.x}%, ${imagePosition.y}%` : '输入标注或评论'" /><button type="submit" :disabled="!annotationContent.trim()" class="mt-2 inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg bg-sky-600 text-xs font-semibold text-white disabled:bg-slate-300"><IconPlus class="h-4 w-4" />添加标注</button></form>
      </aside>
    </div>
  </section>
</template>
