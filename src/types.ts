// Ответы API тренажёра (api/*.js).

export type Kind = 'menu_grid' | 'which_section' | 'build_dish' | 'odd_one' | 'guess_dish' | 'wine_grape' | 'wine_vintage' | 'guess_wine'

export interface Option { id: string; label: string }

export interface Question {
  qid: string
  cardKey: string
  dishId: string
  level: number
  kind: Kind
  source: 'due' | 'new' | 'practice'
  subject: { dishName?: string; section?: string; ingredients?: string[]; grapes?: string[] }
  options: Option[]
  multi: boolean
  answer: string[]
  primaryOptionId?: string
}

export interface Scoring {
  points: { correct_confident: number; correct_unsure: number; wrong_confident: number; wrong_unsure: number }
  combo_step: number
  combo_max: number
}

export interface SessionResponse {
  sessionId?: string
  kind: 'regular' | 'practice' | 'empty'
  reason?: 'no_content' | 'nothing_to_do'
  total?: number
  questions: Question[]
  dishNames?: Record<string, string>
  scoring?: Scoring
}

export interface LevelInfo {
  level: number
  title: 'names' | 'ingredients' | 'chef'
  status: 'open' | 'locked' | 'empty' | 'soon'
  points: number
  need: number
  prevPoints: number | null
  dishes: number
}

export interface Me {
  member: { id: string; name: string }
  demo?: boolean
  restaurant: { id: string; name: string }
  points: number
  levelPoints: Record<string, number>
  streak: number
  levels: LevelInfo[]
  today: { kind: 'regular' | 'practice' | 'empty'; cards: number; due: number; fresh: number; minutes: number }
  settings: { sessionCards: number; unlockPoints: Record<string, number> }
}

export interface AnswerInput { qid: string; selected: string[]; confident: boolean; latencyMs: number }

export interface AnswersResponse {
  results: { qid: string; correct: boolean; points: number }[]
  totals: { answered: number; total: number; correct: number; points: number }
  weak: { dishId: string; name: string }[]
  points: number
  streak: number
  levels: LevelInfo[]
  unlocked: number[]
}

export interface JoinCheck { restaurant: { id: string; name: string }; kind: string }
