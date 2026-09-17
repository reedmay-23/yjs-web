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

  const canUndo = computed(() => {
    if (myColor.value === 0 || connectionStatus.value !== 'connected') return false

    // 只有「最后一手是本端落的」才可悔棋，和 undoMove() 的判断保持一致，
    // 避免按钮可点、点击后却什么都不发生。
    const last = history.value[history.value.length - 1]
    return Boolean(last && last.clientId === ydoc.clientID)
  })

  const canReset = computed(() => history.value.length > 0 && connectionStatus.value === 'connected')

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
  }

  // ── 玩家身份分配 ──
  /**
   * 身份分配必须在 Yjs 事务里做「读-改-写」，保证并发时只有一个客户端拿到黑棋。
   * 观战者只读不写，避免所有 tab 都来抢同一个空位。
   */
  function ensurePlayerIdentity() {
    // 先清掉已断线标签页留下的幽灵座位，再决定自己能否入座。
    cleanupStaleSeats()

    const blackSeatedId = yMeta.get('blackSeatedId')
    const whiteSeatedId = yMeta.get('whiteSeatedId')

    if (blackSeatedId === seatedId || whiteSeatedId === seatedId) {
      return
    }

    // 已经满了就是观战
    if (blackSeatedId !== undefined && whiteSeatedId !== undefined) {
      return
    }

    // 棋局已经开打之后不再补位，避免中途换人导致身份错乱
    if (yHistory.length > 0) {
      return
    }

    ydoc.transact(() => {
      // 座位和时间戳必须一起写，时间戳用于判断座位是否已经长时间没有主人。
      if (yMeta.get('blackSeatedId') === undefined) {
        yMeta.set('blackSeatedId', seatedId)
        yMeta.set('blackSeatedAt', Date.now())
        return
      }

      if (yMeta.get('whiteSeatedId') === undefined) {
        yMeta.set('whiteSeatedId', seatedId)
        yMeta.set('whiteSeatedAt', Date.now())
      }
    })
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

  function undoMove(): boolean {
    if (connectionStatus.value !== 'connected') return false
    if (myColor.value === 0) return false

    const moves = history.value
    const last = moves[moves.length - 1]
    if (!last) return false

    // 只允许撤销本端自己落下的最后一手，避免把对手的棋子删掉
    if (last.clientId !== ydoc.clientID) return false

    const { row, col } = last.position
    const rawIndex = findRawMoveIndex(row, col, last.player)
    if (rawIndex < 0) return false

    ydoc.transact(() => {
      yHistory.delete(rawIndex, 1)
      yBoard.delete(cellKey(row, col))
    })

    return true
  }

  // ── 重置棋局 ──
  function resetGame(): boolean {
    if (connectionStatus.value !== 'connected') return false
    if (myColor.value === 0) return false

    ydoc.transact(() => {
      yBoard.clear()
      yHistory.delete(0, yHistory.length)
      // 重置后保留双方席位；如果对手已离开，先由 cleanupStaleSeats 释放幽灵座位，
      // 新玩家即可自动入座，也可以点「让出席位」主动放弃。
      yMeta.set('resetAt', Date.now())
      yMeta.set('resetBy', ydoc.clientID)
      // 兼容旧版本数据：座位字段已改用 *_SeatedId，避免遗留的上一个实现字段继续占位。
      yMeta.delete('blackClientId')
      yMeta.delete('whiteClientId')
    })

    return true
  }

  /** 让出席位给其他人（自己转为观战） */
  function releaseSeat(): boolean {
    if (myColor.value === 0) return false
    if (history.value.length > 0) return false
    spectate()
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
    ensurePlayerIdentity()
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
      // 观战者等待空位：对手离线超过宽限期时，这里能自动补位入座。
      if (myColor.value === 0) {
        ensurePlayerIdentity()
        syncFromYjs()
      }
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
    undoMove,
    resetGame,
    releaseSeat,
    // 配置
    config,
  }
}
