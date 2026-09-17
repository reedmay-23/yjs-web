# Yjs 协同文档前端开发说明

本文档为开发者提供项目的详细开发指南，包括架构设计、开发规范、调试技巧等。

## 开发环境要求

- **Node.js**: >= 18.0.0
- **pnpm**: >= 8.0.0
- **VSCode**: 推荐使用，已配置好相关插件

## 项目架构

### 目录结构说明

`
src/
├── assets/                # 静态资源
│   ├── images/           # 图片资源（logo、图标等）
│   └── styles/           # 全局样式
│       ├── variables.scss    # SCSS 变量
│       ├── mixins.scss       # SCSS 混入
│       └── global.scss       # 全局样式
├── components/            # 公共组件
│   ├── editor/           # 编辑器相关组件
│   │   ├── Editor.vue        # 主编辑器组件
│   │   ├── Toolbar.vue       # 工具栏
│   │   └── BubbleMenu.vue    # 气泡菜单
│   ├── layout/           # 布局组件
│   │   ├── AppLayout.vue     # 应用布局
│   │   ├── Header.vue        # 头部导航
│   │   └── Sidebar.vue       # 侧边栏
│   └── common/           # 通用组件
│       ├── Loading.vue       # 加载组件
│       ├── Empty.vue         # 空状态
│       └── ConfirmDialog.vue # 确认对话框
├── composables/           # 组合式函数（Hooks）
│   ├── useAuth.ts        # 认证相关逻辑
│   ├── useDocument.ts    # 文档操作逻辑
│   ├── useCollaboration.ts # 协同编辑逻辑
│   ├── useWebSocket.ts   # WebSocket 连接管理
│   └── useOnlineUsers.ts # 在线用户管理
├── router/                # 路由配置
│   ├── index.ts          # 路由定义
│   └── guards.ts         # 路由守卫
├── services/              # API 服务层
│   ├── api.ts            # Axios 实例配置
│   ├── auth.ts           # 认证接口
│   ├── document.ts       # 文档接口
│   └── collaboration.ts  # 协同接口
├── stores/                # Pinia 状态管理
│   ├── index.ts          # Store 导出
│   ├── auth.ts           # 认证状态
│   ├── document.ts       # 文档状态
│   └── collaboration.ts  # 协同状态
├── types/                 # TypeScript 类型
│   ├── api.ts            # API 响应类型
│   ├── document.ts       # 文档相关类型
│   ├── user.ts           # 用户相关类型
│   └── collaboration.ts  # 协同相关类型
├── utils/                 # 工具函数
│   ├── request.ts        # HTTP 请求封装
│   ├── token.ts          # Token 管理
│   ├── websocket.ts      # WebSocket 工具
│   ├── yjs.ts            # Yjs 工具函数
│   └── helpers.ts        # 其他辅助函数
└── views/                 # 页面视图
    ├── auth/             # 认证相关页面
    │   ├── Login.vue         # 登录页
    │   └── Register.vue      # 注册页
    ├── document/         # 文档相关页面
    │   ├── DocumentList.vue  # 文档列表
    │   ├── DocumentEdit.vue  # 文档编辑
    │   └── DocumentDetail.vue # 文档详情
    └── error/            # 错误页面
        ├── 404.vue           # 404 页面
        └── 500.vue           # 500 页面
`

### 架构设计原则

1. **组件化**: 拆分可复用的 UI 组件
2. **组合式 API**: 使用 Vue 3 Composition API
3. **状态管理**: 集中管理应用状态
4. **类型安全**: 全面使用 TypeScript
5. **关注点分离**: 业务逻辑与 UI 分离

## 开发规范

### 代码风格

项目使用 ESLint + Prettier 进行代码格式化：

`ash
# 检查代码风格
pnpm run lint

# 自动修复
pnpm run lint:fix

# 格式化代码
pnpm run format
`

### 命名规范

#### 文件命名

- **组件**: PascalCase（如 DocumentList.vue）
- **组合式函数**: camelCase，use 前缀（如 useAuth.ts）
- **工具函数**: camelCase（如 equest.ts）
- **类型定义**: camelCase（如 document.ts）

#### 变量命名

- **普通变量**: camelCase（如 userData）
- **常量**: UPPER_SNAKE_CASE（如 API_BASE_URL）
- **类型/接口**: PascalCase（如 UserInfo）
- **布尔值**: is/has/can 前缀（如 isLoading）

#### CSS 命名

- **类名**: kebab-case（如 document-list）
- **BEM**: 推荐使用 BEM 命名（如 document-list__item--active）

