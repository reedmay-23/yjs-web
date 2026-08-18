export type SlashCommandId =
  | "paragraph" | "heading1" | "heading2" | "heading3"
  | "bulletList" | "orderedList" | "blockquote" | "codeBlock" | "divider"
  | "table" | "image" | "video"
  | "whiteboard" | "taskBoard" | "spreadsheet" | "media";

export type SlashCommandItem = {
  id: SlashCommandId;
  label: string;
  englishName: string;
  command: string;
  aliases: string[];
  description: string;
  category: "基础内容" | "媒体内容" | "协作内容";
  badge: string;
};

export const slashCommands: SlashCommandItem[] = [
  { id: "paragraph", label: "正文", englishName: "Paragraph", command: "paragraph", aliases: ["p", "text"], description: "插入普通文本段落", category: "基础内容", badge: "P" },
  { id: "heading1", label: "一级标题", englishName: "Heading 1", command: "heading1", aliases: ["h1", "title"], description: "页面或章节主标题", category: "基础内容", badge: "H1" },
  { id: "heading2", label: "二级标题", englishName: "Heading 2", command: "heading2", aliases: ["h2", "subtitle"], description: "章节标题", category: "基础内容", badge: "H2" },
  { id: "heading3", label: "三级标题", englishName: "Heading 3", command: "heading3", aliases: ["h3"], description: "小节标题", category: "基础内容", badge: "H3" },
  { id: "bulletList", label: "项目符号列表", englishName: "Bullet List", command: "bullet-list", aliases: ["ul", "bullet"], description: "创建无序列表", category: "基础内容", badge: "•" },
  { id: "orderedList", label: "编号列表", englishName: "Numbered List", command: "numbered-list", aliases: ["ol", "number"], description: "创建有序列表", category: "基础内容", badge: "1." },
  { id: "blockquote", label: "引用", englishName: "Blockquote", command: "blockquote", aliases: ["quote", "bq"], description: "突出显示引用内容", category: "基础内容", badge: "❝" },
  { id: "codeBlock", label: "代码块", englishName: "Code Block", command: "code-block", aliases: ["code", "pre"], description: "插入多行代码区域", category: "基础内容", badge: "</>" },
  { id: "divider", label: "分割线", englishName: "Horizontal Rule", command: "horizontal-rule", aliases: ["hr", "divider"], description: "分隔不同内容区域", category: "基础内容", badge: "—" },
  { id: "table", label: "表格", englishName: "Table", command: "table", aliases: ["tbl"], description: "自定义行列并插入带边框表格", category: "基础内容", badge: "▦" },
  { id: "image", label: "图片", englishName: "Image", command: "image", aliases: ["img", "picture"], description: "通过图片地址插入图片", category: "媒体内容", badge: "IMG" },
  { id: "video", label: "视频", englishName: "Video", command: "video", aliases: ["vid", "movie"], description: "通过视频地址插入播放器", category: "媒体内容", badge: "▶" },
  { id: "whiteboard", label: "协作白板", englishName: "Collaborative Whiteboard", command: "whiteboard", aliases: ["wb", "board"], description: "插入当前文档的协作白板入口", category: "协作内容", badge: "WB" },
  { id: "taskBoard", label: "任务看板", englishName: "Task Board", command: "task-board", aliases: ["kanban", "task"], description: "插入可拖拽任务看板入口", category: "协作内容", badge: "KB" },
  { id: "spreadsheet", label: "协作表格", englishName: "Spreadsheet", command: "spreadsheet", aliases: ["sheet", "cells"], description: "插入公式与数据协作表格入口", category: "协作内容", badge: "FX" },
  { id: "media", label: "媒体标注", englishName: "Media Annotation", command: "media", aliases: ["annotate", "review"], description: "插入图片、视频与音频标注入口", category: "协作内容", badge: "AV" },
];

export const filterSlashCommands = (query: string) => {
  const keyword = query.trim().toLowerCase();
  if (!keyword) return slashCommands;
  return slashCommands.filter((item) => {
    const searchable = [item.command, ...item.aliases, item.englishName, item.label, item.description].join(" ").toLowerCase();
    return searchable.includes(keyword);
  });
};
