# Yjs 协同文档编辑前端

基于 Vue 3 + TypeScript + Vite + Tiptap + Yjs 实现的多人协同文档编辑前端应用。

## 技术栈

- **框架**: Vue 3 + TypeScript
- **构建工具**: Vite
- **状态管理**: Pinia
- **路由**: Vue Router
- **UI 组件库**: Naive UI
- **富文本编辑器**: Tiptap
- **协同编辑**: Yjs / y-websocket / y-protocols
- **HTTP 客户端**: Axios
- **样式**: Tailwind CSS + SCSS

## 核心功能

### 1. 用户认证
- 用户登录与注册
- JWT 令牌管理
- 自动令牌刷新
- 路由守卫权限控制

### 2. 文档管理
- 文档列表展示
- 文档创建与删除
- 文档元数据编辑
- 文档搜索与筛选

### 3. 协同编辑
- 基于 Tiptap 的富文本编辑器
- Yjs 实时协同编辑
- 多人光标显示
- 在线用户状态展示

### 4. 协作者管理
- 添加/移除协作者
- 角色权限管理（Owner/Editor/Viewer）
- 协作者列表展示
- 权限实时生效

### 5. 实时通信
- WebSocket 连接管理
- 自动重连机制
- 在线人数实时更新
- 编辑状态实时同步

### 6. 历史版本
- 版本历史列表
- 版本回退功能
- 手动创建快照
- 快照对比查看

## 项目结构

`
src/
├── App.vue                    # 根组件
├── main.ts                    # 应用入口
├── vite-env.d.ts              # Vite 类型声明
├── assets/                    # 静态资源
│   ├── images/               # 图片资源
│   └── styles/               # 全局样式
├── components/                # 公共组件
│   ├── editor/               # 编辑器相关组件
│   ├── layout/               # 布局组件
│   └── common/               # 通用组件
├── composables/               # 组合式函数
│   ├── useAuth.ts            # 认证相关
│   ├── useDocument.ts        # 文档相关
│   ├── useCollaboration.ts   # 协同相关
│   └── useWebSocket.ts       # WebSocket 相关
├── router/                    # 路由配置
│   └── index.ts              # 路由定义
├── services/                  # API 服务
│   ├── auth.ts               # 认证接口
│   ├── document.ts           # 文档接口
│   └── collaboration.ts      # 协同接口
├── stores/                    # Pinia 状态管理
│   ├── auth.ts               # 认证状态
│   ├── document.ts           # 文档状态
│   └── collaboration.ts      # 协同状态
├── types/                     # TypeScript 类型定义
│   ├── api.ts                # API 类型
│   ├── document.ts           # 文档类型
│   └── user.ts               # 用户类型
├── utils/                     # 工具函数
│   ├── request.ts            # HTTP 请求封装
│   ├── token.ts              # 令牌管理
│   └── websocket.ts          # WebSocket 工具
└── views/                     # 页面视图
    ├── login/                # 登录页面
    ├── document/             # 文档相关页面
    │   ├── list.vue          # 文档列表
    │   ├── edit.vue          # 文档编辑
    │   └── detail.vue        # 文档详情
    └── collaborate/          # 协同相关页面
`

## 环境配置

### 环境变量

在项目根目录创建 .env.local 或 .env.production：

`env
# API 基础路径
VITE_API_BASE_URL=/api

# API 代理目标（开发环境）
VITE_API_PROXY_TARGET=http://localhost:3000

# WebSocket 地址
VITE_YJS_WS_URL=ws://localhost:3000
`

### 开发环境

`env
VITE_API_BASE_URL=/api
VITE_API_PROXY_TARGET=http://localhost:3000
VITE_YJS_WS_URL=ws://localhost:3000
`

### 生产环境

`env
VITE_API_BASE_URL=/api
# 如果 WebSocket 后端在同一域名，可以不设置 VITE_YJS_WS_URL
# 如果在不同域名，需要设置：
VITE_YJS_WS_URL=wss://api.example.com
`

## 协同编辑流程

### 1. 建立连接

`	ypescript
// 创建 WebSocket 连接
const ws = new WebSocket(
  ws://localhost:3000/collab1?docId=&accessToken=&presence=1
);

// 设置二进制类型
ws.binaryType = 'arraybuffer';
`

### 2. Yjs 同步

`	ypescript
import * as Y from 'yjs';
import * as syncProtocol from 'y-protocols/sync';
import * as encoding from 'lib0/encoding';

const ydoc = new Y.Doc();

// 连接成功后发送同步请求
ws.onopen = () => {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, 0); // messageSync
  syncProtocol.writeSyncStep1(encoder, ydoc);
  ws.send(encoding.toUint8Array(encoder));
};

// 监听本地更新并发送
ydoc.on('update', (update, origin) => {
  if (origin === ws) return;
  
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, 0); // messageSync
  syncProtocol.writeUpdate(encoder, update);
  ws.send(encoding.toUint8Array(encoder));
});
`

