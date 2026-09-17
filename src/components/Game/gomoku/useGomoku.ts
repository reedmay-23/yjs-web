/**
 * 五子棋游戏逻辑 Composable
 * 负责: 棋盘状态管理、胜负判断、落子、悔棋、重置
 */
import { reactive, computed } from 'vue'
import type { CellState, Position, GameState, BoardConfig } from './types'
import { DEFAULT_BOARD_CONFIG } from './types'

export function useGomoku(config: BoardConfig = DEFAULT_BOARD_CONFIG) {
  const { gridSize } = config

  const state = reactive<GameState>({
    board: createEmptyBoard(gridSize),
    currentPlayer: 1, // 黑先
    gameOver: false,
    winner: 0,
    history: [],
    moveCount: 0,
  })

  /** 创建空棋盘 */
  function createEmptyBoard(size: number): CellState[][] {
    return Array.from({ length: size }, () => new Array<CellState>(size).fill(0))
  }

  /** 当前玩家显示文字 */
  const currentPlayerText = computed(() => {
    if (state.gameOver) return ''
    return state.currentPlayer === 1 ? '黑棋' : '白棋'
  })

  /** 获胜方显示文字 */
  const winnerText = computed(() => {
    if (!state.gameOver) return ''
    if (state.winner === 0) return '平局'
    return state.winner === 1 ? '黑棋胜' : '白棋胜'
  })

  /**
   * 读取指定格子的状态。
   * noUncheckedIndexedAccess 下 state.board[row] 可能是 undefined，统一在这里兜底为 0(空)。
   */
  function readCell(row: number, col: number): CellState {
    if (row < 0 || row >= gridSize || col < 0 || col >= gridSize) return 0
    return state.board[row]?.[col] ?? 0
  }

  /** 最后一手棋 */
  const lastMove = computed<Position | null>(() => {
    const last = state.history[state.history.length - 1]
    return last ? last.position : null
  })

  /**
   * 落子
   * @returns true=落子成功, false=无效落子
   */
  function placeStone(row: number, col: number): boolean {
    // 边界检查
    if (row < 0 || row >= gridSize || col < 0 || col >= gridSize) return false
    // 游戏已结束
    if (state.gameOver) return false
    // 该位置已有棋子
    if (readCell(row, col) !== 0) return false

    const player = state.currentPlayer
    const targetRow = state.board[row]
    if (!targetRow) return false
    targetRow[col] = player
    state.moveCount++

    state.history.push({
      player,
      position: { row, col },
      timestamp: Date.now(),
    })

    // 判断胜负
    if (checkWin(row, col, player)) {
      state.gameOver = true
      state.winner = player
    } else if (state.moveCount >= gridSize * gridSize) {
      // 棋盘满了, 平局
      state.gameOver = true
      state.winner = 0
    } else {
      // 切换玩家
      state.currentPlayer = state.currentPlayer === 1 ? 2 : 1
    }

    return true
  }

  /**
   * 悔棋 - 撤销最后一步
   * @returns true=悔棋成功
   */
  function undoMove(): boolean {
    if (state.history.length === 0) return false

    const lastMove = state.history.pop()
    if (!lastMove) return false

    const targetRow = state.board[lastMove.position.row]
    if (targetRow) {
      targetRow[lastMove.position.col] = 0
    }
    state.moveCount = Math.max(0, state.moveCount - 1)

    // 如果游戏已结束, 重新开始当前回合
    if (state.gameOver) {
      state.gameOver = false
      state.winner = 0
    }

    state.currentPlayer = lastMove.player
    return true
  }

  /** 重置游戏 */
  function resetGame() {
    state.board = createEmptyBoard(gridSize)
    state.currentPlayer = 1
    state.gameOver = false
    state.winner = 0
    state.history = []
    state.moveCount = 0
  }

  /**
   * 以(row,col)为中心, 检查player是否连成五子
   * 检查4个方向: 横、竖、左斜、右斜
   */
  function checkWin(row: number, col: number, player: CellState): boolean {
    const directions: [number, number][] = [
      [0, 1],  // 横向
      [1, 0],  // 竖向
      [1, 1],  // 右下斜
      [1, -1], // 左下斜
    ]

    for (const [dr, dc] of directions) {
      let count = 1 // 包括当前落子

      // 正方向
      for (let i = 1; i <= 4; i++) {
        const nr = row + dr * i
        const nc = col + dc * i
        if (nr < 0 || nr >= gridSize || nc < 0 || nc >= gridSize) break
        if (readCell(nr, nc) !== player) break
        count++
      }

      // 反方向
      for (let i = 1; i <= 4; i++) {
        const nr = row - dr * i
        const nc = col - dc * i
        if (nr < 0 || nr >= gridSize || nc < 0 || nc >= gridSize) break
        if (readCell(nr, nc) !== player) break
        count++
      }

      if (count >= 5) return true
    }

    return false
  }

  return {
    state,

    currentPlayerText,
    winnerText,
    lastMove,
    placeStone,
    undoMove,
    resetGame,
  }
}


