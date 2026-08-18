<script setup lang="ts">
import TiptapToolbarGroup from "./TipTapToolbarGroup.vue";
import TiptapToolbarButton from "./TiptapToolbarButton.vue";
import AppDialog from "@/components/Common/AppDialog.vue";
import { EditorContent, useEditor, type Editor } from "@tiptap/vue-3";
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from "vue";
import { CollaborationBlock, VideoBlock } from "./editorBlocks";
import { CommentMark } from "./commentMark";
import { filterSlashCommands, type SlashCommandItem } from "./slashCommands";
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
import IconMessageCirclePlus from "~icons/tabler/message-circle-plus";
import IconMessageCircle from "~icons/tabler/message-circle";
import IconSend from "~icons/tabler/send";
import IconX from "~icons/tabler/x";

import * as Y from "yjs";
import Collaboration from "@tiptap/extension-collaboration";
import CollaborationCaret from "@tiptap/extension-collaboration-caret";
import { Placeholder } from "@tiptap/extensions";
import { createCollab1Provider, type CollabStatus, type OnlineUsersChangedEvent } from "@/services/collab1";
import { getAccessToken } from "@/services/api";
import { collabApi } from "@/services/collabFeatures";
import type { FeatureEvent } from "@/services/collabFeatures";
import { useFeatureSocket } from "@/composables/useFeatureSocket";
import type { ChatMessage, ChatRoom, ResourceId } from "@/types/collab-features";
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
    userName: "用户",
  },
);

const emit = defineEmits<{
  (event: "collab-connected"): void;
  (event: "online-users-changed", payload: OnlineUsersChangedEvent): void;
}>();

const docId = String(props.docId);
const getDefaultWsServer = () => {
  if (import.meta.env.DEV) {
    return "ws://localhost:3892";
  }

  const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${wsProtocol}//${window.location.host}`;
};

const wsServer = import.meta.env.VITE_YJS_WS_URL || getDefaultWsServer();
const accessToken = getAccessToken() ?? undefined;

const userName = ref(props.userName || "用户");
const userColor = ref(`#${Math.floor(Math.random() * 16777215).toString(16).padStart(6, "0")}`);
const connectionStatus = ref<CollabStatus>("connecting");
const isSlowConnection = ref(false);
const connectionMessage = ref("正在连接协作服务...");
const slowConnectionTimer = window.setTimeout(() => {
  if (connectionStatus.value === "connecting") {
    isSlowConnection.value = true;
    connectionMessage.value = "网络较慢，正在等待协作服务响应...";
  }
}, 5000);

const clearSlowConnectionTimer = () => {
  window.clearTimeout(slowConnectionTimer);
};

const connectionStatusText = computed(() => {
  if (connectionStatus.value === "connected") {
    return "协作已连接";
  }

  if (connectionStatus.value === "disconnected") {
    return "协作连接已断开";
  }

  return isSlowConnection.value ? "连接较慢" : "正在连接";
});

const connectionStatusClass = computed(() => {
  if (connectionStatus.value === "connected") {
    return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  }

  if (connectionStatus.value === "disconnected") {
    return "bg-rose-50 text-rose-700 ring-rose-200";
  }

  return isSlowConnection.value ? "bg-amber-50 text-amber-700 ring-amber-200" : "bg-sky-50 text-sky-700 ring-sky-200";
});

const reconnectCollab = () => {
  window.location.reload();
};

type CommentMode = "create" | "thread";
type CommentRange = { from: number; to: number };
type CommentAnchor = {
  commentId: ResourceId;
  quotedText: string;
  commentText?: string;
  author?: string;
  createdAt?: string;
};

const hasTextSelection = ref(false);
const commentDialogOpen = ref(false);
const commentMode = ref<CommentMode>("create");
const pendingCommentRange = ref<CommentRange | null>(null);
const commentQuotedText = ref("");
const commentDraft = ref("");
const replyDraft = ref("");
const commentError = ref("");
const commentSaving = ref(false);
const commentThreadLoading = ref(false);
const activeCommentId = ref<ResourceId | null>(null);
const commentMessages = ref<ChatMessage[]>([]);
const commentRoom = ref<ChatRoom | null>(null);
const { status: commentSocketStatus, connect: connectCommentSocket, send: sendCommentEvent } = useFeatureSocket();

const messageAuthor = (message: ChatMessage) => (
  message.author?.name
  || message.author?.username
  || message.author?.account
  || message.user?.name
  || message.user?.username
  || message.user?.account
  || message.username
  || message.account
  || props.userName
  || "协作者"
);

const formatCommentTime = (value?: string) => {
  if (!value) return "刚刚";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
};

const upsertCommentMessage = (message: ChatMessage) => {
  const index = commentMessages.value.findIndex((item) => String(item.id) === String(message.id));
  if (index >= 0) commentMessages.value.splice(index, 1, message);
  else commentMessages.value.push(message);
};

const handleCommentEvent = (event: FeatureEvent) => {
  const message = event.message as ChatMessage | undefined;
  if (!message || event.type !== "new_message" || activeCommentId.value == null) return;
  if (
    String(message.id) === String(activeCommentId.value)
    || String(message.parentId) === String(activeCommentId.value)
  ) {
    upsertCommentMessage(message);
  }
};

