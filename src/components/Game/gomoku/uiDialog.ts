import { createDiscreteApi } from 'naive-ui'

/**
 * 模块级离散 API: 无需全局 provider 即可使用 Naive UI 的 dialog/message。
 */
const { dialog, message } = createDiscreteApi(['dialog', 'message'])

export { dialog, message }
