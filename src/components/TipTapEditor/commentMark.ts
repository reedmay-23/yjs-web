import { Mark, mergeAttributes } from "@tiptap/vue-3";

export const CommentMark = Mark.create({
  name: "commentMark",
  inclusive: false,
  excludes: "",

  addAttributes() {
    return {
      commentId: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-comment-id"),
        renderHTML: (attributes) => ({ "data-comment-id": attributes.commentId }),
      },
      quotedText: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-quoted-text"),
        renderHTML: (attributes) => ({ "data-quoted-text": attributes.quotedText }),
      },
      commentText: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-comment-text"),
        renderHTML: (attributes) => ({ "data-comment-text": attributes.commentText }),
      },
      author: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-comment-author"),
        renderHTML: (attributes) => ({ "data-comment-author": attributes.author }),
      },
      createdAt: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-comment-created-at"),
        renderHTML: (attributes) => ({ "data-comment-created-at": attributes.createdAt }),
      },
    };
  },

  parseHTML() {
    return [{ tag: "span[data-comment-id]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        class: "editor-comment-mark",
        title: "点击查看备注",
      }),
      0,
    ];
  },
});
