<script setup lang="ts">
import TiptapToolbarGroup from "./TipTapToolbarGroup.vue";
import TiptapToolbarButton from "./TiptapToolbarButton.vue";
import { EditorContent, useEditor } from "@tiptap/vue-3";
import { onBeforeUnmount, onMounted, ref } from "vue";
import IconArrowBackUp from "~icons/tabler/arrow-back-up";
import IconArrowForwardUp from "~icons/tabler/arrow-forward-up";
import IconBlockquote from "~icons/tabler/blockquote";
import IconH1 from "~icons/tabler/h1";
import IconH2 from "~icons/tabler/h2";
import IconH3 from "~icons/tabler/h3";
import IconH4 from "~icons/tabler/h4";
import IconH5 from "~icons/tabler/h5";
import IconH6 from "~icons/tabler/h6";
import IconBold from "~icons/tabler/bold";
import IconItalic from "~icons/tabler/italic";
import IconStrikethrough from "~icons/tabler/strikethrough";
import IconUnderline from "~icons/tabler/underline";
import IconListDetails from "~icons/tabler/list-details";
import IconListNumbers from "~icons/tabler/list-numbers";
import IconMinus from "~icons/tabler/minus";
import IconTableRemove from "~icons/mdi/table-remove";
import IconTableColumnPlusBefore from "~icons/mdi/table-column-plus-before";
import IconTableColumnPlusAfter from "~icons/mdi/table-column-plus-after";
import IconTableColumnRemove from "~icons/mdi/table-column-remove";
import IconTableRowPlusAfter from "~icons/mdi/table-row-plus-after";
import IconTableRowPlusBefore from "~icons/mdi/table-row-plus-before";
import IconTableRowRemove from "~icons/mdi/table-row-remove";
import IconTableMergeCells from "~icons/mdi/table-merge-cells";

import * as Y from "yjs";
import Collaboration from "@tiptap/extension-collaboration";
import CollaborationCaret from "@tiptap/extension-collaboration-caret";
import { Placeholder } from "@tiptap/extensions";
import { createCollab1Provider } from "@/services/collab1";
import { tiptapExtensions } from "@/utils/tiptap";

const model = defineModel<string>({
  required: true,
  default: "",
});

const props = withDefaults(
  defineProps<{
    docId: string | number;
    userName?: string;
  }>(),
  {
    userName: "我",
  },
);

const docId = String(props.docId);
const wsServer = import.meta.env.VITE_YJS_WS_URL ?? "ws://localhost:3892";
const accessToken = localStorage.getItem("yjs_docs_access_token") ?? undefined;

const userName = ref(props.userName || "我");
const userColor = ref(`#${Math.floor(Math.random() * 16777215).toString(16).padStart(6, "0")}`);

const yDoc = new Y.Doc();
const yFragment = yDoc.getXmlFragment("document");
const provider = createCollab1Provider({
  baseWsUrl: wsServer,
  docId,
  accessToken,
  ydoc: yDoc,
  onStatus: (status) => {
    console.log("collab1 status:", status);
  },
  onConnectionError: (event) => {
    console.error("collab1 connection error:", event);
  },
  onClose: (event) => {
    console.warn("collab1 closed", { code: event.code, reason: event.reason });
  },
});

provider.awareness.setLocalStateField("user", {
  name: String(userName.value),
  color: userColor.value,
});

const editorInstance = useEditor({
  editable: true,
  editorProps: {
    attributes: {
      class: "tiptap tiptap-prose",
    },
  },
  extensions: [
    Collaboration.configure({
      document: yDoc,
      field: "document",
    }),
    CollaborationCaret.configure({
      provider,
      user: {
        name: String(userName.value),
        color: userColor.value,
      },
    }),
    Placeholder.configure({
      placeholder: "开始输入内容，在线成员会实时看到更新。",
    }),
    ...tiptapExtensions(),
  ],
  onUpdate: ({ editor }) => {
    model.value = editor.getHTML();
  },
});

const handleYDocUpdate = (update: Uint8Array, origin: unknown) => {
  console.log("yDoc update", {
    byteLength: update.byteLength,
    origin,
  });
};

