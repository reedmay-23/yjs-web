<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, useSlots, watch } from "vue";
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
const panelRef = ref<HTMLElement | null>(null);
const maxWidthClass = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
};

let previousActiveElement: HTMLElement | null = null;
let previousBodyOverflow = "";

const requestClose = () => emit("close");

const handleDocumentKeydown = (event: KeyboardEvent) => {
  if (!props.open) return;

  if (event.key === "Escape") {
    event.preventDefault();
    requestClose();
    return;
  }

  if (event.key !== "Tab" || !panelRef.value) return;
  const focusable = Array.from(panelRef.value.querySelectorAll<HTMLElement>(
    'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
  ));
  if (!focusable.length) {
    event.preventDefault();
    panelRef.value.focus();
    return;
  }

  const first = focusable[0]!;
  const last = focusable[focusable.length - 1]!;
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
};

watch(() => props.open, async (open) => {
  if (open) {
    previousActiveElement = document.activeElement as HTMLElement | null;
    previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleDocumentKeydown);
    await nextTick();
    const autofocusElement = panelRef.value?.querySelector<HTMLElement>("[autofocus]");
    (autofocusElement ?? panelRef.value)?.focus();
    return;
  }

  document.removeEventListener("keydown", handleDocumentKeydown);
  document.body.style.overflow = previousBodyOverflow;
  previousActiveElement?.focus();
  previousActiveElement = null;
}, { immediate: true });

onBeforeUnmount(() => {
  document.removeEventListener("keydown", handleDocumentKeydown);
  if (props.open) document.body.style.overflow = previousBodyOverflow;
});
</script>

<template>
  <Teleport to="body">
    <Transition name="app-dialog" appear>
      <div
        v-if="open"
        class="fixed inset-0 z-[140] flex items-center justify-center bg-slate-950/30 p-4 backdrop-blur-[2px]"
        role="presentation"
        @mousedown.self="closeOnBackdrop && requestClose()"
      >
        <section
          ref="panelRef"
          :class="['flex max-h-[calc(100vh-32px)] w-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-slate-950/20 outline-none', maxWidthClass[maxWidth]]"
          role="dialog"
          aria-modal="true"
          :aria-label="title"
          tabindex="-1"
        >
          <header class="flex items-center justify-between gap-4 border-b border-slate-100 px-5 py-4">
            <div class="flex min-w-0 items-center gap-3">
              <slot name="icon" />
              <div class="min-w-0">
                <h2 class="text-base font-semibold text-slate-900">{{ title }}</h2>
                <p v-if="description" class="mt-0.5 text-xs leading-5 text-slate-400">{{ description }}</p>
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
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.app-dialog-enter-active,
.app-dialog-leave-active {
  transition: opacity 160ms ease;
}

.app-dialog-enter-active section,
.app-dialog-leave-active section {
  transition: opacity 160ms ease, transform 160ms ease;
}

.app-dialog-enter-from,
.app-dialog-leave-to {
  opacity: 0;
}

.app-dialog-enter-from section,
.app-dialog-leave-to section {
  opacity: 0;
  transform: translateY(8px) scale(.98);
}
</style>