const ensureCommentRoom = async () => {
  if (commentRoom.value) return commentRoom.value;
  const room = await collabApi.getOrCreateChatRoom(docId);
  commentRoom.value = room;
  connectCommentSocket("chat", room.id, handleCommentEvent, () => {
    if (activeCommentId.value != null) void loadCommentThread(activeCommentId.value);
  });
  return room;
};

const closeCommentDialog = () => {
  commentDialogOpen.value = false;
  commentError.value = "";
  replyDraft.value = "";
  if (commentMode.value === "create") pendingCommentRange.value = null;
};

const openCreateComment = () => {
  const editor = editorInstance.value;
  if (!editor) return;
  const { selection } = editor.state;
  const quotedText = editor.state.doc.textBetween(selection.from, selection.to, " ").trim();
  if (selection.empty || !quotedText) return;

  pendingCommentRange.value = { from: selection.from, to: selection.to };
  commentQuotedText.value = quotedText;
  commentDraft.value = "";
  commentError.value = "";
  commentMode.value = "create";
  activeCommentId.value = null;
  commentMessages.value = [];
  commentDialogOpen.value = true;
  closeSlashMenu();
};

const fallbackRootMessage = (anchor: CommentAnchor): ChatMessage => ({
  id: anchor.commentId,
  content: anchor.commentText || "备注内容暂未加载",
  username: anchor.author,
  createdAt: anchor.createdAt,
});

async function loadCommentThread(commentId: ResourceId, fallback?: CommentAnchor) {
  commentThreadLoading.value = true;
  commentError.value = "";
  try {
    await ensureCommentRoom();
    const thread = await collabApi.getChatThread(commentId);
    commentQuotedText.value = thread.message.quotedText || commentQuotedText.value;
    commentMessages.value = [thread.message, ...thread.replies];
  } catch (error) {
    if (fallback) commentMessages.value = [fallbackRootMessage(fallback)];
    commentError.value = error instanceof Error ? error.message : "备注加载失败，请稍后重试";
  } finally {
    commentThreadLoading.value = false;
  }
}

const openCommentThread = (anchor: CommentAnchor) => {
  activeCommentId.value = anchor.commentId;
  commentQuotedText.value = anchor.quotedText;
  commentMessages.value = [];
  commentMode.value = "thread";
  commentError.value = "";
  commentDialogOpen.value = true;
  void loadCommentThread(anchor.commentId, anchor);
};

const createComment = async () => {
  const editor = editorInstance.value;
  const range = pendingCommentRange.value;
  const content = commentDraft.value.trim();
  if (!editor || !range || !content || commentSaving.value) return;

  const currentQuotedText = editor.state.doc.textBetween(range.from, range.to, " ").trim();
  if (currentQuotedText !== commentQuotedText.value) {
    commentError.value = "选中的内容已被修改，请关闭弹窗后重新选择文字";
    return;
  }

  commentSaving.value = true;
  commentError.value = "";
  try {
    await ensureCommentRoom();
    const message = await collabApi.createInlineComment(docId, {
      content,
      quotedText: commentQuotedText.value,
      mentions: [],
    });
    const createdAt = message.createdAt || new Date().toISOString();
    const applied = editor.chain()
      .focus()
      .setTextSelection(range)
      .setMark("commentMark", {
        commentId: message.id,
        quotedText: commentQuotedText.value,
        commentText: message.content,
        author: messageAuthor(message),
        createdAt,
      })
      .setTextSelection(range.to)
      .unsetMark("commentMark")
      .run();
    if (!applied) throw new Error("选中的内容已发生变化，请重新选择后添加备注");

    sendCommentEvent({ type: "new_message", message });
    activeCommentId.value = message.id;
    commentMessages.value = [{ ...message, createdAt }];
    commentMode.value = "thread";
    pendingCommentRange.value = null;
    commentDraft.value = "";
  } catch (error) {
    commentError.value = error instanceof Error ? error.message : "备注创建失败，请稍后重试";
  } finally {
    commentSaving.value = false;
  }
};

const sendCommentReply = async () => {
  const content = replyDraft.value.trim();
  const parentId = activeCommentId.value;
  if (!content || parentId == null || commentSaving.value) return;

  commentSaving.value = true;
  commentError.value = "";
  try {
    await ensureCommentRoom();
    const message = await collabApi.sendChatMessage(docId, { content, parentId, mentions: [] });
    upsertCommentMessage(message);
    sendCommentEvent({ type: "new_message", message });
    replyDraft.value = "";
  } catch (error) {
    commentError.value = error instanceof Error ? error.message : "回复发送失败，请稍后重试";
  } finally {
    commentSaving.value = false;
  }
};