### 3. 消息处理

`	ypescript
import * as decoding from 'lib0/decoding';
import * as awarenessProtocol from 'y-protocols/awareness';

const messageSync = 0;
const messageAwareness = 1;
const messagePresence = 2;

ws.onmessage = (event) => {
  const data = new Uint8Array(event.data);
  const decoder = decoding.createDecoder(data);
  const messageType = decoding.readVarUint(decoder);

  switch (messageType) {
    case messageSync:
      // 处理 Yjs 同步消息
      syncProtocol.readSyncMessage(decoder, encoder, ydoc, ws);
      break;
      
    case messageAwareness:
      // 处理 awareness 消息（光标、选区等）
      awarenessProtocol.applyAwarenessUpdate(
        awareness,
        decoding.readVarUint8Array(decoder),
        ws
      );
      break;
      
    case messagePresence:
      // 处理在线人数消息
      const jsonBytes = decoding.readVarUint8Array(decoder);
      const payload = JSON.parse(new TextDecoder().decode(jsonBytes));
      if (payload.type === 'onlineUsersChanged') {
        updateOnlineUsers(payload.users);
      }
      break;
  }
};
`

### 4. 在线用户管理

`	ypescript
// 获取在线用户快照
const sessions = await getOnlineSessions(docId);
updateOnlineUsers(sessions.map(s => s.user));

// WebSocket 推送更新
function updateOnlineUsers(users) {
  onlineUsers.value = users;
  onlineCount.value = users.length;
}
`

## 编辑器集成

### Tiptap 配置

`	ypescript
import { Editor } from '@tiptap/vue-3';
import StarterKit from '@tiptap/starter-kit';
import Collaboration from '@tiptap/extension-collaboration';
import CollaborationCursor from '@tiptap/extension-collaboration-cursor';

const editor = new Editor({
  extensions: [
    StarterKit.configure({
      history: false, // 禁用内置历史，使用 Yjs 协同
    }),
    Collaboration.configure({
      document: ydoc,
    }),
    CollaborationCursor.configure({
      provider: websocketProvider,
      user: {
        name: currentUser.username,
        color: getRandomColor(),
      },
    }),
  ],
});
`

## API 接口封装

### 请求配置

`	ypescript
import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
  timeout: 10000,
});

// 请求拦截器 - 添加 token
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken');
  if (token) {
    config.headers.Authorization = Bearer ;
  }
  return config;
});

// 响应拦截器 - 处理 token 刷新
api.interceptors.response.use(
  (response) => response.data,
  async (error) => {
    if (error.response?.status === 401) {
      // 尝试刷新 token
      const refreshed = await refreshToken();
      if (refreshed) {
        // 重试原请求
        return api.request(error.config);
      }
    }
    return Promise.reject(error);
  }
);
`

### 接口示例

`	ypescript
// 文档接口
export const documentApi = {
  // 创建文档
  create: (data: CreateDocumentDto) => 
    api.post('/document/create', data),
  
  // 获取文档列表
  getList: () => 
    api.get('/document/getList'),
  
  // 获取文档详情
  getDetail: (id: number) => 
    api.get(/document/detail/),
  
  // 更新文档
  update: (data: UpdateDocumentDto) => 
    api.post('/document/update', data),
  
  // 删除文档
  delete: (id: number) => 
    api.delete(/document/delete/),
  
  // 添加协作者
  addCollaborator: (docId: number, userId: number, role: string) =>
    api.post('/document/collaborators/add', { docId, userId, role }),
  
  // 获取协作者列表
  getCollaborators: (docId: number) =>
    api.post('/document/collaborators/list', { docId }),
};
`

## WebSocket 自动重连

`	ypescript
function createReconnectingSocket(factory: () => WebSocket) {
  let socket: WebSocket;
  let retry = 0;
  let closedByUser = false;

  const connect = () => {
    socket = factory();

    socket.onopen = () => {
      retry = 0;
      console.log('WebSocket connected');
    };

    socket.onclose = () => {
      if (closedByUser) return;
      
      const delay = Math.min(1000 * 2 ** retry, 15000);
      retry += 1;
      
      console.log(WebSocket disconnected, retrying in ms);
      setTimeout(connect, delay);
    };

    socket.onerror = (error) => {
      console.error('WebSocket error:', error);
    };
  };

  connect();

  return {
    send(data: unknown) {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(data));
      }
    },
    close() {
      closedByUser = true;
      socket.close();
    },
  };
}
`

