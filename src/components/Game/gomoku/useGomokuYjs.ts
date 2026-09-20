/**
 * useGomokuYjs.ts - Yjs 实时同步五子棋 Composable
 *
 * 设计要点（全部围绕「两人对局 + 观战」的强一致诉求）：
 * - 棋盘用 Y.Map<CellState>，key 为 `r:c`。同一格并发落子时 Y.Map 只会保留
 *   其中一个值，天然不会出现「一格两子」或数组索引错位。
 * - 手数、轮次、胜负、悔棋/重置都不再各写一份 meta（那是 LWW，会互相覆盖），
 *   而是全部从「唯一的落子记录」推导出来：moveCount = history.length，
 *   currentPlayer = moveCount 的奇偶，胜负由合并后的棋盘重算。
 * - 执子身份写入 yMeta，但存的是每个浏览器标签页自己的稳定 seatedId（sessionStorage），
 *   而不是每次刷新都会变的 ydoc.clientID，否则刷新后旧席位会被幽灵占住、自己变成观众。
 * - room=gomoku 让棋局与文档正文共享同一篇文档的权限校验，但使用独立的 Y.Doc。
 * - awareness 的 'update' 事件是无条件触发的（只有 'change' 会做深比较去重），
 *   如果在 'update' 回调里再 setLocalStateField 会形成无限递归，必须用重入守卫。
 */
import { ref, computed, onBeforeUnmount } from 'vue'
import * as Y from 'yjs'
import { createCollab1Provider, type Collab1Provider, type CollabStatus } from '@/services/collab1'
import { getAccessToken } from '@/services/api'
import type { CellState, Player, Position, Move, BoardConfig } from './types'
import { DEFAULT_BOARD_CONFIG } from './types'

/** 在线玩家信息 */
export interface OnlinePlayer {
  clientId: number
  name: string
  color: Player | 0 // 0=观战, 1=黑, 2=白
}

/** 等待对方响应的双方确认请求（悔棋/重置） */
export interface PendingRequest {
  /** 请求是否由本端发起 */
  byMe: boolean
  /** 发起方名字，用于确认条展示 */
  requesterName: string
}

/** 棋局房间名，与文档正文 Y.Doc 隔离 */
const GOMOKU_ROOM = 'gomoku'

const GRID_SIZE = DEFAULT_BOARD_CONFIG.gridSize
const TOTAL_CELLS = GRID_SIZE * GRID_SIZE

/** 棋盘格子 → Y.Map key */
function cellKey(row: number, col: number): string {
  return `${row}:${col}`
}

function createEmptyBoard(): CellState[][] {
  return Array.from({ length: GRID_SIZE }, () => new Array<CellState>(GRID_SIZE).fill(0))
}

/** 安全读取棋盘格子，越界或未落子都返回 0 */
function readCell(board: CellState[][], row: number, col: number): CellState {
  if (row < 0 || row >= GRID_SIZE || col < 0 || col >= GRID_SIZE) return 0
  return board[row]?.[col] ?? 0
}

/** 从 Y.Map 棋盘还原二维数组 */
function boardFromYMap(yBoard: Y.Map<CellState>): CellState[][] {
  const board = createEmptyBoard()

  yBoard.forEach((value, key) => {
    const [rowText, colText] = key.split(':')
    const row = Number(rowText)
    const col = Number(colText)

    if (!Number.isInteger(row) || !Number.isInteger(col)) return
    if (row < 0 || row >= GRID_SIZE || col < 0 || col >= GRID_SIZE) return

    board[row]![col] = value
  })

  return board
}

/** 以 (row,col) 为中心判断是否连成五子 */
function checkWin(board: CellState[][], row: number, col: number, player: CellState): boolean {
  if (player === 0) return false

  const directions: [number, number][] = [
    [0, 1], [1, 0], [1, 1], [1, -1],
  ]

  for (const [dr, dc] of directions) {
    let count = 1

    for (let i = 1; i <= 4; i++) {
      if (readCell(board, row + dr * i, col + dc * i) !== player) break
      count++
    }

    for (let i = 1; i <= 4; i++) {
      if (readCell(board, row - dr * i, col - dc * i) !== player) break
      count++
    }

    if (count >= 5) return true
  }

  return false
}

