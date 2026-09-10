<script setup lang="ts">
/**
 * GomokuBoard.vue - 五子棋棋盘绘制组件
 * 职责: Canvas 绘制棋盘/棋子 + 点击交互
 */
import { ref, computed, onMounted, watch, nextTick, onBeforeUnmount } from 'vue'
import type { CellState, Position, BoardConfig, CanvasCtx } from './types'
import { DEFAULT_BOARD_CONFIG } from './types'

const props = withDefaults(defineProps<{
  board: CellState[][]
  config?: BoardConfig
  lastMove?: Position | null
  gameOver?: boolean
}>(), {
  config: () => DEFAULT_BOARD_CONFIG,
  lastMove: null,
  gameOver: false,
})

const emit = defineEmits<{
  (e: 'place', row: number, col: number): void
}>()

const canvasRef = ref<HTMLCanvasElement | null>(null)
let ctx: CanvasCtx | null = null
let dpr = 1

/** 画布总尺寸 */
const canvasSize = computed(() => {
  const { gridSize, cellSize, padding } = props.config
  return padding * 2 + cellSize * (gridSize - 1)
})

/** 初始化画布 */
function initCanvas() {
  const canvas = canvasRef.value
  if (!canvas) return

  dpr = window.devicePixelRatio || 1
  const size = canvasSize.value

  // 高清适配
  canvas.width = size * dpr
  canvas.height = size * dpr
  canvas.style.width = `${size}px`
  canvas.style.height = `${size}px`

  ctx = canvas.getContext('2d')
  if (ctx) {
    ctx.scale(dpr, dpr)
  }

  render()
}

/** 完整重绘 */
function render() {
  if (!ctx) return
  const { gridSize, cellSize, padding } = props.config
  const size = canvasSize.value

  // 清空
  ctx.clearRect(0, 0, size, size)

  // 画棋盘背景
  drawBoardBackground(ctx, size)

  // 画网格线
  drawGrid(ctx, gridSize, cellSize, padding)

  // 画星位点
  drawStarPoints(ctx, cellSize, padding)

  // 画所有棋子
  drawAllStones(ctx, props.board, cellSize, padding)

  // 画最后一手标记
  if (props.lastMove) {
    drawLastMoveMarker(ctx, props.lastMove, cellSize, padding)
  }
}

/** 棋盘木纹背景 */
function drawBoardBackground(ctx: CanvasCtx, size: number) {
  ctx.fillStyle = '#dcb35c'
  ctx.fillRect(0, 0, size, size)

  // 木纹纹理
  ctx.strokeStyle = 'rgba(139, 90, 43, 0.08)'
  ctx.lineWidth = 1
  for (let i = 0; i < size; i += 6) {
    ctx.beginPath()
    ctx.moveTo(0, i + Math.sin(i * 0.05) * 3)
    ctx.lineTo(size, i + Math.sin(i * 0.05 + 2) * 3)
    ctx.stroke()
  }
}

/** 画网格线 */
function drawGrid(ctx: CanvasCtx, gridSize: number, cellSize: number, padding: number) {
  ctx.strokeStyle = '#5a3e1b'
  ctx.lineWidth = 1

  for (let i = 0; i < gridSize; i++) {
    const offset = padding + i * cellSize

    // 横线
    ctx.beginPath()
    ctx.moveTo(padding, offset)
    ctx.lineTo(padding + cellSize * (gridSize - 1), offset)
    ctx.stroke()

    // 竖线
    ctx.beginPath()
    ctx.moveTo(offset, padding)
    ctx.lineTo(offset, padding + cellSize * (gridSize - 1))
    ctx.stroke()
  }
}

/** 画星位点 (天元 + 4个角星) */
function drawStarPoints(ctx: CanvasCtx, cellSize: number, padding: number) {
  const points: [number, number][] = [
    [3, 3], [3, 7], [3, 11],
    [7, 3], [7, 7], [7, 11],
    [11, 3], [11, 7], [11, 11],
  ]

  ctx.fillStyle = '#5a3e1b'
  for (const [row, col] of points) {
    const x = padding + col * cellSize
    const y = padding + row * cellSize
    ctx.beginPath()
    ctx.arc(x, y, 4, 0, Math.PI * 2)
    ctx.fill()
  }
}

