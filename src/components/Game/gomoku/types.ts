/** 五子棋类型定义 */

/** 棋格状态: 0=空, 1=黑, 2=白 */
export type CellState = 0 | 1 | 2

/** 玩家: 1=黑, 2=白 */
export type Player = 1 | 2

/** 落子坐标 */
export interface Position {
  row: number
  col: number
}

/** 落子记录 */
export interface Move {
  player: Player
  position: Position
  timestamp: number
}

/** 游戏状态 */
export interface GameState {
  board: CellState[][]
  currentPlayer: Player
  gameOver: boolean
  winner: CellState
  history: Move[]
  moveCount: number
}

/** 棋盘配置 */
export interface BoardConfig {
  /** 棋盘格数 (15x15) */
  gridSize: number
  /** 格子大小(px) */
  cellSize: number
  /** 画布边距(px) */
  padding: number
}

/** Canvas绘制上下文类型 */
export type CanvasCtx = CanvasRenderingContext2D

export const DEFAULT_BOARD_CONFIG: BoardConfig = {
  gridSize: 15,
  cellSize: 40,
  padding: 30,
}