const handleFragmentChange = () => {
  console.log("yFragment changed");
};

onMounted(() => {
  yDoc.on("update", handleYDocUpdate);
  yFragment.observeDeep(handleFragmentChange);
});

onBeforeUnmount(() => {
  yDoc.off("update", handleYDocUpdate);
  yFragment.unobserveDeep(handleFragmentChange);
  editorInstance.value?.destroy();
  provider.destroy();
  yDoc.destroy();
});
</script>

<template>
  <div class="rounded-lg border border-slate-200 bg-white shadow-sm">
    <div class="sticky top-[65px] z-20 rounded-t-lg border-b border-slate-200 bg-white/95 backdrop-blur">
      <div class="flex flex-wrap items-center divide-x divide-slate-200 px-2 py-1">
        <TiptapToolbarGroup>
          <TiptapToolbarButton
            label="Undo"
            @click="editorInstance?.chain().focus().undo().run()"
            :disabled="!editorInstance?.can().chain().focus().undo().run()"
          >
            <IconArrowBackUp class="h-5 w-5" />
          </TiptapToolbarButton>
          <TiptapToolbarButton
            label="Redo"
            @click="editorInstance?.chain().focus().redo().run()"
            :disabled="!editorInstance?.can().chain().focus().redo().run()"
          >
            <IconArrowForwardUp class="h-5 w-5" />
          </TiptapToolbarButton>
        </TiptapToolbarGroup>
        <TiptapToolbarGroup>
          <TiptapToolbarButton
            label="Heading 1"
            :is-active="editorInstance?.isActive('heading', { level: 1 })"
            @click="editorInstance?.chain().focus().toggleHeading({ level: 1 }).run()"
          >
            <IconH1 class="h-5 w-5" />
          </TiptapToolbarButton>
          <TiptapToolbarButton
            label="Heading 2"
            :is-active="editorInstance?.isActive('heading', { level: 2 })"
            @click="editorInstance?.chain().focus().toggleHeading({ level: 2 }).run()"
          >
            <IconH2 class="h-5 w-5" />
          </TiptapToolbarButton>
          <TiptapToolbarButton
            label="Heading 3"
            :is-active="editorInstance?.isActive('heading', { level: 3 })"
            @click="editorInstance?.chain().focus().toggleHeading({ level: 3 }).run()"
          >
            <IconH3 class="h-5 w-5" />
          </TiptapToolbarButton>
          <TiptapToolbarButton
            label="Heading 4"
            :is-active="editorInstance?.isActive('heading', { level: 4 })"
            @click="editorInstance?.chain().focus().toggleHeading({ level: 4 }).run()"
          >
            <IconH4 class="h-5 w-5" />
          </TiptapToolbarButton>
          <TiptapToolbarButton
            label="Heading 5"
            :is-active="editorInstance?.isActive('heading', { level: 5 })"
            @click="editorInstance?.chain().focus().toggleHeading({ level: 5 }).run()"
          >
            <IconH5 class="h-5 w-5" />
          </TiptapToolbarButton>
          <TiptapToolbarButton
            label="Heading 6"
            :is-active="editorInstance?.isActive('heading', { level: 6 })"
            @click="editorInstance?.chain().focus().toggleHeading({ level: 6 }).run()"
          >
            <IconH6 class="h-5 w-5" />
          </TiptapToolbarButton>
        </TiptapToolbarGroup>
        <TiptapToolbarGroup>
          <TiptapToolbarButton
            label="Bold"
            :is-active="editorInstance?.isActive('bold')"
            @click="editorInstance?.chain().focus().toggleBold().run()"
          >
            <IconBold class="h-5 w-5" />
          </TiptapToolbarButton>
          <TiptapToolbarButton
            label="Italic"
            :is-active="editorInstance?.isActive('italic')"
            @click="editorInstance?.chain().focus().toggleItalic().run()"
          >
            <IconItalic class="h-5 w-5" />
          </TiptapToolbarButton>
          <TiptapToolbarButton
            label="Underline"
            :is-active="editorInstance?.isActive('underline')"
            @click="editorInstance?.chain().focus().toggleUnderline().run()"
          >
            <IconUnderline class="h-5 w-5" />
          </TiptapToolbarButton>
          <TiptapToolbarButton
            label="Strikethrough"
            :is-active="editorInstance?.isActive('strike')"
            @click="editorInstance?.chain().focus().toggleStrike().run()"
          >
            <IconStrikethrough class="h-5 w-5" />
          </TiptapToolbarButton>
        </TiptapToolbarGroup>
        <TiptapToolbarGroup>
          <TiptapToolbarButton
            label="Unordered List"
            :is-active="editorInstance?.isActive('bulletList')"
            @click="editorInstance?.chain().focus().toggleBulletList().run()"
          >
            <IconListDetails class="h-5 w-5" />
          </TiptapToolbarButton>
          <TiptapToolbarButton
            label="Ordered List"
            :is-active="editorInstance?.isActive('orderedList')"
            @click="editorInstance?.chain().focus().toggleOrderedList().run()"
          >
            <IconListNumbers class="h-5 w-5" />
          </TiptapToolbarButton>
        </TiptapToolbarGroup>
        <TiptapToolbarGroup>
          <TiptapToolbarButton
            label="Blockquote"
            :is-active="editorInstance?.isActive('blockquote')"
            @click="editorInstance?.chain().focus().toggleBlockquote().run()"
          >
            <IconBlockquote class="h-5 w-5" />
          </TiptapToolbarButton>
          <TiptapToolbarButton
            label="Horizontal Line"
            @click="editorInstance?.chain().focus().setHorizontalRule().run()"
          >
            <IconMinus class="h-5 w-5" />
          </TiptapToolbarButton>
        </TiptapToolbarGroup>
        <TiptapToolbarGroup v-if="editorInstance?.isActive('table')">
          <TiptapToolbarButton
            label="Remove table"
            @click="editorInstance?.commands.deleteTable()"
          >
            <IconTableRemove class="h-5 w-5" />
          </TiptapToolbarButton>
          <TiptapToolbarButton
            label="Add column before"
            @click="editorInstance?.commands.addColumnBefore()"
          >
            <IconTableColumnPlusBefore class="h-5 w-5" />
          </TiptapToolbarButton>
          <TiptapToolbarButton
            label="Add column after"
            @click="editorInstance?.commands.addColumnAfter()"
          >
            <IconTableColumnPlusAfter class="h-5 w-5" />
          </TiptapToolbarButton>
          <TiptapToolbarButton
            label="Remove column"
            @click="editorInstance?.commands.deleteColumn()"
          >
            <IconTableColumnRemove class="h-5 w-5" />
          </TiptapToolbarButton>
          <TiptapToolbarButton
            label="Add row before"
            @click="editorInstance?.commands.addRowBefore()"
          >
            <IconTableRowPlusBefore class="h-5 w-5" />
          </TiptapToolbarButton>
          <TiptapToolbarButton
            label="Add row after"
            @click="editorInstance?.commands.addRowAfter()"
          >
            <IconTableRowPlusAfter class="h-5 w-5" />
          </TiptapToolbarButton>
          <TiptapToolbarButton
            label="Remove row"
            @click="editorInstance?.commands.deleteRow()"
          >
            <IconTableRowRemove class="h-5 w-5" />
          </TiptapToolbarButton>
          <TiptapToolbarButton
            label="Merge or split cell"
            @click="editorInstance?.commands.mergeOrSplit()"
          >
            <IconTableMergeCells class="h-5 w-5" />
          </TiptapToolbarButton>
        </TiptapToolbarGroup>
      </div>
    </div>

    <div class="flex min-h-[calc(100vh-180px)] flex-col">
      <div class="flex-1 overflow-y-auto bg-white">
        <EditorContent :editor="editorInstance" />
      </div>

      <div class="border-t border-slate-200 bg-slate-50 px-5 py-3 text-right text-sm text-slate-500">
        {{ editorInstance?.storage.characterCount.characters() }} 字,
        {{ editorInstance?.storage.characterCount.words() }} words
      </div>
    </div>
  </div>
</template>

<style lang="scss">
@use "@/assets/css/tiptap.scss" as *;
</style>
