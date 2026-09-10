<script setup lang="ts">
/**
 * GomokuPanel.vue - 五子棋控制面板
 * 职责: 显示当前玩家、胜负结果、落子历史、操作按钮
 */
import type { Player, CellState, Move } from './types'

defineProps<{
  currentPlayer: Player
  gameOver: boolean
  winner: CellState
  history: Move[]
  currentPlayerText: string
  winnerText: string
}>()

const emit = defineEmits<{
  (e: 'undo'): void
  (e: 'reset'): void
}>()

/** 格式化时间 */
function formatTime(ts: number): string {
  const d = new Date(ts)
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`
}

/** 棋子显示文字 */
function playerLabel(player: Player): string {
  return player === 1 ? '● 黑' : '○ 白'
}

/** 坐标显示 */
function coordLabel(row: number, col: number): string {
  const colLabel = String.fromCharCode(65 + col) // A-O
  return `${colLabel}${15 - row}`
}
</script>

<template>
  <div class="gomoku-panel">
    <!-- 状态栏 -->
    <div class="status-bar">
      <div v-if="!gameOver" class="current-turn">
        <span :class="['stone-icon', currentPlayer === 1 ? 'black' : 'white']" />
        <span>{{ currentPlayerText }}落子</span>
      </div>
      <div v-else class="game-result">
        <span class="winner-text">{{ winnerText }}</span>
      </div>
    </div>

    <!-- 操作按钮 -->
    <div class="actions">
      <button class="btn" @click="emit('undo')" :disabled="history.length === 0">
        ↩ 悔棋
      </button>
      <button class="btn primary" @click="emit('reset')">
        🔄 重新开始
      </button>
    </div>

    <!-- 落子记录 -->
    <div class="history-section">
      <div class="history-header">
        <span>📋 落子记录</span>
        <span class="move-count">共 {{ history.length }} 手</span>
      </div>
      <div class="history-list">
        <div
          v-for="(move, idx) in [...history].reverse()"
          :key="idx"
          class="history-item"
        >
          <span class="move-num">#{{ history.length - idx }}</span>
          <span :class="['stone-dot', move.player === 1 ? 'black' : 'white']" />
          <span class="move-player">{{ playerLabel(move.player) }}</span>
          <span class="move-coord">{{ coordLabel(move.position.row, move.position.col) }}</span>
          <span class="move-time">{{ formatTime(move.timestamp) }}</span>
        </div>
        <div v-if="history.length === 0" class="empty-hint">
          暂无落子记录
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.gomoku-panel {
  background: #2c2c2c;
  border-radius: 12px;
  padding: 16px;
  color: #e0e0e0;
  min-width: 220px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* 状态栏 */
.status-bar {
  text-align: center;
  padding: 12px;
  background: #3a3a3a;
  border-radius: 8px;
}

.current-turn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font-size: 16px;
  font-weight: 600;
}

.stone-icon {
  display: inline-block;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  border: 2px solid #666;
}
.stone-icon.black {
  background: radial-gradient(circle at 35% 35%, #555, #000);
}
.stone-icon.white {
  background: radial-gradient(circle at 35% 35%, #fff, #c8c0b0);
}

.game-result {
  font-size: 18px;
  font-weight: 700;
}
.winner-text {
  color: #f1c40f;
}

/* 按钮 */
.actions {
  display: flex;
  gap: 8px;
}

.btn {
  flex: 1;
  padding: 8px 12px;
  border: 1px solid #555;
  border-radius: 6px;
  background: #3a3a3a;
  color: #e0e0e0;
  cursor: pointer;
  font-size: 13px;
  transition: all 0.2s;
}
.btn:hover:not(:disabled) {
  background: #4a4a4a;
  border-color: #777;
}
.btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.btn.primary {
  background: #2980b9;
  border-color: #2980b9;
}
.btn.primary:hover {
  background: #3498db;
}

/* 历史记录 */
.history-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.history-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 8px;
}

.move-count {
  font-size: 12px;
  color: #999;
}

.history-list {
  flex: 1;
  overflow-y: auto;
  max-height: 300px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.history-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 13px;
  background: #3a3a3a;
}

.move-num {
  color: #888;
  font-size: 11px;
  min-width: 28px;
}

.stone-dot {
  display: inline-block;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  border: 1px solid #666;
}
.stone-dot.black {
  background: #000;
}
.stone-dot.white {
  background: #e0e0e0;
}

.move-player {
  min-width: 32px;
}

.move-coord {
  color: #aaa;
  font-family: monospace;
  min-width: 28px;
}

.move-time {
  margin-left: auto;
  color: #777;
  font-size: 11px;
}

.empty-hint {
  text-align: center;
  color: #666;
  padding: 20px;
  font-size: 13px;
}
</style>