/**
 * 从最终棋盘 + 落子记录推导胜负。
 * 只依赖「落子集合」本身，不依赖任何 LWW 字段，因此并发落子后两端结果一致。
 */
function resolveResult(board: CellState[][], moves: Move[]): { gameOver: boolean; winner: CellState } {
  // 从最后一手往前找，第一个形成五连的就是获胜方
  for (let i = moves.length - 1; i >= 0; i--) {
    const move = moves[i]!
    const color = readCell(board, move.position.row, move.position.col)

    // 该格已被并发覆盖成别的颜色，说明这一手实际未生效
    if (color !== move.player) continue

    if (checkWin(board, move.position.row, move.position.col, color)) {
      return { gameOver: true, winner: color }
    }
  }

  if (moves.length >= TOTAL_CELLS) {
    return { gameOver: true, winner: 0 }
  }

  return { gameOver: false, winner: 0 }
}

function readMoves(yHistory: Y.Array<Y.Map<unknown>>): Move[] {
  const moves: Move[] = []

  for (let i = 0; i < yHistory.length; i++) {
    const item = yHistory.get(i)
    if (!item) continue

    const row = item.get('row')
    const col = item.get('col')

    if (typeof row !== 'number' || typeof col !== 'number') continue

    const clientId = item.get('clientId')

    moves.push({
      player: (item.get('player') as Player) ?? 1,
      position: { row, col },
      timestamp: (item.get('timestamp') as number) ?? 0,
      // clientId 用于悔棋判断「最后一手是不是本端下的」，旧数据可能没有该字段。
      clientId: typeof clientId === 'number' ? clientId : undefined,
      // seatedId 刷新后仍稳定，悔棋双方确认协议用它校验最后一手归属。
      seatedId: typeof item.get('seatedId') === 'string' ? (item.get('seatedId') as string) : undefined,
    })
  }

  return moves
}