type SlashMenuState = {
  query: string;
  range: { from: number; to: number };
  left: number;
  top: number;
};
type SlashMenuEditor = Pick<Editor, "state" | "view">;
type TableInsertDialogState = {
  range: { from: number; to: number };
  rows: number;
  cols: number;
  withHeaderRow: boolean;
};
type MediaInsertDialogState = {
  kind: "image" | "video";
  range: { from: number; to: number };
  src: string;
  error: string;
};
type NoticeDialogState = {
  title: string;
  message: string;
};

const slashMenu = ref<SlashMenuState | null>(null);
const slashSelectedIndex = ref(0);
const tableInsertDialog = ref<TableInsertDialogState | null>(null);
const mediaInsertDialog = ref<MediaInsertDialogState | null>(null);
const noticeDialog = ref<NoticeDialogState | null>(null);
const filteredSlashCommands = computed(() => filterSlashCommands(slashMenu.value?.query ?? ""));
const TABLE_SIZE_MIN = 1;
const TABLE_SIZE_MAX = 20;

const closeSlashMenu = () => {
  slashMenu.value = null;
  slashSelectedIndex.value = 0;
};

const openTableInsertDialog = (range: { from: number; to: number }) => {
  tableInsertDialog.value = {
    range: { ...range },
    rows: 3,
    cols: 3,
    withHeaderRow: true,
  };
  closeSlashMenu();
};

const closeTableInsertDialog = () => {
  tableInsertDialog.value = null;
};

const openMediaInsertDialog = (kind: MediaInsertDialogState["kind"], range: { from: number; to: number }) => {
  mediaInsertDialog.value = { kind, range: { ...range }, src: "", error: "" };
  closeSlashMenu();
};

const closeMediaInsertDialog = () => {
  mediaInsertDialog.value = null;
};

const insertMedia = () => {
  const editor = editorInstance.value;
  const dialog = mediaInsertDialog.value;
  if (!editor || !dialog) return;

  const src = dialog.src.trim();
  if (!src) {
    dialog.error = `请输入${dialog.kind === "image" ? "图片" : "视频"}地址`;
    return;
  }

  if (dialog.kind === "image") {
    editor.chain().focus().deleteRange(dialog.range).setImage({ src }).run();
  } else {
    editor.chain().focus().deleteRange(dialog.range).insertContent([
      { type: "videoBlock", attrs: { src, title: "视频" } },
      { type: "paragraph" },
    ]).run();
  }
  closeMediaInsertDialog();
};

const normalizeTableSize = (value: number) => {
  const integer = Number.isFinite(value) ? Math.round(value) : TABLE_SIZE_MIN;
  return Math.min(TABLE_SIZE_MAX, Math.max(TABLE_SIZE_MIN, integer));
};

const insertConfiguredTable = () => {
  const editor = editorInstance.value;
  const config = tableInsertDialog.value;
  if (!editor || !config) return;

  const rows = normalizeTableSize(config.rows);
  const cols = normalizeTableSize(config.cols);
  const inserted = editor.chain()
    .focus()
    .deleteRange(config.range)
    .insertTable({ rows, cols, withHeaderRow: config.withHeaderRow })
    .run();

  if (inserted) closeTableInsertDialog();
};

const deleteActiveTable = () => {
  editorInstance.value?.chain().focus().deleteTable().run();
};

const updateSlashMenu = (editor: SlashMenuEditor) => {
  const { selection } = editor.state;
  if (!selection.empty || !selection.$from.parent.isTextblock) {
    closeSlashMenu();
    return;
  }

  const parentOffset = selection.$from.parentOffset;
  const textBefore = selection.$from.parent.textBetween(0, parentOffset, "\n", "\0");
  const match = /(?:^|\s)\/([a-zA-Z0-9-]*)$/.exec(textBefore);

  if (!match) {
    closeSlashMenu();
    return;
  }

  const matchedText = match[0];
  const slashOffset = matchedText.lastIndexOf("/");
  const from = selection.$from.start() + (match.index ?? 0) + slashOffset;
  const previousQuery = slashMenu.value?.query;

  try {
    const coords = editor.view.coordsAtPos(selection.from);
    const menuWidth = 390;
    const estimatedHeight = 430;
    const left = Math.max(12, Math.min(coords.left, window.innerWidth - menuWidth - 12));
    const top = window.innerHeight - coords.bottom >= 300
      ? coords.bottom + 8
      : Math.max(12, coords.top - estimatedHeight - 8);

    slashMenu.value = {
      query: match[1] ?? "",
      range: { from, to: selection.from },
      left,
      top,
    };

    if (previousQuery !== slashMenu.value.query) slashSelectedIndex.value = 0;
  } catch {
    closeSlashMenu();
  }
};

const collaborationFeature: Partial<Record<SlashCommandItem["id"], string>> = {
  whiteboard: "whiteboard",
  taskBoard: "task-board",
  spreadsheet: "spreadsheet",
  media: "media",
};

