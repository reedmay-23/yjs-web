<script setup lang="ts">
import { nextTick, ref, useId, useSlots, watch } from "vue";
import IconX from "~icons/tabler/x";

const props = withDefaults(defineProps<{
  open: boolean;
  title: string;
  description?: string;
  maxWidth?: "sm" | "md" | "lg";
  closeOnBackdrop?: boolean;
  showClose?: boolean;
  contentClass?: string;
}>(), {
  description: "",
  maxWidth: "md",
  closeOnBackdrop: true,
  showClose: true,
  contentClass: "px-5 py-5",
});

const emit = defineEmits<{
  (event: "close"): void;
}>();

const slots = useSlots();
const dialogRef = ref<HTMLDialogElement | null>(null);
const titleId = useId();
const descriptionId = useId();
const maxWidthClass = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
} as const;

const requestClose = () => emit("close");

const handleCancel = (event: Event) => {
  event.preventDefault();
  requestClose();
};

watch(() => props.open, async (open) => {
  await nextTick();
  const dialog = dialogRef.value;
  if (!dialog) return;

  if (open && !dialog.open) {
    dialog.showModal();
    await nextTick();
    dialog.querySelector<HTMLElement>("[autofocus]")?.focus();
  } else if (!open && dialog.open) {
    dialog.close();
  }
}, { immediate: true });
</script>

<template>
  <Teleport to="body">
    <dialog
      ref="dialogRef"
      class="app-dialog-shell fixed inset-0 m-0 h-[100dvh] max-h-none w-screen max-w-none items-center justify-center overflow-hidden border-0 bg-slate-950/30 p-4 backdrop-blur-[2px]"
      :aria-labelledby="titleId"
      :aria-describedby="description ? descriptionId : undefined"
      @cancel="handleCancel"
      @mousedown.self="closeOnBackdrop && requestClose()"
    >
      <section
        :class="['flex max-h-[calc(100vh-32px)] w-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-slate-950/20 outline-none', maxWidthClass[maxWidth]]"
      >
        <header class="flex items-center justify-between gap-4 border-b border-slate-100 px-5 py-4">
          <div class="flex min-w-0 items-center gap-3">
            <slot name="icon" />
            <div class="min-w-0">
              <h2 :id="titleId" class="text-base font-semibold text-slate-900">{{ title }}</h2>
              <p v-if="description" :id="descriptionId" class="mt-0.5 text-xs leading-5 text-slate-400">{{ description }}</p>
            </div>
          </div>
          <button
            v-if="showClose"
            type="button"
            class="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-sky-100"
            :aria-label="`关闭${title}`"
            @click="requestClose"
          >
            <IconX class="h-5 w-5" />
          </button>
        </header>

        <div :class="['min-h-0 flex-1 overflow-y-auto', contentClass]">
          <slot />
        </div>

        <footer v-if="slots.footer" class="border-t border-slate-100 bg-slate-50 px-5 py-4">
          <slot name="footer" />
        </footer>
      </section>
    </dialog>
  </Teleport>
</template>

<style scoped>
.app-dialog-shell[open] {
  display: flex;
  overscroll-behavior: contain;
  animation: app-dialog-backdrop-in 160ms ease both;
}

.app-dialog-shell::backdrop {
  background: transparent;
}

.app-dialog-shell[open] section {
  animation: app-dialog-panel-in 160ms ease both;
}

@keyframes app-dialog-backdrop-in {
  from { background-color: transparent; backdrop-filter: blur(0); }
}

@keyframes app-dialog-panel-in {
  from { opacity: 0; transform: translateY(8px) scale(.98); }
}
</style>