export function useGomokuYjs(options: {
  documentId: string | number
  config?: BoardConfig
  userName?: string
}) {
  const { documentId, config = DEFAULT_BOARD_CONFIG, userName = '玩家' } = options

  // ── Yjs 核心 ──
  const ydoc = new Y.Doc()
  const yBoard = ydoc.getMap<CellState>('board')
  const yMeta = ydoc.getMap<unknown>('meta')
  const yHistory = ydoc.getArray<Y.Map<unknown>>('history')

  // ── 连接状态 ──
  const connectionStatus = ref<CollabStatus>('connecting')
  const connectionMessage = ref('正在连接协作服务...')
  const onlinePlayers = ref<OnlinePlayer[]>([])

  // ── 对战席位与双方确认请求 ──
  /** 对战两个席位上的玩家名字（null 表示空席） */
  const seats = ref<{ black: string | null; white: string | null }>({ black: null, white: null })
  /** 等待对方确认的悔棋请求 */
  const pendingUndo = ref<PendingRequest | null>(null)
  /** 等待对方确认的重置请求 */
  const pendingReset = ref<PendingRequest | null>(null)

  // ─ 本地视图状态（全部由 Yjs 推导） ──
  const board = ref<CellState[][]>(createEmptyBoard())
  const history = ref<Move[]>([])
  const gameOver = ref(false)
  const winner = ref<CellState>(0)

  const moveCount = computed(() => history.value.length)
  const currentPlayer = computed<Player>(() => (moveCount.value % 2 === 0 ? 1 : 2))

  // ── 当前玩家身份 ──
  const myColor = ref<Player | 0>(0) // 0=未分配/观战
  const isSpectator = computed(() => myColor.value === 0)

  const currentPlayerText = computed(() => (currentPlayer.value === 1 ? '黑棋' : '白棋'))

  const winnerText = computed(() => {
    if (!gameOver.value) return ''
    if (winner.value === 0) return '平局'
    return winner.value === 1 ? '黑棋胜' : '白棋胜'
  })

  const lastMove = computed<Position | null>(() => {
    const moves = history.value
    return moves.length === 0 ? null : moves[moves.length - 1]!.position
  })

  const myColorText = computed(() => {
    if (myColor.value === 1) return '你执黑'
    if (myColor.value === 2) return '你执白'
    return '观战中'
  })

  const isMyTurn = computed(
    () => !gameOver.value && myColor.value !== 0 && myColor.value === currentPlayer.value,
  )

  /** 判断某手记录是否由本席位落下（优先 seatedId，旧数据回退 clientId） */
  function isMyMove(move: Move): boolean {
    if (move.seatedId) return move.seatedId === seatedId
    return move.clientId === ydoc.clientID
  }

  // 悔棋走双方确认协议：只有最后一手的落子方能发起，且已有请求在等待时不能重复发起。
  const canUndo = computed(() => {
    if (myColor.value === 0 || connectionStatus.value !== 'connected') return false
    if (pendingUndo.value) return false
    const last = history.value[history.value.length - 1]
    return Boolean(last && isMyMove(last))
  })

  const canReset = computed(
    () =>
      myColor.value !== 0 &&
      history.value.length > 0 &&
      connectionStatus.value === 'connected' &&
      !pendingReset.value,
  )

  /**
   * 每个标签页在 sessionStorage 里保存一个稳定的座位 ID 作为「我是谁」。
   * 直接用 ydoc.clientID 的话每次刷新都会换一个新数字，旧座位永远不会释放，
   * 刷新的人会被判成观众，其他人也永远无法补位。
   * 注意：同一标签页刷新后 sessionStorage 仍在，所以能重新认领回自己的颜色；
   * 复制链接到新标签页会拿到新 ID，此时若原标签页还在线，新标签页就是观战。
   */
  const SEATED_ID_STORAGE_KEY = 'gomoku:seatedId'

  function createSeatedId(): string {
    const random = Math.random().toString(36).slice(2, 10)
    return `${Date.now().toString(36)}-${random}`
  }

  function getSeatedId(): string {
    try {
      const existing = sessionStorage.getItem(SEATED_ID_STORAGE_KEY)
      if (existing) return existing

      const created = createSeatedId()
      sessionStorage.setItem(SEATED_ID_STORAGE_KEY, created)
      return created
    } catch {
      // 隐私模式等场景下 sessionStorage 可能不可用，退化为本次页面生命周期内的随机 ID。
      return createSeatedId()
    }
  }

  const seatedId = getSeatedId()

  /** 判断某个座位是否仍然被在线（或仍持有 awareness）的标签页占用 */
  function isSeatOccupiedByOnlinePeer(seatedIdValue: unknown): boolean {
    if (typeof seatedIdValue !== 'string' || seatedIdValue === seatedId) return false
    if (!provider) return true

    let occupied = false
    const states = provider.awareness.getStates() as Map<number, Record<string, unknown>>

    states.forEach((state) => {
      if (state.seatedId === seatedIdValue) {
        occupied = true
      }
    })

    return occupied
  }

  /**
   * 清理「幽灵席位」：刷新/关闭页面后旧 clientID 已从 awareness 消失，
   * 但 yMeta 里的座位还写着它，导致新老标签页都无法入座。
   */
  /** 断线/关页后座位保留的宽限期：这段时间内回来还能拿回原来的颜色 */
  const SEAT_STALE_GRACE_MS = 30 * 1000

  function readSeatAge(seatAtKey: string): number {
    const seatAt = yMeta.get(seatAtKey)
    return typeof seatAt === 'number' ? Date.now() - seatAt : Number.POSITIVE_INFINITY
  }

  function cleanupStaleSeats() {
    if (!provider) return

    const blackSeatedId = yMeta.get('blackSeatedId')
    const whiteSeatedId = yMeta.get('whiteSeatedId')

    // 只有在「awareness 里已经没有这个人」且「超过宽限期」时才释放座位。
    // 否则刚连上、awareness 还没送达的玩家会被误判为已离线并被抢走座位。
    const blackStale =
      typeof blackSeatedId === 'string' &&
      blackSeatedId !== seatedId &&
      !isSeatOccupiedByOnlinePeer(blackSeatedId) &&
      readSeatAge('blackSeatedAt') > SEAT_STALE_GRACE_MS
    const whiteStale =
      typeof whiteSeatedId === 'string' &&
      whiteSeatedId !== seatedId &&
      !isSeatOccupiedByOnlinePeer(whiteSeatedId) &&
      readSeatAge('whiteSeatedAt') > SEAT_STALE_GRACE_MS

    if (!blackStale && !whiteStale) return

    ydoc.transact(() => {
      if (blackStale) {
        yMeta.delete('blackSeatedId')
        yMeta.delete('blackSeatedAt')
      }
      if (whiteStale) {
        yMeta.delete('whiteSeatedId')
        yMeta.delete('whiteSeatedAt')
      }
    })
  }

  // ── 从 Yjs 重算本地视图 ──
  function syncFromYjs() {
    const nextBoard = boardFromYMap(yBoard)
    // 并发落子时两个客户端可能同时往 history 追加记录（Y.Array 不会去重），
    // 而 Y.Map 棋盘只会保留其中一枚。这里按「最终棋盘」过滤掉没生效的记录，
    // 保证 moveCount/轮次与棋盘上的真实棋子数一致，否则奇偶轮次会整体错位。
    const moves = readMoves(yHistory).filter(
      (move) => readCell(nextBoard, move.position.row, move.position.col) === move.player,
    )
    const result = resolveResult(nextBoard, moves)

    board.value = nextBoard
    history.value = moves
    gameOver.value = result.gameOver
    winner.value = result.winner

    const blackSeatedId = yMeta.get('blackSeatedId')
    const whiteSeatedId = yMeta.get('whiteSeatedId')

    if (blackSeatedId === seatedId) {
      myColor.value = 1
    } else if (whiteSeatedId === seatedId) {
      myColor.value = 2
    } else {
      myColor.value = 0
    }

    refreshSeats()
    pendingUndo.value = readPendingRequest('undoReqBy', yMeta.get('undoReqMoves') === yHistory.length)
    pendingReset.value = readPendingRequest('resetReqBy', true)
  }

  /** 按席位 ID 找在线玩家的名字；本端直接用自己的 userName */
  function nameBySeatedId(target: string): string | null {
    if (target === seatedId) return userName
    if (!provider) return null

    const states = provider.awareness.getStates() as Map<number, Record<string, unknown>>
    let found: string | null = null
    states.forEach((state) => {
      if (state.seatedId === target && typeof state.userName === 'string') {
        found = state.userName as string
      }
    })
    return found
  }

  /** 席位名字：空席返回 null，持有人不在线返回「离线玩家」 */
  function resolveSeatName(seatedIdValue: unknown): string | null {
    if (typeof seatedIdValue !== 'string') return null
    return nameBySeatedId(seatedIdValue) ?? '离线玩家'
  }

  function refreshSeats() {
    seats.value = {
      black: resolveSeatName(yMeta.get('blackSeatedId')),
      white: resolveSeatName(yMeta.get('whiteSeatedId')),
    }
  }

  /**
   * 读取并校验双方确认请求；无效请求（发起方已离席、悔棋请求后又出现了新手）
   * 直接清掉。清理写在事务里会再触发一次 sync，但清理后条件不成立，不会循环。
   */
  function readPendingRequest(byKey: string, movesValid: boolean): PendingRequest | null {
    const reqBy = yMeta.get(byKey)
    if (typeof reqBy !== 'string') return null

    const requesterSeated =
      reqBy === yMeta.get('blackSeatedId') || reqBy === yMeta.get('whiteSeatedId')

    if (!requesterSeated || !movesValid) {
      ydoc.transact(() => {
        yMeta.delete(byKey)
        if (byKey === 'undoReqBy') {
          yMeta.delete('undoReqAt')
          yMeta.delete('undoReqMoves')
        } else {
          yMeta.delete('resetReqAt')
        }
      })
      return null
    }

    return {
      byMe: reqBy === seatedId,
      requesterName: nameBySeatedId(reqBy) ?? '对方',
    }
  }

  // ── 玩家身份分配 ──
  /**
   * 点「对战」手动认领空席：默认进入房间是观战，不自动入座。
   * 认领必须在 Yjs 事务里做「读-改-写」，保证并发时只有一个客户端拿到同一个座位。
   */
  function joinBattle(): boolean {
    if (connectionStatus.value !== 'connected') return false
    if (myColor.value !== 0) return false

    // 先清掉已断线标签页留下的幽灵座位，再决定自己能否入座。
    cleanupStaleSeats()

    let joined = false
    ydoc.transact(() => {
      // 座位和时间戳必须一起写，时间戳用于判断座位是否已经长时间没有主人。
      if (yMeta.get('blackSeatedId') === undefined) {
        yMeta.set('blackSeatedId', seatedId)
        yMeta.set('blackSeatedAt', Date.now())
        joined = true
        return
      }

      if (yMeta.get('whiteSeatedId') === undefined) {
        yMeta.set('whiteSeatedId', seatedId)
        yMeta.set('whiteSeatedAt', Date.now())
        joined = true
      }
    })

    if (joined) {
      syncFromYjs()
      if (provider) syncAwareness(provider.awareness)
    }
    return joined
  }

  /** 主动申请成为观战者（放弃自己的席位） */
  function spectate() {
    ydoc.transact(() => {
      if (yMeta.get('blackSeatedId') === seatedId) {
        yMeta.delete('blackSeatedId')
        yMeta.delete('blackSeatedAt')
      }

      if (yMeta.get('whiteSeatedId') === seatedId) {
        yMeta.delete('whiteSeatedId')
        yMeta.delete('whiteSeatedAt')
      }

      // 离席后我发起但还没被确认的悔棋/重置请求一并撤回
      if (yMeta.get('undoReqBy') === seatedId) {
        yMeta.delete('undoReqBy')
        yMeta.delete('undoReqAt')
        yMeta.delete('undoReqMoves')
      }
      if (yMeta.get('resetReqBy') === seatedId) {
        yMeta.delete('resetReqBy')
        yMeta.delete('resetReqAt')
      }
    })
  }

  // ── 落子 ─
  /**
   * 把「棋盘上写入棋子」和「history 里追加落子记录」放在同一个 Yjs 事务里。
   * 轮次、胜负都从 history 推导，所以两处必须原子地保持一致；
   * 之前函数里包含了 currentPlayer 的派生判断，多个客户端在时间差内
   * 可能对「这一手算不算数」得出不同结论，从而出现双写或 history 与棋盘不一致。
   */
  function commitMove(row: number, col: number, player: Player): boolean {
    const key = cellKey(row, col)
    // Yjs 事务回调的返回值不会被 transact 透传，所以用外部变量记录实际结果，
    // 避免「没写进去却返回 true」的假成功。
    let committed = false

    ydoc.transact(() => {
      // 先确认此刻目标格仍是空的，再同时写棋盘与 history，保证两者一致。
      if (yBoard.has(key)) return

      yBoard.set(key, player)

      const move = new Y.Map<unknown>()
      move.set('player', player)
      move.set('row', row)
      move.set('col', col)
      move.set('timestamp', Date.now())
      // clientId 记录落子的 Yjs 客户端，用于本端悔棋和战绩归属；
      // 注意它与座位 ID 不同，刷新后这个数字会变，所以座位归属改用 seatedId。
      move.set('clientId', ydoc.clientID)
      move.set('seatedId', seatedId)
      yHistory.push([move])

      committed = true
    })

    return committed
  }

  function placeStone(row: number, col: number): boolean {
    if (!Number.isInteger(row) || !Number.isInteger(col)) return false
    if (row < 0 || row >= GRID_SIZE || col < 0 || col >= GRID_SIZE) return false
    if (gameOver.value) return false
    if (connectionStatus.value !== 'connected') return false
    if (myColor.value === 0) return false
    if (currentPlayer.value !== myColor.value) return false
    if (yBoard.has(cellKey(row, col))) return false

    return commitMove(row, col, myColor.value)
  }

  // ── 悔棋 ──
  /**
   * 悔棋只允许撤销「自己刚下、对手还没应」的那一手。
   * 不能再用 currentPlayer 判断：落子后 currentPlayer 立即切换给对手，
   * 原条件 currentPlayer === myColor 永远不成立，导致悔棋按钮实际是死代码。
   * 这里改为看 last.clientId 是不是本端 ydoc.clientID（每次刷新会变，
   * 因此刷新后旧的一手不再允许撤回，这正是想要的行为）。
   */
  /**
   * 在原始 yHistory 里倒着找某条记录的下标。
   * history.value 是过滤后的视图，下标可能与原始数组不一致，不能直接复用。
   */
  function findRawMoveIndex(row: number, col: number, player: Player): number {
    for (let i = yHistory.length - 1; i >= 0; i -= 1) {
      const item = yHistory.get(i)
      if (!item) continue
      if (item.get('row') !== row || item.get('col') !== col) continue
      if (item.get('player') !== player) continue
      return i
    }
    return -1
  }

  /** 发起悔棋请求（仅最后一手的落子方可发起），等待对方确认后生效 */
  function requestUndo(): boolean {
    if (!canUndo.value) return false

    ydoc.transact(() => {
      yMeta.set('undoReqBy', seatedId)
      yMeta.set('undoReqAt', Date.now())
      // 记录发起时的手数：之后若又出现新手，请求自动失效。
      yMeta.set('undoReqMoves', yHistory.length)
    })
    return true
  }

  /** 撤回我发起的悔棋请求 */
  function cancelUndo(): boolean {
    if (yMeta.get('undoReqBy') !== seatedId) return false
    clearRequest('undo')
    return true
  }

  /** 响应对方的悔棋请求：同意=删除最后一手，拒绝=仅清除请求 */
  function respondUndo(approve: boolean): boolean {
    return respondRequest('undo', approve, () => {
      const last = history.value[history.value.length - 1]
      if (!last) return false

      const { row, col } = last.position
      const rawIndex = findRawMoveIndex(row, col, last.player)
      if (rawIndex < 0) return false

      ydoc.transact(() => {
        yHistory.delete(rawIndex, 1)
        yBoard.delete(cellKey(row, col))
      })
      return true
    })
  }

  /** 对方席位的 seatedId；用于校验确认请求确实来自在座对手 */
  function opponentSeatedId(): unknown {
    if (myColor.value === 1) return yMeta.get('whiteSeatedId')
    if (myColor.value === 2) return yMeta.get('blackSeatedId')
    return undefined
  }

  function clearRequest(kind: 'undo' | 'reset') {
    ydoc.transact(() => {
      if (kind === 'undo') {
        yMeta.delete('undoReqBy')
        yMeta.delete('undoReqAt')
        yMeta.delete('undoReqMoves')
      } else {
        yMeta.delete('resetReqBy')
        yMeta.delete('resetReqAt')
      }
    })
  }

  /**
   * 双方确认响应的统一处理：先校验「请求方仍坐在对面席位」且请求仍有效，
   * 同意则执行动作并清除请求，拒绝则仅清除请求。
   */
  function respondRequest(kind: 'undo' | 'reset', approve: boolean, apply: () => boolean): boolean {
    if (connectionStatus.value !== 'connected' || myColor.value === 0) return false

    const reqBy = yMeta.get(kind === 'undo' ? 'undoReqBy' : 'resetReqBy')
    if (typeof reqBy !== 'string' || reqBy === seatedId) return false
    if (reqBy !== opponentSeatedId()) return false

    if (!approve) {
      clearRequest(kind)
      return true
    }

    if (kind === 'undo' && yMeta.get('undoReqMoves') !== yHistory.length) {
      clearRequest(kind)
      return false
    }
    if (kind === 'reset' && history.value.length === 0) {
      clearRequest(kind)
      return false
    }

    const ok = apply()
    if (ok) clearRequest(kind)
    return ok
  }

  // ── 重置棋局（双方确认） ──
  /** 清空棋盘与落子记录、保留席位；仅在双方确认通过后执行 */
  function applyReset() {
    ydoc.transact(() => {
      yBoard.clear()
      yHistory.delete(0, yHistory.length)
      // 重置后保留双方席位；如果对手已离开，先由 cleanupStaleSeats 释放幽灵座位，
      // 新玩家点「对战」即可入座，也可以点「观战」主动放弃。
      yMeta.set('resetAt', Date.now())
      yMeta.set('resetBy', ydoc.clientID)
      // 兼容旧版本数据：座位字段已改用 *_SeatedId，避免遗留的上一个实现字段继续占位。
      yMeta.delete('blackClientId')
      yMeta.delete('whiteClientId')
    })
  }

  /** 发起重置请求，等待对方确认后生效 */
  function requestReset(): boolean {
    if (!canReset.value) return false

    ydoc.transact(() => {
      yMeta.set('resetReqBy', seatedId)
      yMeta.set('resetReqAt', Date.now())
    })
    return true
  }

  /** 撤回我发起的重置请求 */
  function cancelReset(): boolean {
    if (yMeta.get('resetReqBy') !== seatedId) return false
    clearRequest('reset')
    return true
  }

  /** 响应对方的重置请求：同意=清空重开，拒绝=仅清除请求 */
  function respondReset(approve: boolean): boolean {
    return respondRequest('reset', approve, () => {
      applyReset()
      return true
    })
  }

  /** 离开对战席位（自己转为观战），随时允许；同时撤回我的待确认请求 */
  function releaseSeat(): boolean {
    if (myColor.value === 0) return false
    spectate()
    syncFromYjs()
    if (provider) syncAwareness(provider.awareness)
    return true
  }

  function updateOnlinePlayers(awareness: Collab1Provider['awareness']) {
    const states = awareness.getStates() as Map<number, Record<string, unknown>>
    const players: OnlinePlayer[] = []

    states.forEach((state, clientId) => {
      if (state.gomokuColor !== undefined || state.userName) {
        players.push({
          clientId,
          name: (state.userName as string) || `玩家${clientId}`,
          color: (state.gomokuColor as Player | 0) ?? 0,
        })
      }
    })

    onlinePlayers.value = players
    refreshSeats()
  }

  /**
   * 把自己的席位同步到 awareness，供玩家列表展示。
   * 重入守卫是必须的：awareness.setLocalStateField 会同步触发 'update' 事件，
   * 而 'update' 是无条件触发的（只有 'change' 会做深比较去重），
   * 如果在 'update' 回调里再次调用本函数就会无限递归并栈溢出。
   */
  let syncingAwareness = false

  function syncAwareness(awareness: Collab1Provider['awareness']) {
    if (syncingAwareness) return

    syncingAwareness = true
    try {
      awareness.setLocalStateField('gomokuColor', myColor.value)
      awareness.setLocalStateField('userName', userName)
      // 同时广播稳定的座位 ID，让其他客户端能判断座位持有者是否还在线。
      awareness.setLocalStateField('seatedId', seatedId)
    } finally {
      syncingAwareness = false
    }
  }

  // ── 建立 Yjs 连接 ──
  let provider: Collab1Provider | null = null
  let reconnectAttempted = false
  let removeAwarenessListener: (() => void) | null = null

  /**
   * 连接就绪（含重连成功）后的统一处理：清理幽灵座位 → 认领席位 → 广播 awareness。
   * provider 断线重连会更换底层 WebSocket，所以不能只监听第一次的 ws 'open' 事件。
   */
  function handleConnected() {
    if (!provider) return

    const awareness = provider.awareness
    // 默认观战：只清理幽灵座位，不自动入座；入座由「对战」按钮触发。
    cleanupStaleSeats()
    syncFromYjs()
    syncAwareness(awareness)
    updateOnlinePlayers(awareness)
  }

  function getDefaultWsServer(): string {
    if (import.meta.env.DEV) return 'ws://localhost:3892'
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    return `${wsProtocol}//${window.location.host}`
  }

  function describeCloseReason(event: CloseEvent): string {
    switch (event.reason) {
      case 'forbidden':
        return '当前账号没有该文档的编辑权限，无法进入五子棋房间。'
      case 'unauthorized':
        return '登录状态已失效，请重新登录后再试。'
      case 'document_not_found':
        return '文档不存在或已被删除。'
      case 'invalid_id':
        return '文档标识不合法，无法建立五子棋房间。'
      case 'invalid_room':
        return '房间标识不合法，无法建立五子棋房间。'
      case 'document_rolled_back':
        return '文档已被回滚，棋局已关闭。'
      case 'permission_changed':
      case 'collaborator_removed':
        return '你对本文档的权限已变更，棋局连接已断开。'
      default:
        return event.reason
          ? `连接已断开：${event.reason}`
          : '协作服务连接已断开，正在尝试重连...'
    }
  }

  function connect() {
    const wsServer = import.meta.env.VITE_YJS_WS_URL || getDefaultWsServer()

    provider = createCollab1Provider({
      baseWsUrl: wsServer,
      // 权限校验与持久化仍然使用数字文档 id，room 只用于隔离棋局 Y.Doc
      docId: documentId,
      room: GOMOKU_ROOM,
      accessToken: getAccessToken() ?? undefined,
      resolveAccessToken: () => getAccessToken() ?? undefined,
      enablePresence: true,
      ydoc,
      onStatus: (status) => {
        connectionStatus.value = status

        if (status === 'connected') {
          connectionMessage.value = ''
          // 首次连接和每次重连都会走到这里，重新认领席位并广播 awareness。
          handleConnected()
          return
        }

        if (status === 'connecting') {
          connectionMessage.value = reconnectAttempted ? '正在尝试重新连接...' : '正在连接协作服务...'
          return
        }

        reconnectAttempted = true
        connectionMessage.value = '协作服务连接已断开，正在尝试重连...'
      },
      onClose: (event) => {
        connectionMessage.value = describeCloseReason(event)
      },
      onPresence: () => {
        updateOnlinePlayers(provider!.awareness)
      },
    })

    // 监听 Yjs 文档变更，重算本地视图
    yBoard.observeDeep(() => syncFromYjs())
    yMeta.observe(() => syncFromYjs())
    yHistory.observeDeep(() => syncFromYjs())

    // 连接刚建立时 onStatus('connected') 一定会触发；这里再兜底检查一次，
    // 覆盖「onStatus 回调被吞掉」等极端情况，重复调用是幂等的。
    if (provider.ws.readyState === WebSocket.OPEN) {
      handleConnected()
    }

    // awareness 'change' 只在状态真正发生深比较差异时触发（'update' 是无条件触发的），
    // 用它来刷新在线列表，天然避免在回调里 setLocalStateField 引发无限递归。
    const awareness = provider.awareness

    // y-protocols 的 off(name, handler) 需要传回调本身，所以先命名再注册。
    const handleAwarenessChange = () => {
      if (!provider) return
      // 在线状态变化：清理超过宽限期的幽灵座位，空席能及时被「对战」认领。
      cleanupStaleSeats()
      syncFromYjs()
      syncAwareness(awareness)
      updateOnlinePlayers(awareness)
    }

    awareness.on('change', handleAwarenessChange)

    // 保存解绑函数，组件卸载时移除监听，避免销毁后仍被回调访问。
    removeAwarenessListener = () => {
      awareness.off('change', handleAwarenessChange)
    }
  }

  // ── 清理 ──
  onBeforeUnmount(() => {
    removeAwarenessListener?.()
    removeAwarenessListener = null
    provider?.destroy()
    provider = null
    ydoc.destroy()
  })

  // 自动连接
  connect()

  return {
    // 状态
    board,
    currentPlayer,
    gameOver,
    winner,
    history,
    moveCount,
    // 在线相关
    connectionStatus,
    connectionMessage,
    onlinePlayers,
    seats,
    pendingUndo,
    pendingReset,
    myColor,
    myColorText,
    isMyTurn,
    isSpectator,
    canUndo,
    canReset,
    // 计算属性
    currentPlayerText,
    winnerText,
    lastMove,
    // 操作
    placeStone,
    joinBattle,
    releaseSeat,
    requestUndo,
    cancelUndo,
    respondUndo,
    requestReset,
    cancelReset,
    respondReset,
    // 配置
    config,
  }
}
