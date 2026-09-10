<script setup lang="ts">
/**
 * GomokuGame.vue - 五子棋主组件
 * 职责: 组合棋盘 + 面板, 处理游戏逻辑通信
 */
import { DEFAULT_BOARD_CONFIG } from './types'
import { useGomoku } from './useGomoku'
import GomokuBoard from './GomokuBoard.vue'
import GomokuPanel from './GomokuPanel.vue'

const {
  state,
  currentPlayerText,
  winnerText,
  lastMove,
  placeStone,
  undoMove,
  resetGame,
} = useGomoku(DEFAULT_BOARD_CONFIG)

/** 处理落子, 边界校验 */
function handlePlace(row: number, col: number) {
  const { gridSize } = DEFAULT_BOARD_CONFIG
  if (row < 0 || row >= gridSize || col < 0 || col >= gridSize) return
  placeStone(row, col)
}
</script>

<template>
  <div class="gomoku-game">
    <GomokuBoard
      :board="state.board"
      :last-move="lastMove"
      :game-over="state.gameOver"
      :config="DEFAULT_BOARD_CONFIG"
      @place="handlePlace"
    />
    <GomokuPanel
      :current-player="state.currentPlayer"
      :game-over="state.gameOver"
      :winner="state.winner"
      :history="state.history"
      :current-player-text="currentPlayerText"
      :winner-text="winnerText"
      @undo="undoMove"
      @reset="resetGame"
    />
  </div>
</template>

<style scoped>
.gomoku-game {
  display: flex;
  gap: 24px;
  align-items: flex-start;
  padding: 24px;
}
</style>