/** 画所有棋子 */
function drawAllStones(
  ctx: CanvasCtx,
  board: CellState[][],
  cellSize: number,
  padding: number,
) {
  for (let row = 0; row < board.length; row++) {
    for (let col = 0; col < board[row].length; col++) {
      if (board[row][col] !== 0) {
        drawStone(ctx, row, col, board[row][col], cellSize, padding)
      }
    }
  }
}

/** 画单个棋子 (带渐变和阴影) */
function drawStone(
  ctx: CanvasCtx,
  row: number,
  col: number,
  player: CellState,
  cellSize: number,
  padding: number,
) {
  const x = padding + col * cellSize
  const y = padding + row * cellSize
  const r = cellSize * 0.42

  ctx.save()

  ctx.shadowColor = 'rgba(0, 0, 0, 0.35)'
  ctx.shadowBlur = 5
  ctx.shadowOffsetX = 2
  ctx.shadowOffsetY = 2

  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)

  if (player === 1) {
    const grad = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r)
    grad.addColorStop(0, '#555')
    grad.addColorStop(0.6, '#1a1a1a')
    grad.addColorStop(1, '#000')
    ctx.fillStyle = grad
  } else {
    const grad = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r)
    grad.addColorStop(0, '#fff')
    grad.addColorStop(0.5, '#f0ece4')
    grad.addColorStop(1, '#c8c0b0')
    ctx.fillStyle = grad
  }

  ctx.fill()
  ctx.restore()
}

/** 最后一手标记 (红色小方块) */
function drawLastMoveMarker(
  ctx: CanvasCtx,
  pos: Position,
  cellSize: number,
  padding: number,
) {
  const x = padding + pos.col * cellSize
  const y = padding + pos.row * cellSize
  const s = 4

  ctx.fillStyle = '#e74c3c'
  ctx.fillRect(x - s, y - s, s * 2, s * 2)
}

/** 鼠标点击 -> 棋盘坐标 */
function handleCanvasClick(e: MouseEvent) {
  if (props.gameOver) return

  const canvas = canvasRef.value
  if (!canvas) return

  const rect = canvas.getBoundingClientRect()
  const { cellSize, padding } = props.config

  const x = e.clientX - rect.left
  const y = e.clientY - rect.top

  const col = Math.round((x - padding) / cellSize)
  const row = Math.round((y - padding) / cellSize)

  emit('place', row, col)
}

/** 鼠标悬停效果 */
const hoverPos = ref<Position | null>(null)

function handleMouseMove(e: MouseEvent) {
  const canvas = canvasRef.value
  if (!canvas || props.gameOver) {
    hoverPos.value = null
    return
  }

  const rect = canvas.getBoundingClientRect()
  const { cellSize, padding, gridSize } = props.config

  const x = e.clientX - rect.left
  const y = e.clientY - rect.top

  const col = Math.round((x - padding) / cellSize)
  const row = Math.round((y - padding) / cellSize)

  if (row >= 0 && row < gridSize && col >= 0 && col < gridSize) {
    hoverPos.value = { row, col }
    canvas.style.cursor = 'pointer'
  } else {
    hoverPos.value = null
    canvas.style.cursor = 'default'
  }
}

function handleMouseLeave() {
  hoverPos.value = null
  if (canvasRef.value) {
    canvasRef.value.style.cursor = 'default'
  }
}

// 监听棋盘变化, 重绘
watch(() => [props.board, props.lastMove], () => {
  nextTick(render)
}, { deep: true })

// 窗口resize时重绘
function handleResize() {
  initCanvas()
}

onMounted(() => {
  initCanvas()
  window.addEventListener('resize', handleResize)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleResize)
})
</script>

<template>
  <div class="gomoku-board">
    <canvas
      ref="canvasRef"
      @click="handleCanvasClick"
      @mousemove="handleMouseMove"
      @mouseleave="handleMouseLeave"
    />
  </div>
</template>

<style scoped>
.gomoku-board {
  display: inline-block;
  border-radius: 8px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3), inset 0 0 0 3px #8b6914;
  overflow: hidden;
}
</style>
