<script setup lang="ts">

import TiptapToolbarGroup from "./TipTapToolbarGroup.vue";
import TiptapToolbarButton from "./TiptapToolbarButton.vue";
import { EditorContent, useEditor } from "@tiptap/vue-3";
import {computed, onBeforeUnmount, onMounted, ref} from "vue";
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
import IconLink from "~icons/tabler/link";
import IconListDetails from "~icons/tabler/list-details";
import IconListNumbers from "~icons/tabler/list-numbers";
import IconMovie from "~icons/tabler/movie";
import IconPhoto from "~icons/tabler/photo";
import IconMinus from "~icons/tabler/minus";
import IconTable from "~icons/mdi/table";
import IconTableRemove from "~icons/mdi/table-remove";
import IconTableColumnPlusBefore from "~icons/mdi/table-column-plus-before";
import IconTableColumnPlusAfter from "~icons/mdi/table-column-plus-after";
import IconTableColumnRemove from "~icons/mdi/table-column-remove";
import IconTableRowPlusAfter from "~icons/mdi/table-row-plus-after";
import IconTableRowPlusBefore from "~icons/mdi/table-row-plus-before";
import IconTableRowRemove from "~icons/mdi/table-row-remove";
import IconTableMergeCells from "~icons/mdi/table-merge-cells";
import * as Y from 'yjs'
import { tiptapExtensions } from "@/utils/tiptap";
import Collaboration from "@tiptap/extension-collaboration";
import {io} from "socket.io-client";
import {WebsocketProvider} from "y-websocket";
import CollaborationCaret from "@tiptap/extension-collaboration-caret";
import {Placeholder} from "@tiptap/extensions";
import CollaborationCursor from "@tiptap/extension-collaboration-cursor";
const model = defineModel<string>({
  required: true,
  default: ''
})

// ===== 配置 =====
const docId = 'a8126'
const socketUrl = 'ws://localhost:3892'
const socketPath = 'collab1'

// --- 2. 模拟当前用户 (生产环境应从登录接口获取) ---
const randomColor = '#' + Math.floor(Math.random() * 16777215).toString(16)
const userName = ref('User_' + Math.floor(Math.random() * 100))
const userColor = ref(randomColor)
const userInitial = computed(() => userName.value.charAt(0).toUpperCase())


// const model = ref('ftaeqewr1321312')
const yDoc = new Y.Doc()
const provider = new WebsocketProvider(
  socketUrl,
  socketPath,
  yDoc,
  {params: {docId, userId: userName.value}}
)

// 监听连接状态变化
provider.on('status', event => {
  console.log('Y.js 连接状态变更:', event.status);
  // status 可能是: 'connecting', 'connected', 'disconnected'

  if (event.status === 'disconnected') {
    console.error('连接断开！检查服务器是否启动，或 URL/端口是否正确。');
  }
});

// 监听同步状态
provider.on('sync', synced => {
  console.log('文档同步状态:', synced ? '已同步' : '同步中...');
});

// 监听底层错误 (如果有)
provider.on('connection-error', event => {
  console.error('底层连接错误:', event);
});

let yText = yDoc.getText('document')
let socket: any = null
let isApplyingRemote: boolean = false

// 设置 Awareness (广播给其他人：我是谁)
provider.awareness.setLocalStateField('user', {
  name: userName.value,
  color: userColor.value,
})

let editorInstance = useEditor({
  // content: model.value,
  editorProps: {
    attributes: {
      class: "tiptap-prose",
    },
    // attributes: {
    //   class: 'prose prose-sm sm:prose-base lg:prose-lg xl:prose-2xl m-5 focus:outline-none',
    // },
  },
  extensions: [
    Collaboration.configure({
      document: yDoc, // 将编辑器绑定到 Yjs 文档
    }),
    // B. 光标同步核心
    CollaborationCaret.configure({
      provider: provider,
      user: {
        name: userName.value,
        color: userColor.value,
      },
    }),
    Placeholder.configure({
      placeholder: 'Write something … It’ll be shared with everyone else looking at this example.',
    }),
    ...tiptapExtensions()
  ],
  // // 如果是新房间，初始化一些默认内容
  // onCreate({ editor }) {
  //   const type = yDoc.getXmlFragment('content')
  //   if (type.length === 0) {
  //     console.log('创建新房间', editor)
  //   }
  // },
  // onUpdate: ({ editor }) => {
  //   console.log('更新数据', editor)
  //   model.value = editor.getHTML();
  // },
})



onMounted(() => {

  yText.observe(() => {
    const content = yText.toString()
    console.log(content, 'yjs 发生变化')
    console.log('🔄 UI updated to:', content)
  })

  // 原本用socket.io做的协同内容部分
  // 初始化 Socket.IO
  // socket = io(socketUrl, {
  //   path: socketPath,
  // })
  //
  // socket.on('connect', () => {
  //   console.log('✅ Connected to WebSocket')
  //   socket.emit('join', { docId })
  // })
  //
  // socket.on('initDoc', (data: any) => {
  //   try {
  //     const update = new Uint8Array(data.update)
  //     isApplyingRemote = true
  //     Y.applyUpdate(yDoc, update, 'socket') // 👈 加 origin
  //     isApplyingRemote = false
  //   } catch (err) {
  //     console.error('Failed to apply initDoc:', err)
  //   }
  // })
  //
  // socket.on('update', (data: any) => {
  //   try {
  //     const update = new Uint8Array(data.update)
  //     isApplyingRemote = true
  //     Y.applyUpdate(yDoc, update, 'socket') // 👈 加 origin
  //     isApplyingRemote = false
  //   } catch (err) {
  //     console.error('Failed to apply remote update:', err)
  //   } finally {
  //     isApplyingRemote = false // ✅ 无论成功失败都会重置
  //   }
  // })

  // 监听本地 Yjs 变化 → 发送更新
  yDoc.on('update', (update, origin) => {
    console.log(update, origin, 'yjs 更新')
    // if (origin !== 'socket' && socket?.connected) {
    //   console.log(update, origin, 'yjs 更新 222')
    //   socket.emit('update', {
    //     docId,
    //     update: Array.from(update),
    //   })
    // }
  })
})

onBeforeUnmount(() => {
  editorInstance.value?.destroy();
  provider.destroy();
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