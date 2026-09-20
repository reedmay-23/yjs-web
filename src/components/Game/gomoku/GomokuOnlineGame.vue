<script setup lang="ts">
/**
 * GomokuOnlineGame.vue - Yjs 实时对战五子棋主组件
 * 接入 Yjs 文档系统, 实现跨客户端实时同步对战
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { DEFAULT_BOARD_CONFIG, type BoardConfig } from './types'
import { useGomokuYjs } from './useGomokuYjs'
import { getCurrentAccount } from '@/utils/session'
import GomokuBoard from './GomokuBoard.vue'
import GomokuOnlinePanel from './GomokuOnlinePanel.vue'

const props = defineProps<{
  /** 文档ID, 用于 Yjs room 的权限校验与隔离 */
  documentId: string | number
  /** 当前用户名 */
  userName?: string
  resourceId?: string | number
  canEdit?: boolean
  embedded?: boolean
}>()

const {
  board,
  currentPlayer,
  gameOver,
  winner,
  history,
  connectionStatus,
  connectionMessage,
  onlinePlayers,
  myColor,
  myColorText,
  isMyTurn,
  isSpectator,
  canUndo,
  canReset,
  currentPlayerText,
  winnerText,
  lastMove,
  seats,
  pendingUndo,
  pendingReset,
  placeStone,
  joinBattle,
  releaseSeat,
  requestUndo,
  cancelUndo,
  respondUndo,
  requestReset,
  cancelReset,
  respondReset,
} = useGomokuYjs({
  documentId: props.documentId,
  config: DEFAULT_BOARD_CONFIG,
  userName: props.userName || getCurrentAccount(),
})

/**
 * 嵌入模式: 按容器实际尺寸动态计算棋盘格大小,
 * 让棋盘与面板尽量填满外层区块; 全屏工作区仍用默认配置。
 */
const EMBED_PADDING = 14
const EMBED_OUTER_PADDING = 16
const EMBED_PANEL_RESERVE = 256
const EMBED_CELL_MIN = 12
const EMBED_CELL_MAX = 40
const EMBED_SLACK = 2

const hostRef = ref<HTMLElement | null>(null)
const embeddedCellSize = ref(DEFAULT_BOARD_CONFIG.cellSize)
let embeddedResizeObserver: ResizeObserver | null = null

function updateEmbeddedSize() {
  const host = hostRef.value
  if (!host) return
  const height = host.clientHeight
  const width = host.clientWidth
  if (height <= 0 || width <= 0) return
  const span = DEFAULT_BOARD_CONFIG.gridSize - 1
  const innerHeight = height - EMBED_OUTER_PADDING * 2 - EMBED_PADDING * 2 - EMBED_SLACK
  const reserved = EMBED_PANEL_RESERVE
  const innerWidth = width - EMBED_OUTER_PADDING * 2 - EMBED_PADDING * 2 - reserved
  const cell = Math.floor(Math.min(innerHeight, innerWidth) / span)
  embeddedCellSize.value = Math.min(EMBED_CELL_MAX, Math.max(EMBED_CELL_MIN, cell))
}

onMounted(() => {
  if (!props.embedded) return
  updateEmbeddedSize()
  if (typeof ResizeObserver === 'undefined') return
  const host = hostRef.value
  if (!host) return
  embeddedResizeObserver = new ResizeObserver(() => updateEmbeddedSize())
  embeddedResizeObserver.observe(host)
})

onBeforeUnmount(() => {
  embeddedResizeObserver?.disconnect()
  embeddedResizeObserver = null
})

const boardConfig = computed<BoardConfig>(() =>
  props.embedded
    ? { ...DEFAULT_BOARD_CONFIG, cellSize: embeddedCellSize.value, padding: EMBED_PADDING }
    : DEFAULT_BOARD_CONFIG,
)

function handlePlace(row: number, col: number) {
  const { gridSize } = DEFAULT_BOARD_CONFIG
  if (row < 0 || row >= gridSize || col < 0 || col >= gridSize) return
  placeStone(row, col)
}

</script>

<template>
  <div ref="hostRef" :class="['gomoku-online-game', props.embedded ? 'is-embedded' : '']">
    <div class="board-area">
      <GomokuBoard
        :board="board"
        :last-move="lastMove"
        :game-over="gameOver || isSpectator || !isMyTurn"
        :config="boardConfig"
        @place="handlePlace"
      />
    </div>
    <div class="panel-area">
      <GomokuOnlinePanel
        :current-player="currentPlayer"
        :game-over="gameOver"
        :winner="winner"
        :history="history"
        :current-player-text="currentPlayerText"
        :winner-text="winnerText"
        :online-players="onlinePlayers"
        :my-color="myColor"
        :my-color-text="myColorText"
        :is-my-turn="isMyTurn"
        :is-spectator="isSpectator"
        :can-undo="canUndo"
        :can-reset="canReset"
        :seats="seats"
        :pending-undo="pendingUndo"
        :pending-reset="pendingReset"
        :connection-status="connectionStatus"
        :connection-message="connectionMessage"
        @join-battle="joinBattle"
        @release-seat="releaseSeat"
        @request-undo="requestUndo"
        @cancel-undo="cancelUndo"
        @respond-undo="respondUndo"
        @request-reset="requestReset"
        @cancel-reset="cancelReset"
        @respond-reset="respondReset"
      />
    </div>
  </div>
</template>

<style scoped>
.gomoku-online-game {
  display: flex;
  gap: 20px;
  align-items: flex-start;
  padding: 20px;
  min-height: 100%;
}

.board-area {
  flex-shrink: 0;
}

/* 嵌入编辑器内联块: 填满外层区块, 棋盘按容器自适应, 面板拉伸补足剩余空间 */
.gomoku-online-game.is-embedded {
  box-sizing: border-box;
  width: 100%;
  height: 100%;
  flex-wrap: nowrap;
  align-items: center;
  justify-content: center;
  gap: 16px;
  padding: 16px;
  overflow: hidden;
}

.gomoku-online-game.is-embedded .board-area {
  flex: 0 0 auto;
}

.gomoku-online-game.is-embedded .panel-area {
  display: flex;
  flex: 1 1 320px;
  min-width: 240px;
  max-width: 720px;
  min-height: 0;
  height: 100%;
  align-self: stretch;
}

.gomoku-online-game.is-embedded .panel-area :deep(.gomoku-online-panel) {
  flex: 1;
  width: 100%;
  min-height: 0;
  overflow: hidden;
}

.gomoku-online-game.is-embedded .panel-area :deep(.history-list) {
  max-height: none;
}
</style>
