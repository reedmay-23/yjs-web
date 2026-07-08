<script setup lang="ts">
import { computed } from "vue";
import { roleText, statusText, type DocumentItem } from "@/utils/workspace";
import IconChevronLeft from "~icons/tabler/chevron-left";
import IconUsers from "~icons/tabler/users";

const props = defineProps<{
  document: DocumentItem;
  canManageCollaborators: boolean;
  onlineCount: number;
}>();

const emit = defineEmits<{
  (event: "back"): void;
  (event: "open-collaborators"): void;
}>();

const documentMeta = computed(() => {
  return `${props.document.updatedAt} · ${statusText[props.document.status]} · ${roleText[props.document.role]} · 在线 ${props.onlineCount}`;
});
</script>

<template>
  <header class="sticky top-0 z-30 border-b border-slate-200 bg-white px-4 py-3 md:px-6">
    <div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <div class="flex min-w-0 items-center gap-3">
        <button
          type="button"
          class="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
          @click="emit('back')"
        >
          <IconChevronLeft class="h-5 w-5" />
        </button>
        <div class="min-w-0">
          <h2 class="truncate text-lg font-semibold">{{ document.title }}</h2>
          <p class="text-sm text-slate-500">{{ documentMeta }}</p>
        </div>
      </div>

      <div class="flex items-center gap-3">
        <div class="hidden -space-x-2 sm:flex">
          <span
            v-for="collaborator in document.collaborators"
            :key="collaborator"
            class="grid h-8 w-8 place-items-center rounded-full border-2 border-white bg-slate-100 text-[11px] font-semibold text-slate-700"
          >
            {{ collaborator }}
          </span>
        </div>
        <button
          type="button"
          class="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
          @click="emit('open-collaborators')"
        >
          <IconUsers class="h-4 w-4" />
          {{ canManageCollaborators ? "共享" : "协作者" }}
        </button>
      </div>
    </div>
  </header>
</template>
