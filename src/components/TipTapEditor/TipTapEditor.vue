<script setup lang="ts">
import TiptapToolbarGroup from "./TipTapToolbarGroup.vue";
import TiptapToolbarButton from "./TiptapToolbarButton.vue";
import { EditorContent, useEditor } from "@tiptap/vue-3";
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
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
import { WebsocketProvider } from "y-websocket";
import Collaboration from "@tiptap/extension-collaboration";
import CollaborationCaret from "@tiptap/extension-collaboration-caret";
import { Placeholder } from "@tiptap/extensions";
import { tiptapExtensions } from "@/utils/tiptap";

const model = defineModel<string>({
  required: true,
  default: "",
});

// ===== 配置 =====
const docId = "81263";
const wsServer = "ws://localhost:3892";
const roomName = "collab1";

// ===== 当前用户 =====
const randomColor = "#" + Math.floor(Math.random() * 16777215).toString(16);
const userName = ref(String(Math.floor(Math.random() * 2) + 2));
const userColor = ref(randomColor);
// const userInitial = computed(() =>
//     String(userName.value).charAt(0).toUpperCase(),
// );

// ===== Yjs =====
const yDoc = new Y.Doc();
const yFragment = yDoc.getXmlFragment("document");

const provider = new WebsocketProvider(wsServer, roomName, yDoc, {
  params: {
    docId,
    userId: String(userName.value),
  },
});

provider.awareness.setLocalStateField("user", {
  name: String(userName.value),
  color: userColor.value,
});

// ===== provider 事件 =====
provider.on("status", (event) => {
  console.log("provider status:", event.status);
  if (event.status === "disconnected") {
    console.error("连接断开，请检查服务端和 ws 地址");
  }
});

provider.on("sync", (synced: boolean) => {
  console.log("文档同步状态:", synced ? "已同步" : "同步中...");
});

provider.on("connection-error", (event) => {
  console.error("底层连接错误:", event);
});

// ===== 编辑器 =====
const editorInstance = useEditor({
  editorProps: {
    attributes: {
      class: "tiptap-prose",
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
      placeholder:
          "Write something … It’ll be shared with everyone else looking at this example.",
    }),
    ...tiptapExtensions(),
  ],
  onUpdate: ({ editor }) => {
    model.value = editor.getHTML();
    console.log("editor html updated");
  },
});

// ===== 调试监听 =====
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
  <div
      id="tiptap"
      class="divide-y divide-gray-400 rounded-md border border-gray-400 overflow-clip"
  >
    <div
        id="tiptap"
        class="divide-x divide-gray-400 sticky top-0 inset-x-0 bg-white z-1"
    >
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
            @click="
            editorInstance?.chain().focus().toggleHeading({ level: 1 }).run()
          "
        >
          <IconH1 class="h-5 w-5" />
        </TiptapToolbarButton>
        <TiptapToolbarButton
            label="Heading 2"
            :is-active="editorInstance?.isActive('heading', { level: 2 })"
            @click="
            editorInstance?.chain().focus().toggleHeading({ level: 2 }).run()
          "
        >
          <IconH2 class="h-5 w-5" />
        </TiptapToolbarButton>
        <TiptapToolbarButton
            label="Heading 3"
            :is-active="editorInstance?.isActive('heading', { level: 3 })"
            @click="
            editorInstance?.chain().focus().toggleHeading({ level: 3 }).run()
          "
        >
          <IconH3 class="h-5 w-5" />
        </TiptapToolbarButton>
        <TiptapToolbarButton
            label="Heading 4"
            :is-active="editorInstance?.isActive('heading', { level: 4 })"
            @click="
            editorInstance?.chain().focus().toggleHeading({ level: 4 }).run()
          "
        >
          <IconH4 class="h-5 w-5" />
        </TiptapToolbarButton>
        <TiptapToolbarButton
            label="Heading 5"
            :is-active="editorInstance?.isActive('heading', { level: 5 })"
            @click="
            editorInstance?.chain().focus().toggleHeading({ level: 5 }).run()
          "
        >
          <IconH5 class="h-5 w-5" />
        </TiptapToolbarButton>
        <TiptapToolbarButton
            label="Heading 6"
            :is-active="editorInstance?.isActive('heading', { level: 6 })"
            @click="
            editorInstance?.chain().focus().toggleHeading({ level: 6 }).run()
          "
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
        <!--      <TiptapToolbarButton-->
        <!--        label="Link"-->
        <!--        @click="openLinkDialog"-->
        <!--        :is-active="editorInstance?.isActive('link')"-->
        <!--      >-->
        <!--        <IconLink class="h-5 w-5" />-->
        <!--      </TiptapToolbarButton>-->
        <!--      <TiptapToolbarButton label="Image" @click="openImageDialog">-->
        <!--        <IconPhoto class="h-5 w-5" />-->
        <!--      </TiptapToolbarButton>-->
        <TiptapToolbarButton
            label="Blockquote"
            :is-active="editorInstance?.isActive('blockquote')"
            @click="editorInstance?.chain().focus().toggleBlockquote().run()"
        >
          <IconBlockquote class="h-5 w-5" />
        </TiptapToolbarButton>
        <!--      <TiptapToolbarButton label="Table" @click="openTableDialog">-->
        <!--        <IconTable class="h-5 w-5" />-->
        <!--      </TiptapToolbarButton>-->
        <!--      <TiptapToolbarButton label="Youtube" @click="openVideoDialog">-->
        <!--        <IconMovie class="h-5 w-5" />-->
        <!--      </TiptapToolbarButton>-->
        <TiptapToolbarButton
            @click="editorInstance?.chain().focus().setHorizontalRule().run()"
            label="Horizontal Line"
        >
          <IconMinus class="h-5 w-5" />
        </TiptapToolbarButton>
      </TiptapToolbarGroup>
      <TiptapToolbarGroup v-if="editorInstance?.isActive('table')">
        <TiptapToolbarButton
            @click="editorInstance?.commands.deleteTable()"
            label="Remove table"
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
            @click="editorInstance?.commands.addRowAfter()"
            label="Add row after"
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

      <div class="flex flex-col">
        <div class="max-h-[60vh] overflow-y-auto">
          <EditorContent :editor="editorInstance" class="editor-content"/>
        </div>

        <div
            class="mx-4 border-t border-gray-300 py-3 text-right text-sm text-gray-500"
        >
        </div>
      </div>

    </div>

    <div class="flex flex-col">
      <div class="max-h-[60vh] overflow-y-auto">
        <EditorContent :editor="editorInstance" />
      </div>

      <div
          class="mx-4 border-t border-gray-300 py-3 text-right text-sm text-gray-500"
      >
        {{ editorInstance?.storage.characterCount.characters() }} characters,
        {{ editorInstance?.storage.characterCount.words() }} words
      </div>
    </div>
  </div>
</template>

<style lang="scss">
@use "@/assets/css/tiptap.scss" as *;
</style>