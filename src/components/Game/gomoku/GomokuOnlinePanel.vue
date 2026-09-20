<script setup lang="ts">
/**
 * GomokuOnlinePanel.vue - 在线对战控制面板
 * 显示: 连接状态、我的身份、当前回合、胜负结果、在线玩家、落子记录, 并提供悔棋/重置。
 */
import { computed } from 'vue'
import type { Player, CellState, Move } from './types'
import type { OnlinePlayer, PendingRequest } from './useGomokuYjs'
import type { CollabStatus } from '@/services/collab1'

const props = defineProps<{
  currentPlayer: Player
  gameOver: boolean
  winner: CellState
  history: Move[]
  currentPlayerText: string
  winnerText: string
  onlinePlayers: OnlinePlayer[]
  myColor: Player | 0
  myColorText: string
  isMyTurn: boolean
  isSpectator: boolean
  canUndo: boolean
  canReset: boolean
  connectionStatus: CollabStatus
  connectionMessage: string
  seats: { black: string | null; white: string | null }
  pendingUndo: PendingRequest | null
  pendingReset: PendingRequest | null
}>()

const emit = defineEmits<{
  (e: 'join-battle'): void
  (e: 'release-seat'): void
  (e: 'request-undo'): void
  (e: 'cancel-undo'): void
  (e: 'respond-undo', approve: boolean): void
  (e: 'request-reset'): void
  (e: 'cancel-reset'): void
  (e: 'respond-reset', approve: boolean): void
}>()

const spectators = computed(() => props.onlinePlayers.filter((player) => player.color === 0))
const canJoinBattle = computed(() => props.seats.black === null || props.seats.white === null)

