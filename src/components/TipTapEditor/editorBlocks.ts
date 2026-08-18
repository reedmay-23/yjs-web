import { Node, VueNodeViewRenderer, mergeAttributes } from "@tiptap/vue-3";
import CollaborationBlockView from "./CollaborationBlockView.vue";

const featureMeta: Record<string, { title: string; english: string; badge: string; description: string }> = {
  whiteboard: { title: "协作白板", english: "Collaborative Whiteboard", badge: "WB", description: "多人绘制、移动图形与文字" },
  chat: { title: "实时讨论", english: "Realtime Chat", badge: "@", description: "消息、回复、提及与表情反应" },
  "task-board": { title: "任务看板", english: "Task Board", badge: "KB", description: "拖拽任务卡片并同步项目状态" },
  spreadsheet: { title: "协作表格", english: "Spreadsheet", badge: "FX", description: "协同编辑单元格、公式与校验规则" },
  media: { title: "媒体标注", english: "Media Annotation", badge: "AV", description: "图片、视频和音频的协作审阅" },
};

export const CollaborationBlock = Node.create({
  name: "collaborationBlock",
  group: "block",
  atom: true,
  // The node itself must not be natively draggable: otherwise browsers start
  // dragging the whole block when a user draws on the embedded canvas.
  // CollaborationBlockView exposes one explicit draggable handle instead.
  draggable: false,
  selectable: true,

  addAttributes() {
    return {
      feature: { default: "whiteboard", parseHTML: (element) => element.getAttribute("data-feature") },
      documentId: { default: "", parseHTML: (element) => element.getAttribute("data-document-id") },
      title: { default: "", parseHTML: (element) => element.getAttribute("data-title") },
      resourceId: { default: null, parseHTML: (element) => element.getAttribute("data-resource-id") },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-collaboration-block]" }];
  },

  addNodeView() {
    return VueNodeViewRenderer(CollaborationBlockView, {
      // Interactive controls belong to the embedded app. Only the explicit
      // drag handle is allowed to reach ProseMirror's node-dragging logic.
      stopEvent: ({ event }) => {
        const target = event.target;
        if (!(target instanceof Element)) return true;
        return target.closest("[data-drag-handle]") === null;
      },
      ignoreMutation: () => true,
    });
  },

  renderHTML({ node, HTMLAttributes }) {
    const feature = String(node.attrs.feature ?? "whiteboard");
    const documentId = String(node.attrs.documentId ?? "");
    const meta = featureMeta[feature] ?? featureMeta.whiteboard!;
    const title = String(node.attrs.title || meta.title);
    const resourceId = node.attrs.resourceId ? String(node.attrs.resourceId) : "";
    const href = `/documents/${encodeURIComponent(documentId)}/collaboration/${feature}`;

    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-collaboration-block": "",
        "data-feature": feature,
        "data-document-id": documentId,
        "data-title": title,
        "data-resource-id": resourceId,
        class: "editor-collaboration-block",
        contenteditable: "false",
      }),
      ["div", { class: "editor-collaboration-block__badge" }, meta.badge],
      [
        "div",
        { class: "editor-collaboration-block__content" },
        ["strong", { class: "editor-collaboration-block__title" }, title],
        ["span", { class: "editor-collaboration-block__english" }, meta.english],
        ["span", { class: "editor-collaboration-block__description" }, meta.description],
      ],
      ["a", { class: "editor-collaboration-block__action", href, draggable: "false" }, "打开协作"],
    ];
  },
});

export const VideoBlock = Node.create({
  name: "videoBlock",
  group: "block",
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      src: { default: "", parseHTML: (element) => element.getAttribute("src") },
      title: { default: "视频", parseHTML: (element) => element.getAttribute("title") },
    };
  },

  parseHTML() {
    return [{ tag: "video[data-editor-video]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["video", mergeAttributes(HTMLAttributes, {
      "data-editor-video": "",
      class: "editor-video-block",
      controls: "true",
      preload: "metadata",
    })];
  },
});