## 本地开发

### 1. 安装依赖

`ash
pnpm install
`

### 2. 配置环境变量

创建 .env.local 文件：

`env
VITE_API_BASE_URL=/api
VITE_API_PROXY_TARGET=http://localhost:3000
VITE_YJS_WS_URL=ws://localhost:3000
`

### 3. 启动开发服务器

`ash
pnpm run dev
`

默认访问地址：http://localhost:5173

### 4. 构建生产版本

`ash
pnpm run build
`

构建产物将输出到 dist 目录。

## 常用命令

`ash
pnpm run dev      # 启动开发服务器
pnpm run build    # 构建生产版本
pnpm run preview  # 预览构建产物
`

## 页面路由

| 路径 | 页面 | 说明 |
|------|------|------|
| /login | 登录页 | 用户登录 |
| /register | 注册页 | 用户注册 |
| /documents | 文档列表 | 显示用户文档 |
| /documents/:id | 文档编辑 | 协同编辑文档 |
| /documents/:id/detail | 文档详情 | 查看文档信息 |

## 状态管理

### 认证状态 (auth store)

`	ypescript
interface AuthState {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
}
`

### 文档状态 (document store)

`	ypescript
interface DocumentState {
  documents: Document[];
  currentDocument: Document | null;
  collaborators: Collaborator[];
  loading: boolean;
}
`

### 协同状态 (collaboration store)

`	ypescript
interface CollaborationState {
  onlineUsers: User[];
  onlineCount: number;
  isConnected: boolean;
  editor: Editor | null;
}
`

## 组件使用示例

### 编辑器组件

`ue
<template>
  <div class="editor-container">
    <editor-content :editor="editor" />
    <collaboration-cursors :editor="editor" />
  </div>
</template>

<script setup lang="ts">
import { useEditor, EditorContent } from '@tiptap/vue-3';
import Collaboration from '@tiptap/extension-collaboration';
import CollaborationCursor from '@tiptap/extension-collaboration-cursor';

const props = defineProps<{
  ydoc: Y.Doc;
  provider: WebsocketProvider;
}>();

const editor = useEditor({
  extensions: [
    StarterKit.configure({ history: false }),
    Collaboration.configure({ document: props.ydoc }),
    CollaborationCursor.configure({
      provider: props.provider,
      user: { name: 'User', color: '#f783ac' },
    }),
  ],
});
</script>
`

### 在线用户组件

`ue
<template>
  <div class="online-users">
    <n-avatar-group :max="5">
      <n-avatar
        v-for="user in onlineUsers"
        :key="user.id"
        :src="user.avatar"
        :title="user.username"
      />
    </n-avatar-group>
    <span class="count">{{ onlineCount }} 人在线</span>
  </div>
</template>

<script setup lang="ts">
import { useCollaborationStore } from '@/stores/collaboration';

const collaborationStore = useCollaborationStore();
const { onlineUsers, onlineCount } = storeToRefs(collaborationStore);
</script>
`

## 开发注意事项

### 1. WebSocket 连接

- 确保设置 ws.binaryType = 'arraybuffer'
- 正确处理三种消息类型（sync、awareness、presence）
- 页面卸载时关闭 WebSocket 连接

### 2. Yjs 文档

- 编辑器绑定到本地 ydoc
- 不要直接发送完整文本 JSON
- 使用 Yjs 的 sync 协议同步

### 3. Token 管理

- 请求头携带 Authorization: Bearer <token>
- 处理 401 响应并刷新 token
- token 存储在 localStorage

### 4. 权限控制

- 根据用户角色显示/隐藏编辑功能
- viewer 角色禁用写操作
- 实时更新权限状态

## 常见问题

### 编辑器连接成功但内容空白

1. 检查是否设置了 ws.binaryType = 'arraybuffer'
2. 确认处理了服务端初始发送的 messageSync
3. 调用了 syncProtocol.readSyncMessage(...)
4. 编辑器是否绑定到 ydoc.getText('document')

### 在线人数不更新

1. 确认页面进入时调用了 GET /yjs-storage/sessions/:docId
2. WebSocket URL 是否加了 presence=1
3. 收到 onlineUsersChanged 后是否更新了状态

### 协同编辑冲突

1. 确保使用 Yjs 的 CRDT 机制
2. 不要手动合并文本
3. 检查 WebSocket 连接是否稳定

## 相关文档

- [协同功能前端对接指南](./collab-features-frontend-guide.md)
- [后端 API 文档](../yjs_demo/docs/)
- [Yjs 官方文档](https://docs.yjs.dev/)
- [Tiptap 文档](https://tiptap.dev/docs)