### 组件规范

#### 组件结构

`ue
<template>
  <!-- 模板内容 -->
</template>

<script setup lang="ts">
// 1. 导入
import { ref, computed } from 'vue';
import { useAuthStore } from '@/stores/auth';

// 2. Props 定义
const props = defineProps<{
  title: string;
  visible?: boolean;
}>();

// 3. Emits 定义
const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void;
  (e: 'submit', data: FormData): void;
}>();

// 4. 组合式函数
const authStore = useAuthStore();

// 5. 响应式数据
const loading = ref(false);
const formData = ref<FormData>({} as FormData);

// 6. 计算属性
const isEditable = computed(() => {
  return authStore.user?.role === 'owner' || authStore.user?.role === 'editor';
});

// 7. 方法
const handleSubmit = async () => {
  loading.value = true;
  try {
    await submitForm(formData.value);
    emit('submit', formData.value);
  } finally {
    loading.value = false;
  }
};

// 8. 生命周期
onMounted(() => {
  // 初始化逻辑
});
</script>

<style scoped lang="scss">
/* 组件样式 */
</style>
`

#### Props 规范

`	ypescript
// 使用 TypeScript 定义 Props
const props = defineProps<{
  // 必填属性
  id: number;
  title: string;
  
  // 可选属性
  description?: string;
  
  // 带默认值
  visible?: boolean;
  
  // 复杂类型
  user?: UserInfo;
  items?: Document[];
}>();

// 带默认值的 Props
const props = withDefaults(defineProps<{
  visible?: boolean;
  size?: 'small' | 'medium' | 'large';
}>(), {
  visible: false,
  size: 'medium',
});
`

### 状态管理规范

#### Store 结构

`	ypescript
// stores/document.ts
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { documentApi } from '@/services/document';

export const useDocumentStore = defineStore('document', () => {
  // State
  const documents = ref<Document[]>([]);
  const currentDocument = ref<Document | null>(null);
  const loading = ref(false);

  // Getters
  const documentCount = computed(() => documents.value.length);
  const sortedDocuments = computed(() => 
    [...documents.value].sort((a, b) => 
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    )
  );

  // Actions
  async function fetchDocuments() {
    loading.value = true;
    try {
      const data = await documentApi.getList();
      documents.value = data;
    } finally {
      loading.value = false;
    }
  }

  async function createDocument(data: CreateDocumentDto) {
    const newDoc = await documentApi.create(data);
    documents.value.push(newDoc);
    return newDoc;
  }

  function setCurrentDocument(doc: Document | null) {
    currentDocument.value = doc;
  }

  // 返回所有状态和方法
  return {
    // State
    documents,
    currentDocument,
    loading,
    
    // Getters
    documentCount,
    sortedDocuments,
    
    // Actions
    fetchDocuments,
    createDocument,
    setCurrentDocument,
  };
});
`

### API 服务规范

#### 服务层结构

`	ypescript
// services/api.ts
import axios from 'axios';
import { useAuthStore } from '@/stores/auth';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
  timeout: 10000,
});

// 请求拦截器
api.interceptors.request.use(
  (config) => {
    const authStore = useAuthStore();
    if (authStore.accessToken) {
      config.headers.Authorization = Bearer ;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// 响应拦截器
api.interceptors.response.use(
  (response) => response.data,
  async (error) => {
    const originalRequest = error.config;
    
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      
      const authStore = useAuthStore();
      const refreshed = await authStore.refreshAccessToken();
      
      if (refreshed) {
        return api(originalRequest);
      }
    }
    
    return Promise.reject(error);
  }
);

export default api;
`

#### 接口定义规范

`	ypescript
// services/document.ts
import api from './api';
import type { 
  Document, 
  CreateDocumentDto, 
  UpdateDocumentDto,
  ApiResponse 
} from '@/types';

export const documentApi = {
  /**
   * 创建文档
   */
  create(data: CreateDocumentDto): Promise<ApiResponse<Document>> {
    return api.post('/document/create', data);
  },

  /**
   * 获取文档列表
   */
  getList(): Promise<ApiResponse<Document[]>> {
    return api.get('/document/getList');
  },

  /**
   * 获取文档详情
   */
  getDetail(id: number): Promise<ApiResponse<Document>> {
    return api.get(/document/detail/);
  },

  /**
   * 更新文档
   */
  update(data: UpdateDocumentDto): Promise<ApiResponse<Document>> {
    return api.post('/document/update', data);
  },

  /**
   * 删除文档
   */
  delete(id: number): Promise<ApiResponse<void>> {
    return api.delete(/document/delete/);
  },
};
`

