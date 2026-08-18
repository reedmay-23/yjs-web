<script setup lang="ts">
import { computed } from "vue";
import type { FeatureSocketStatus } from "@/services/collabFeatures";

const props = defineProps<{ status: FeatureSocketStatus; canWrite: boolean }>();

const text = computed(() => {
  if (props.status === "connecting") return "正在连接";
  if (props.status === "disconnected") return "实时连接已断开";
  return props.canWrite ? "实时协作中" : "实时查看中";
});

const style = computed(() => {
  if (props.status === "connecting") return "bg-amber-50 text-amber-700 ring-amber-200";
  if (props.status === "disconnected") return "bg-rose-50 text-rose-700 ring-rose-200";
  return "bg-emerald-50 text-emerald-700 ring-emerald-200";
});
</script>

<template>
  <span :class="['inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold ring-1', style]">
    <span class="h-1.5 w-1.5 rounded-full bg-current" />
    {{ text }}
  </span>
</template>
