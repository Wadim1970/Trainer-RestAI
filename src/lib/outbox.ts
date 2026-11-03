import type { AnswerInput, AnswersResponse } from '../types'
import { api, ApiError, NetworkError } from './api'

// Очередь неотправленных ответов (нет сети в подсобке). Сервер принимает повторную
// отправку без двойного начисления, поэтому очередь безопасно повторять.
const KEY = 'trainer_outbox_v1'

interface Item { sessionId: string; answers: AnswerInput[]; savedAt: number }

function read(): Item[] {
  try {
    const arr = JSON.parse(localStorage.getItem(KEY) || '[]')
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}
function write(items: Item[]) {
  try { localStorage.setItem(KEY, JSON.stringify(items)) } catch { /* нет хранилища — очередь не сохранится */ }
}

export const pendingCount = () => read().length

export function enqueue(sessionId: string, answers: AnswerInput[]) {
  const items = read().filter((i) => i.sessionId !== sessionId)
  items.push({ sessionId, answers, savedAt: Date.now() })
  write(items)
}

// Отправляет всё, что накопилось. Возвращает, сколько сессий ушло.
export async function flushOutbox(): Promise<number> {
  let sent = 0
  for (const item of read()) {
    try {
      await api<AnswersResponse>('/api/answers', { body: { sessionId: item.sessionId, answers: item.answers } })
      write(read().filter((i) => i.sessionId !== item.sessionId))
      sent++
    } catch (e) {
      if (e instanceof NetworkError) break
      // Сессия не найдена/отклонена — повторять бессмысленно, убираем, чтобы очередь не копилась.
      if (e instanceof ApiError && (e.status === 404 || e.status === 400)) write(read().filter((i) => i.sessionId !== item.sessionId))
      else break
    }
  }
  return sent
}