## 协同编辑开发指南

### WebSocket 连接管理

`	ypescript
// composables/useWebSocket.ts
import { ref, onUnmounted } from 'vue';
import * as Y from 'yjs';
import * as syncProtocol from 'y-protocols/sync';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';

export function useWebSocket(docId: number, accessToken: string) {
  const isConnected = ref(false);
  const onlineUsers = ref<User[]>([]);
  
  const ydoc = new Y.Doc();
  const awareness = new awarenessProtocol.Awareness(ydoc);
  
  let ws: WebSocket | null = null;
  let retryCount = 0;
  const maxRetryDelay = 15000;

  function connect() {
    const url = new URL(${import.meta.env.VITE_YJS_WS_URL}/collab1);
    url.searchParams.set('docId', String(docId));
    url.searchParams.set('accessToken', accessToken);
    url.searchParams.set('presence', '1');

    ws = new WebSocket(url.toString());
    ws.binaryType = 'arraybuffer';

    ws.onopen = () => {
      isConnected.value = true;
      retryCount = 0;
      
      // 发送同步请求
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, 0); // messageSync
      syncProtocol.writeSyncStep1(encoder, ydoc);
      send(encoding.toUint8Array(encoder));
    };

    ws.onmessage = (event) => {
      handleMessage(new Uint8Array(event.data));
    };

    ws.onclose = () => {
      isConnected.value = false;
      scheduleReconnect();
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };
  }

  function handleMessage(data: Uint8Array) {
    const decoder = decoding.createDecoder(data);
    const encoder = encoding.createEncoder();
    const messageType = decoding.readVarUint(decoder);

    switch (messageType) {
      case 0: // messageSync
        encoding.writeVarUint(encoder, 0);
        syncProtocol.readSyncMessage(decoder, encoder, ydoc, ws);
        if (encoding.length(encoder) > 1) {
          send(encoding.toUint8Array(encoder));
        }
        break;

      case 1: // messageAwareness
        awarenessProtocol.applyAwarenessUpdate(
          awareness,
          decoding.readVarUint8Array(decoder),
          ws
        );
        break;

      case 2: // messagePresence
        const jsonBytes = decoding.readVarUint8Array(decoder);
        const payload = JSON.parse(new TextDecoder().decode(jsonBytes));
        if (payload.type === 'onlineUsersChanged') {
          onlineUsers.value = payload.users;
        }
        break;
    }
  }

  function send(data: Uint8Array) {
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(data);
    }
  }

  function scheduleReconnect() {
    const delay = Math.min(1000 * Math.pow(2, retryCount), maxRetryDelay);
    retryCount++;
    setTimeout(connect, delay);
  }

  // 监听本地更新
  ydoc.on('update', (update, origin) => {
    if (origin === ws) return;
    
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, 0);
    syncProtocol.writeUpdate(encoder, update);
    send(encoding.toUint8Array(encoder));
  });

  // 清理
  onUnmounted(() => {
    ws?.close();
    ydoc.destroy();
  });

  return {
    ydoc,
    awareness,
    isConnected,
    onlineUsers,
    connect,
    disconnect: () => ws?.close(),
  };
}
`

### 编辑器集成

`	ypescript
// composables/useEditor.ts
import { ref, onMounted, onUnmounted } from 'vue';
import { Editor } from '@tiptap/vue-3';
import StarterKit from '@tiptap/starter-kit';
import Collaboration from '@tiptap/extension-collaboration';
import CollaborationCursor from '@tiptap/extension-collaboration-cursor';
import type { YDoc, Awareness } from 'yjs';

export function useEditor(ydoc: YDoc, awareness: Awareness, user: User) {
  const editor = ref<Editor | null>(null);

  onMounted(() => {
    editor.value = new Editor({
      extensions: [
        StarterKit.configure({
          history: false, // 使用 Yjs 协同，禁用内置历史
        }),
        Collaboration.configure({
          document: ydoc,
        }),
        CollaborationCursor.configure({
          provider: { awareness },
          user: {
            name: user.username,
            color: getRandomColor(),
          },
        }),
      ],
    });
  });

  onUnmounted(() => {
    editor.value?.destroy();
  });

  return { editor };
}

function getRandomColor(): string {
  const colors = [
    '#f783ac', '#845ef7', '#20c997', '#339af0',
    '#ff922b', '#fab005', '#ff6b6b', '#51cf66',
  ];
  return colors[Math.floor(Math.random() * colors.length)];
}
`