function formatTime(ts: number): string {
  const d = new Date(ts)
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`
}

function playerLabel(player: Player): string {
  return player === 1 ? '● 黑' : '○ 白'
}

function coordLabel(row: number, col: number): string {
  const colLabel = String.fromCharCode(65 + col)
  return `${colLabel}${15 - row}`
}

function colorClass(color: Player | 0): string {
  if (color === 1) return 'bg-gray-900'
  if (color === 2) return 'bg-white border border-gray-300'
  return 'bg-gray-400'
}

function statusDotClass(status: CollabStatus): string {
  if (status === 'connected') return 'bg-emerald-500'
  if (status === 'connecting') return 'bg-amber-500 animate-pulse'
  return 'bg-red-500'
}

function statusText(status: CollabStatus): string {
  if (status === 'connected') return '已连接'
  if (status === 'connecting') return '连接中...'
  return '已断开'
}
</script>

<template>
  <div class="gomoku-online-panel">
    <!-- 连接状态 -->
    <div class="connection-bar">
      <span :class="['status-dot', statusDotClass(connectionStatus)]" />
      <span class="text-xs">{{ statusText(connectionStatus) }}</span>
    </div>
    <p v-if="connectionMessage" class="connection-message">{{ connectionMessage }}</p>

    <!-- 我的身份 -->
    <div class="my-identity">
      <div class="flex items-center gap-2">
        <span :class="['w-5 h-5 rounded-full inline-block', colorClass(myColor)]" />
        <span class="font-semibold">{{ myColorText }}</span>
      </div>
      <p v-if="isSpectator" class="identity-hint">
        默认观战；点击「对战」认领空席后即可加入对局。
      </p>
    </div>

    <!-- 游戏状态 -->
    <div class="status-bar">
      <div v-if="!gameOver" class="current-turn">
        <span :class="['stone-icon', currentPlayer === 1 ? 'black' : 'white']" />
        <span :class="{ 'turn-hint': isMyTurn }">
          {{ isMyTurn ? '轮到你了!' : `${currentPlayerText}落子` }}
        </span>
      </div>
      <div v-else class="game-result">
        <span class="winner-text">{{ winnerText }}</span>
      </div>
    </div>

    <!-- 双方确认：悔棋 -->
    <div v-if="pendingUndo" class="confirm-bar">
      <p class="confirm-hint">
        {{ pendingUndo.byMe ? '你请求悔棋，等待对方确认...' : `${pendingUndo.requesterName} 请求悔掉最后一手` }}
      </p>
      <div class="confirm-actions">
        <button v-if="pendingUndo.byMe" type="button" class="action-btn" @click="emit('cancel-undo')">
          撤回请求
        </button>
        <template v-else>
          <button type="button" class="action-btn agree" @click="emit('respond-undo', true)">
            同意悔棋
          </button>
          <button type="button" class="action-btn" @click="emit('respond-undo', false)">
            拒绝
          </button>
        </template>
      </div>
    </div>

    <!-- 双方确认：重置 -->
    <div v-if="pendingReset" class="confirm-bar">
      <p class="confirm-hint">
        {{ pendingReset.byMe ? '你请求重置，等待对方确认...' : `${pendingReset.requesterName} 请求清空重新开局` }}
      </p>
      <div class="confirm-actions">
        <button v-if="pendingReset.byMe" type="button" class="action-btn" @click="emit('cancel-reset')">
          撤回请求
        </button>
        <template v-else>
          <button type="button" class="action-btn agree" @click="emit('respond-reset', true)">
            同意重置
          </button>
          <button type="button" class="action-btn" @click="emit('respond-reset', false)">
            拒绝
          </button>
        </template>
      </div>
    </div>

    <!-- 操作按钮 -->
    <div class="actions">
      <button
        v-if="isSpectator"
        type="button"
        class="action-btn primary"
        :disabled="!canJoinBattle || connectionStatus !== 'connected'"
        :title="canJoinBattle ? '认领空席，加入对局' : '对战席位已满，只能观战'"
        @click="emit('join-battle')"
      >
        ⚔ 对战
      </button>
      <template v-else>
        <button
          type="button"
          class="action-btn"
          title="离开对战席位，转为观战"
          @click="emit('release-seat')"
        >
          👁 观战
        </button>
        <button
          type="button"
          class="action-btn"
          :disabled="!canUndo"
          title="请求撤销自己最后一手，需对方确认后生效"
          @click="emit('request-undo')"
        >
          ↩ 悔棋
        </button>
        <button
          type="button"
          class="action-btn"
          :disabled="!canReset"
          title="请求清空重新开局，需对方确认后生效"
          @click="emit('request-reset')"
        >
          🔄 重置
        </button>
      </template>
    </div>

    <!-- 对战玩家 -->
    <div class="online-section">
      <div class="section-header">
        <span>⚔ 对战玩家</span>
      </div>
      <div class="player-list">
        <div class="player-item">
          <span :class="['player-dot', colorClass(1)]" />
          <span class="player-name">{{ seats.black ?? '空席' }}</span>
          <span class="player-role">黑</span>
        </div>
        <div class="player-item">
          <span :class="['player-dot', colorClass(2)]" />
          <span class="player-name">{{ seats.white ?? '空席' }}</span>
          <span class="player-role">白</span>
        </div>
      </div>
    </div>

    <!-- 观战列表 -->
    <div class="online-section">
      <div class="section-header">
        <span>👁 观战列表</span>
        <span class="count-badge">{{ spectators.length }}</span>
      </div>
      <div class="player-list">
        <div
          v-for="player in spectators"
          :key="player.clientId"
          class="player-item"
        >
          <span :class="['player-dot', colorClass(0)]" />
          <span class="player-name">{{ player.name }}</span>
        </div>
        <div v-if="spectators.length === 0" class="empty-hint">
          暂无观战
        </div>
      </div>
    </div>

    <!-- 落子记录 -->
    <div class="history-section">
      <div class="section-header">
        <span>📋 落子记录</span>
        <span class="count-badge">{{ history.length }} 手</span>
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
          等待第一步落子...
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.gomoku-online-panel {
  background: #2c2c2c;
  border-radius: 12px;
  padding: 16px;
  color: #e0e0e0;
  min-width: 240px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

/* 连接状态 */
.connection-bar {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  background: #3a3a3a;
  border-radius: 6px;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.connection-message {
  flex-shrink: 0;
  margin: 0;
  font-size: 11px;
  line-height: 1.5;
  color: #f1c40f;
}

/* 我的身份 */
.my-identity {
  flex-shrink: 0;
  padding: 10px 12px;
  background: #3a3a3a;
  border-radius: 8px;
  text-align: center;
}

.identity-hint {
  margin: 6px 0 0;
  font-size: 11px;
  line-height: 1.5;
  color: #999;
}

/* 状态栏 */
.status-bar {
  flex-shrink: 0;
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
  font-size: 15px;
  font-weight: 600;
}

.turn-hint {
  color: #2ecc71;
  animation: pulse 1.5s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.6; }
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

/* 操作按钮 */
.actions {
  flex-shrink: 0;
  display: flex;
  gap: 8px;
}

.action-btn {
  flex: 1;
  padding: 8px 10px;
  border: 1px solid #555;
  border-radius: 6px;
  background: #3a3a3a;
  color: #e0e0e0;
  cursor: pointer;
  font-size: 12px;
  transition: background 0.2s, border-color 0.2s;
}

.action-btn:hover:not(:disabled) {
  background: #4a4a4a;
  border-color: #777;
}

.action-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* 通用 section */
.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 8px;
}

.count-badge {
  font-size: 11px;
  color: #999;
  background: #3a3a3a;
  padding: 2px 8px;
  border-radius: 10px;
}

/* 在线玩家 */
.online-section {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
}

.player-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 120px;
  overflow-y: auto;
}

.player-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  background: #3a3a3a;
  border-radius: 6px;
  font-size: 13px;
}

.player-dot {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  flex-shrink: 0;
}

.player-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.player-role {
  font-size: 11px;
  color: #888;
}

/* 历史记录 */
.history-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.history-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  max-height: 280px;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.history-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
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
  flex-shrink: 0;
}
.stone-dot.black { background: #000; }
.stone-dot.white { background: #e0e0e0; }

.move-player {
  min-width: 32px;
  font-size: 12px;
}

.move-coord {
  color: #aaa;
  font-family: monospace;
  min-width: 28px;
  font-size: 12px;
}

.move-time {
  margin-left: auto;
  color: #777;
  font-size: 11px;
}

.empty-hint {
  text-align: center;
  color: #666;
  padding: 16px;
  font-size: 13px;
}

/* 双方确认条 */
.confirm-bar {
  flex-shrink: 0;
  padding: 10px 12px;
  background: #3a3a3a;
  border: 1px solid #555;
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.confirm-hint {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: #f1c40f;
}

.confirm-actions {
  display: flex;
  gap: 8px;
}

.action-btn.primary {
  border-color: #2ecc71;
  color: #2ecc71;
  font-weight: 600;
}

.action-btn.agree {
  border-color: #2ecc71;
  color: #2ecc71;
}
</style>