const executeSlashCommand = async (item: SlashCommandItem) => {
  const editor = editorInstance.value;
  const menu = slashMenu.value;
  if (!editor || !menu) return;

  if (item.id === "image") {
    openMediaInsertDialog("image", menu.range);
    return;
  }

  if (item.id === "video") {
    openMediaInsertDialog("video", menu.range);
    return;
  }

  const feature = collaborationFeature[item.id];
  if (feature) {
    let resourceId: string | number | undefined;
    try {
      if (item.id === "whiteboard") resourceId = (await collabApi.createWhiteboard(docId)).id;
      else if (item.id === "taskBoard") resourceId = (await collabApi.createTaskBoard(docId)).id;
      else if (item.id === "spreadsheet") resourceId = (await collabApi.createSpreadsheet(docId)).id;
    } catch (error) {
      noticeDialog.value = {
        title: "创建失败",
        message: error instanceof Error ? error.message : "创建协作内容失败，请稍后重试",
      };
      return;
    }
    editor.chain().focus().deleteRange(menu.range).insertContent([
      {
        type: "collaborationBlock",
        attrs: { feature, documentId: docId, resourceId, title: item.label },
      },
      { type: "paragraph" },
    ]).run();
    closeSlashMenu();
    return;
  }

  const chain = editor.chain().focus().deleteRange(menu.range);
  if (item.id === "paragraph") chain.setParagraph().run();
  else if (item.id === "heading1") chain.setHeading({ level: 1 }).run();
  else if (item.id === "heading2") chain.setHeading({ level: 2 }).run();
  else if (item.id === "heading3") chain.setHeading({ level: 3 }).run();
  else if (item.id === "bulletList") chain.toggleBulletList().run();
  else if (item.id === "orderedList") chain.toggleOrderedList().run();
  else if (item.id === "blockquote") chain.toggleBlockquote().run();
  else if (item.id === "codeBlock") chain.toggleCodeBlock().run();
  else if (item.id === "divider") chain.setHorizontalRule().run();
  else if (item.id === "table") {
    openTableInsertDialog(menu.range);
    return;
  }
  closeSlashMenu();
};

const handleSlashMenuKeyDown = (event: KeyboardEvent) => {
  if (!slashMenu.value) return false;
  const items = filteredSlashCommands.value;

  if (event.key === "Escape") {
    event.preventDefault();
    closeSlashMenu();
    return true;
  }

  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    event.preventDefault();
    if (!items.length) return true;
    const direction = event.key === "ArrowDown" ? 1 : -1;
    slashSelectedIndex.value = (slashSelectedIndex.value + direction + items.length) % items.length;
    void nextTick(() => {
      document.getElementById(`slash-command-${items[slashSelectedIndex.value]?.id}`)?.scrollIntoView({ block: "nearest" });
    });
    return true;
  }

  if (event.key === "Enter") {
    event.preventDefault();
    const item = items[slashSelectedIndex.value];
    if (item) void executeSlashCommand(item);
    return true;
  }

  return false;
};