## 调试技巧

### Vue Devtools

1. 安装 Vue Devtools 浏览器扩展
2. 可以查看组件树、状态、事件等
3. 支持 Pinia 状态调试

### WebSocket 调试

`	ypescript
// 在开发环境启用 WebSocket 日志
if (import.meta.env.DEV) {
  ws.onmessage = (event) => {
    console.log('WebSocket message:', event.data);
    // ... 原有处理逻辑
  };
}
`

### 网络请求调试

`	ypescript
// 在开发环境启用请求日志
api.interceptors.request.use((config) => {
  if (import.meta.env.DEV) {
    console.log('Request:', config.method?.toUpperCase(), config.url, config.data);
  }
  return config;
});

api.interceptors.response.use((response) => {
  if (import.meta.env.DEV) {
    console.log('Response:', response.status, response.data);
  }
  return response.data;
});
`

## 性能优化

### 代码分割

`	ypescript
// router/index.ts
const routes = [
  {
    path: '/documents',
    component: () => import('@/views/document/DocumentList.vue'),
  },
  {
    path: '/documents/:id',
    component: () => import('@/views/document/DocumentEdit.vue'),
  },
];
`

### 虚拟滚动

对于长列表，使用虚拟滚动优化性能：

`ue
<template>
  <n-virtual-list
    :item-size="48"
    :items="documents"
    :height="600"
  >
    <template #default="{ item }">
      <document-item :document="item" />
    </template>
  </n-virtual-list>
</template>
`

### 防抖和节流

`	ypescript
import { useDebounceFn, useThrottleFn } from '@vueuse/core';

// 防抖搜索
const debouncedSearch = useDebounceFn((keyword: string) => {
  searchDocuments(keyword);
}, 300);

// 节流滚动
const throttledScroll = useThrottleFn((event: Event) => {
  handleScroll(event);
}, 100);
`

## 测试

### 单元测试

`	ypescript
// __tests__/useAuth.test.ts
import { describe, it, expect, vi } from 'vitest';
import { useAuth } from '@/composables/useAuth';

describe('useAuth', () => {
  it('should login successfully', async () => {
    const { login, user } = useAuth();
    
    await login({
      account: 'testuser',
      password: 'password123',
    });
    
    expect(user.value).toBeDefined();
    expect(user.value?.account).toBe('testuser');
  });
});
`

### 组件测试

`	ypescript
// __tests__/DocumentList.test.ts
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import DocumentList from '@/views/document/DocumentList.vue';

describe('DocumentList', () => {
  it('renders document list', () => {
    const wrapper = mount(DocumentList);
    expect(wrapper.find('.document-list').exists()).toBe(true);
  });
});
`

## 部署

### 构建

`ash
pnpm run build
`

### 环境变量

生产环境需要配置：

`env
VITE_API_BASE_URL=/api
VITE_YJS_WS_URL=wss://your-domain.com
`

### Nginx 配置

`
ginx
server {
    listen 80;
    server_name your-domain.com;
    root /path/to/dist;
    index index.html;

    # API 代理
    location /api {
        proxy_pass http://localhost:3000;
        proxy_set_header Host System.Management.Automation.Internal.Host.InternalHost;
        proxy_set_header X-Real-IP ;
    }

    # WebSocket 代理
    location /collab1 {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade ;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host System.Management.Automation.Internal.Host.InternalHost;
    }

    # Vue Router history 模式
    location / {
        try_files  / /index.html;
    }
}
`

## 常见开发问题

### 1. 热更新不工作

检查 Vite 配置：

`	ypescript
// vite.config.ts
export default defineConfig({
  server: {
    hmr: {
      overlay: true,
    },
  },
});
`

### 2. TypeScript 类型错误

运行类型检查：

`ash
pnpm run type-check
`

### 3. 依赖安装失败

清除缓存重新安装：

`ash
rm -rf node_modules pnpm-lock.yaml
pnpm install
`

### 4. WebSocket 连接失败

检查：
- 后端服务是否启动
- 端口是否正确
- Token 是否有效
- 防火墙设置

## 相关资源

- [Vue 3 文档](https://vuejs.org/)
- [Vite 文档](https://vitejs.dev/)
- [Pinia 文档](https://pinia.vuejs.org/)
- [Tiptap 文档](https://tiptap.dev/)
- [Yjs 文档](https://docs.yjs.dev/)
- [Naive UI 文档](https://www.naiveui.com/)