const yDoc = new Y.Doc();
const yFragment = yDoc.getXmlFragment("document");
const provider = createCollab1Provider({
  baseWsUrl: wsServer,
  docId,
  accessToken,
  enablePresence: true,
  ydoc: yDoc,
  onStatus: (status) => {
    connectionStatus.value = status;

    if (status === "connected") {
      clearSlowConnectionTimer();
      isSlowConnection.value = false;
      connectionMessage.value = "多人协作已连接，内容会实时同步。";
      emit("collab-connected");
      return;
    }

    if (status === "disconnected") {
      clearSlowConnectionTimer();
      isSlowConnection.value = false;
      connectionMessage.value = "协作服务连接已断开，请检查网络后重新连接。";
      return;
    }

    connectionMessage.value = "正在连接协作服务...";
  },
  onPresence: (event) => {
    emit("online-users-changed", event);
  },
  onConnectionError: (event) => {
    isSlowConnection.value = false;
    connectionMessage.value = "协作服务连接失败，请检查网络或稍后重试。";
    console.error("collab1 connection error:", event);
  },
  onClose: (event) => {
    connectionStatus.value = "disconnected";
    connectionMessage.value = event.reason
      ? `协作连接已断开：${event.reason}`
      : "协作连接已断开，请检查网络后重新连接。";
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
    handleKeyDown: (_view, event) => handleSlashMenuKeyDown(event),
    handleClick: (_view, _position, event) => {
      const target = event.target;
      if (!(target instanceof Element)) return false;
      const mark = target.closest<HTMLElement>("[data-comment-id]");
      const commentId = mark?.dataset.commentId;
      if (!mark || !commentId) return false;

      event.preventDefault();
      openCommentThread({
        commentId,
        quotedText: mark.dataset.quotedText || mark.textContent || "",
        commentText: mark.dataset.commentText,
        author: mark.dataset.commentAuthor,
        createdAt: mark.dataset.commentCreatedAt,
      });
      return true;
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
      placeholder: "开始输入内容，或输入 / 插入内容块。",
    }),
    CommentMark,
    CollaborationBlock,
    VideoBlock,
    ...tiptapExtensions(),
  ],
  onUpdate: ({ editor }) => {
    model.value = editor.getHTML();
    updateSlashMenu(editor);
  },
  onSelectionUpdate: ({ editor }) => {
    updateSlashMenu(editor);
    const { selection } = editor.state;
    hasTextSelection.value = !selection.empty
      && selection.$from.parent.isTextblock
      && selection.$to.parent.isTextblock;
  },
  onBlur: () => window.setTimeout(() => closeSlashMenu(), 120),
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
  clearSlowConnectionTimer();
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
          <button
            type="button"
            class="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-sm font-medium text-rose-700 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:bg-transparent disabled:text-slate-300"
            :disabled="!hasTextSelection"
            aria-label="为选中的文字添加备注"
            title="先选中文字，再添加备注"
            @mousedown.prevent
            @click="openCreateComment"
          >
            <IconMessageCirclePlus class="h-4 w-4" />
            备注
          </button>
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
          <button
            type="button"
            class="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md bg-rose-50 px-2.5 text-sm font-semibold text-rose-700 transition hover:bg-rose-100"
            title="删除整张表格"
            aria-label="删除整张表格"
            @mousedown.prevent
            @click="deleteActiveTable"
          >
            <IconTableRemove class="h-4 w-4" />
            删除表格
          </button>
          <TiptapToolbarButton
            label="在左侧添加列"
            @click="editorInstance?.chain().focus().addColumnBefore().run()"
          >
            <IconTableColumnPlusBefore class="h-5 w-5" />
          </TiptapToolbarButton>
          <TiptapToolbarButton
            label="在右侧添加列"
            @click="editorInstance?.chain().focus().addColumnAfter().run()"
          >
            <IconTableColumnPlusAfter class="h-5 w-5" />
          </TiptapToolbarButton>
          <TiptapToolbarButton
            label="删除当前列"
            @click="editorInstance?.chain().focus().deleteColumn().run()"
          >
            <IconTableColumnRemove class="h-5 w-5" />
          </TiptapToolbarButton>
          <TiptapToolbarButton
            label="在上方添加行"
            @click="editorInstance?.chain().focus().addRowBefore().run()"
          >
            <IconTableRowPlusBefore class="h-5 w-5" />
          </TiptapToolbarButton>
          <TiptapToolbarButton
            label="在下方添加行"
            @click="editorInstance?.chain().focus().addRowAfter().run()"
          >
            <IconTableRowPlusAfter class="h-5 w-5" />
          </TiptapToolbarButton>
          <TiptapToolbarButton
            label="删除当前行"
            @click="editorInstance?.chain().focus().deleteRow().run()"
          >
            <IconTableRowRemove class="h-5 w-5" />
          </TiptapToolbarButton>
          <TiptapToolbarButton
            label="合并或拆分单元格"
            @click="editorInstance?.chain().focus().mergeOrSplit().run()"
          >
            <IconTableMergeCells class="h-5 w-5" />
          </TiptapToolbarButton>
        </TiptapToolbarGroup>
      </div>
      <div class="flex flex-col gap-2 border-t border-slate-100 px-4 py-2 text-sm sm:flex-row sm:items-center sm:justify-between">
        <div class="flex min-w-0 items-center gap-2">
          <span :class="['shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ring-1', connectionStatusClass]">
            {{ connectionStatusText }}
          </span>
          <span class="truncate text-slate-500">{{ connectionMessage }}</span>
        </div>
        <button
          v-if="connectionStatus === 'disconnected'"
          type="button"
          class="h-8 shrink-0 rounded-md bg-slate-950 px-3 text-xs font-semibold text-white transition hover:bg-slate-800"
          @click="reconnectCollab"
        >
          重新连接
        </button>
      </div>
    </div>

    <div class="flex min-h-[calc(100vh-180px)] flex-col">
      <div class="flex-1 overflow-y-auto bg-white">
        <EditorContent :editor="editorInstance" />
      </div>

      <div class="border-t border-slate-200 bg-slate-50 px-5 py-3 text-right text-sm text-slate-500">
        {{ editorInstance?.storage.characterCount.characters() }} 字
        {{ editorInstance?.storage.characterCount.words() }} words
      </div>
    </div>
  </div>

  <Teleport to="body">
    <div
      v-if="slashMenu"
      class="fixed z-[100] w-[min(390px,calc(100vw-24px))] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-slate-950/15"
      :style="{ left: `${slashMenu.left}px`, top: `${slashMenu.top}px` }"
      role="listbox"
      aria-label="插入内容块"
      @mousedown.prevent
    >
      <div class="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <div>
          <p class="text-sm font-semibold text-slate-900">插入内容块</p>
          <p class="mt-0.5 text-[11px] text-slate-400">输入英文指令筛选，Enter 插入</p>
        </div>
        <kbd class="rounded-md bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-500">ESC</kbd>
      </div>

      <div class="max-h-[360px] overflow-y-auto p-2">
        <div v-if="filteredSlashCommands.length" class="space-y-1">
          <button
            v-for="(item, index) in filteredSlashCommands"
            :key="item.id"
            :id="`slash-command-${item.id}`"
            type="button"
            role="option"
            :aria-selected="index === slashSelectedIndex"
            :class="['flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition', index === slashSelectedIndex ? 'bg-sky-50 text-sky-900' : 'text-slate-700 hover:bg-slate-50']"
            @mouseenter="slashSelectedIndex = index"
            @mousedown.prevent="executeSlashCommand(item)"
          >
            <span :class="['grid h-10 w-10 shrink-0 place-items-center rounded-xl text-xs font-bold', index === slashSelectedIndex ? 'bg-sky-600 text-white shadow-sm' : 'bg-slate-100 text-slate-600']">{{ item.badge }}</span>
            <span class="min-w-0 flex-1">
              <span class="flex min-w-0 items-baseline gap-2">
                <strong class="truncate text-sm">{{ item.label }}</strong>
                <span class="truncate text-xs text-slate-400">{{ item.englishName }}</span>
              </span>
              <span class="mt-0.5 block truncate text-[11px] text-slate-400">{{ item.description }}</span>
            </span>
            <span class="shrink-0 text-right">
              <code class="block rounded-md bg-white px-2 py-1 text-[11px] font-semibold text-sky-700 ring-1 ring-slate-200">/{{ item.command }}</code>
              <span class="mt-1 block text-[10px] text-slate-400">/{{ item.aliases[0] }}</span>
            </span>
          </button>
        </div>
        <div v-else class="px-4 py-8 text-center">
          <p class="text-sm font-medium text-slate-600">没有匹配的指令</p>
          <p class="mt-1 text-xs text-slate-400">试试 /h1、/table 或 /whiteboard</p>
        </div>
      </div>
      <div class="flex items-center gap-3 border-t border-slate-100 bg-slate-50 px-4 py-2 text-[10px] text-slate-400">
        <span>↑↓ 选择</span><span>Enter 插入</span><span>Esc 关闭</span>
      </div>
    </div>
  </Teleport>

  <AppDialog
    :open="mediaInsertDialog !== null"
    :title="mediaInsertDialog?.kind === 'video' ? '插入视频' : '插入图片'"
    :description="mediaInsertDialog?.kind === 'video' ? '粘贴浏览器可播放的视频地址，推荐 MP4 或 WebM 格式' : '粘贴公开可访问的图片地址'"
    max-width="md"
    @close="closeMediaInsertDialog"
  >
    <template #icon>
      <span class="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-sky-50 text-xs font-bold text-sky-700">
        {{ mediaInsertDialog?.kind === 'video' ? 'VID' : 'IMG' }}
      </span>
    </template>

    <label v-if="mediaInsertDialog" class="block text-sm font-semibold text-slate-700">
      {{ mediaInsertDialog.kind === 'video' ? '视频地址' : '图片地址' }}
      <input
        v-model="mediaInsertDialog.src"
        autofocus
        type="text"
        inputmode="url"
        autocomplete="off"
        class="mt-2 h-11 w-full rounded-xl border border-slate-200 px-3.5 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
        :placeholder="mediaInsertDialog.kind === 'video' ? 'https://example.com/video.mp4' : 'https://example.com/image.png'"
        @input="mediaInsertDialog.error = ''"
        @keydown.enter.prevent="insertMedia"
      />
    </label>
    <p v-if="mediaInsertDialog?.error" class="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
      {{ mediaInsertDialog.error }}
    </p>
    <p class="mt-3 text-xs leading-5 text-slate-400">确认后会在当前斜杠命令的位置插入内容块。</p>

    <template #footer>
      <div class="flex justify-end gap-2">
        <button type="button" class="h-9 rounded-lg px-4 text-sm font-medium text-slate-600 transition hover:bg-slate-200" @click="closeMediaInsertDialog">取消</button>
        <button type="button" class="h-9 rounded-lg bg-sky-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-700" @click="insertMedia">
          {{ mediaInsertDialog?.kind === 'video' ? '插入视频' : '插入图片' }}
        </button>
      </div>
    </template>
  </AppDialog>

  <AppDialog
    :open="noticeDialog !== null"
    :title="noticeDialog?.title ?? '提示'"
    description="操作未能完成，请检查后重试"
    max-width="sm"
    @close="noticeDialog = null"
  >
    <template #icon>
      <span class="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-rose-50 text-lg font-bold text-rose-600">!</span>
    </template>
    <p class="text-sm leading-6 text-slate-600">{{ noticeDialog?.message }}</p>
    <template #footer>
      <div class="flex justify-end">
        <button type="button" class="h-9 rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800" @click="noticeDialog = null">我知道了</button>
      </div>
    </template>
  </AppDialog>

  <Teleport to="body">
    <div
      v-if="tableInsertDialog"
      class="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/25 p-4 backdrop-blur-[1px]"
      role="presentation"
      @mousedown.self="closeTableInsertDialog"
      @keydown.esc.prevent="closeTableInsertDialog"
    >
      <form
        class="w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-slate-950/20"
        role="dialog"
        aria-modal="true"
        aria-label="插入表格"
        @submit.prevent="insertConfiguredTable"
      >
        <header class="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <h2 class="text-base font-semibold text-slate-900">插入表格</h2>
            <p class="mt-0.5 text-xs text-slate-400">设置表格的初始行数与列数，插入后仍可继续增删</p>
          </div>
          <button
            type="button"
            class="grid h-8 w-8 place-items-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
            aria-label="关闭表格设置"
            @click="closeTableInsertDialog"
          >
            <IconX class="h-5 w-5" />
          </button>
        </header>

        <div class="px-5 py-5">
          <div class="grid grid-cols-2 gap-4">
            <label class="block text-sm font-semibold text-slate-700">
              行数
              <input
                v-model.number="tableInsertDialog.rows"
                type="number"
                :min="TABLE_SIZE_MIN"
                :max="TABLE_SIZE_MAX"
                autofocus
                class="mt-2 h-11 w-full rounded-xl border border-slate-200 px-3 text-base font-semibold text-slate-800 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
              />
            </label>
            <label class="block text-sm font-semibold text-slate-700">
              列数
              <input
                v-model.number="tableInsertDialog.cols"
                type="number"
                :min="TABLE_SIZE_MIN"
                :max="TABLE_SIZE_MAX"
                class="mt-2 h-11 w-full rounded-xl border border-slate-200 px-3 text-base font-semibold text-slate-800 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
              />
            </label>
          </div>

          <label class="mt-4 flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
            <input
              v-model="tableInsertDialog.withHeaderRow"
              type="checkbox"
              class="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
            />
            <span>
              <span class="block text-sm font-semibold text-slate-700">包含表头</span>
              <span class="mt-0.5 block text-xs text-slate-400">第一行使用灰色表头样式</span>
            </span>
          </label>

          <p class="mt-4 rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-700">
            将插入 {{ normalizeTableSize(tableInsertDialog.rows) }} 行 × {{ normalizeTableSize(tableInsertDialog.cols) }} 列，最大支持 {{ TABLE_SIZE_MAX }} × {{ TABLE_SIZE_MAX }}。
          </p>
        </div>

        <footer class="flex justify-end gap-2 border-t border-slate-100 bg-slate-50 px-5 py-4">
          <button type="button" class="h-9 rounded-lg px-4 text-sm font-medium text-slate-600 hover:bg-slate-200" @click="closeTableInsertDialog">取消</button>
          <button type="submit" class="h-9 rounded-lg bg-sky-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-700">插入表格</button>
        </footer>
      </form>
    </div>
  </Teleport>

  <Teleport to="body">
    <div
      v-if="commentDialogOpen"
      class="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/25 p-4 backdrop-blur-[1px]"
      role="presentation"
      @mousedown.self="closeCommentDialog"
    >
      <section
        class="flex max-h-[min(680px,calc(100vh-32px))] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-slate-950/20"
        role="dialog"
        aria-modal="true"
        aria-label="正文备注"
      >
        <header class="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div class="flex min-w-0 items-center gap-3">
            <span class="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-rose-50 text-rose-600">
              <IconMessageCircle class="h-5 w-5" />
            </span>
            <div class="min-w-0">
              <h2 class="text-base font-semibold text-slate-900">
                {{ commentMode === 'create' ? '添加正文备注' : '备注讨论' }}
              </h2>
              <p class="mt-0.5 text-xs text-slate-400">
                {{ commentMode === 'create' ? '备注会绑定到当前选中的文字' : (commentSocketStatus === 'connected' ? '回复将实时同步给其他协作者' : '正在连接实时讨论') }}
              </p>
            </div>
          </div>
          <button
            type="button"
            class="grid h-8 w-8 place-items-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
            aria-label="关闭备注"
            @click="closeCommentDialog"
          >
            <IconX class="h-5 w-5" />
          </button>
        </header>

        <div class="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <div class="rounded-xl border-l-4 border-rose-400 bg-rose-50/70 px-4 py-3">
            <p class="text-[11px] font-semibold uppercase tracking-wide text-rose-500">已选内容</p>
            <p class="mt-1 line-clamp-4 whitespace-pre-wrap text-sm leading-6 text-slate-700">{{ commentQuotedText }}</p>
          </div>

          <template v-if="commentMode === 'create'">
            <label class="mt-5 block text-sm font-semibold text-slate-700" for="new-editor-comment">备注内容</label>
            <textarea
              id="new-editor-comment"
              v-model="commentDraft"
              rows="5"
              autofocus
              class="mt-2 w-full resize-y rounded-xl border border-slate-200 px-3.5 py-3 text-sm leading-6 text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-rose-400 focus:ring-4 focus:ring-rose-100"
              placeholder="输入对这段内容的说明、建议或问题……"
              @keydown.ctrl.enter.prevent="createComment"
            />
            <p class="mt-2 text-xs text-slate-400">Ctrl + Enter 快速提交</p>
          </template>

          <template v-else>
            <div v-if="commentThreadLoading" class="py-8 text-center text-sm text-slate-400">正在加载备注讨论…</div>
            <div v-else class="mt-5 space-y-3">
              <article
                v-for="(message, index) in commentMessages"
                :key="String(message.id)"
                :class="['rounded-xl border px-4 py-3', index === 0 ? 'border-rose-100 bg-rose-50/50' : 'border-slate-100 bg-slate-50']"
              >
                <div class="flex items-center justify-between gap-3">
                  <strong class="truncate text-sm text-slate-800">{{ messageAuthor(message) }}</strong>
                  <time class="shrink-0 text-[11px] text-slate-400">{{ formatCommentTime(message.createdAt) }}</time>
                </div>
                <p class="mt-1.5 whitespace-pre-wrap break-words text-sm leading-6 text-slate-700">{{ message.content }}</p>
              </article>
              <p v-if="!commentMessages.length && !commentError" class="py-6 text-center text-sm text-slate-400">暂无备注内容</p>
            </div>
          </template>

          <p v-if="commentError" class="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{{ commentError }}</p>
        </div>

        <footer v-if="commentMode === 'create'" class="flex justify-end gap-2 border-t border-slate-100 bg-slate-50 px-5 py-4">
          <button type="button" class="h-9 rounded-lg px-4 text-sm font-medium text-slate-600 hover:bg-slate-200" @click="closeCommentDialog">取消</button>
          <button
            type="button"
            class="h-9 rounded-lg bg-rose-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
            :disabled="!commentDraft.trim() || commentSaving"
            @click="createComment"
          >
            {{ commentSaving ? '正在添加…' : '添加备注' }}
          </button>
        </footer>

        <footer v-else class="border-t border-slate-100 bg-slate-50 px-5 py-4">
          <div class="flex items-end gap-2">
            <textarea
              v-model="replyDraft"
              rows="2"
              class="min-h-[42px] flex-1 resize-none rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm leading-5 outline-none transition placeholder:text-slate-400 focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
              placeholder="回复这条备注……"
              @keydown.ctrl.enter.prevent="sendCommentReply"
            />
            <button
              type="button"
              class="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-sky-600 text-white shadow-sm transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50"
              :disabled="!replyDraft.trim() || commentSaving"
              aria-label="发送回复"
              @click="sendCommentReply"
            >
              <IconSend class="h-4 w-4" />
            </button>
          </div>
          <p class="mt-2 text-[11px] text-slate-400">Ctrl + Enter 发送回复</p>
        </footer>
      </section>
    </div>
  </Teleport>
</template>

<style lang="scss">
@use "@/assets/css/tiptap.scss" as *;

.editor-collaboration-block {
  display: flex;
  align-items: center;
  gap: 14px;
  margin: 18px 0;
  padding: 16px;
  border: 1px solid #dbeafe;
  border-radius: 16px;
  background: linear-gradient(135deg, #f8fafc, #eff6ff);
  box-shadow: 0 1px 2px rgb(15 23 42 / 5%);
}

.editor-collaboration-block.ProseMirror-selectednode {
  outline: 3px solid rgb(14 165 233 / 28%);
  border-color: #38bdf8;
}

.editor-collaboration-block__badge {
  display: grid;
  width: 46px;
  height: 46px;
  flex: 0 0 auto;
  place-items: center;
  border-radius: 13px;
  background: #0f172a;
  color: white;
  font-size: 12px;
  font-weight: 800;
  letter-spacing: .04em;
}

.editor-collaboration-block__content {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
}

.editor-collaboration-block__title { color: #0f172a; font-size: 15px; }
.editor-collaboration-block__english { color: #0284c7; font-size: 11px; font-weight: 600; }
.editor-collaboration-block__description { margin-top: 3px; color: #64748b; font-size: 12px; }
.editor-collaboration-block__action {
  flex: 0 0 auto;
  border-radius: 9px;
  background: white;
  padding: 8px 12px;
  color: #0369a1 !important;
  font-size: 12px;
  font-weight: 700;
  text-decoration: none !important;
  box-shadow: inset 0 0 0 1px #bae6fd;
}

.editor-collaboration-block__action:hover { background: #e0f2fe; }

.editor-video-block {
  display: block;
  width: 100%;
  max-height: 520px;
  margin: 18px 0;
  border-radius: 14px;
  background: #020617;
  box-shadow: 0 8px 24px rgb(15 23 42 / 16%);
}

.editor-video-block.ProseMirror-selectednode { outline: 3px solid #38bdf8; }

.editor-comment-mark {
  position: relative;
  border-bottom: 2px solid #ef4444;
  background: linear-gradient(to top, rgb(254 226 226 / 75%) 42%, transparent 42%);
  cursor: pointer;
  transition: background-color 150ms ease, border-color 150ms ease;
}

.editor-comment-mark::after {
  content: "注";
  display: inline-grid;
  width: 18px;
  height: 18px;
  margin: 0 2px;
  place-items: center;
  border-radius: 999px;
  background: #ef4444;
  color: #fff;
  font-size: 10px;
  font-style: normal;
  font-weight: 700;
  line-height: 1;
  vertical-align: text-top;
  box-shadow: 0 1px 3px rgb(127 29 29 / 25%);
}

.editor-comment-mark:hover {
  border-bottom-color: #be123c;
  background-color: rgb(255 228 230 / 75%);
}

.editor-comment-mark:hover::after { background: #be123c; }

@media (max-width: 640px) {
  .editor-collaboration-block { align-items: flex-start; flex-wrap: wrap; }
  .editor-collaboration-block__action { margin-left: 60px; }
}
</style>

