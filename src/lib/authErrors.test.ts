// node --test src/lib/authErrors.test.ts — ошибки входа по email → русские тексты.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { classifyAuthError } from './authErrors.ts'

const e = (message: string, code?: string, status?: number, name = 'AuthApiError') => ({ message, code, status, name })

test('слишком частые запросы кода: берём число секунд из сообщения', () => {
  const r = classifyAuthError(e('For security purposes, you can only request this after 59 seconds.', 'over_email_send_rate_limit', 429), 'send')
  assert.deepEqual(r, { key: 'errRateWait', seconds: 59 })
  // старый GoTrue без кода — по тексту и статусу
  assert.deepEqual(classifyAuthError(e('For security purposes, you can only request this after 1 second.', undefined, 429), 'login'), { key: 'errRateWait', seconds: 1 })
})

test('общий лимит писем в час — без секунд', () => {
  assert.deepEqual(classifyAuthError(e('Email rate limit exceeded', 'over_email_send_rate_limit', 429), 'send'), { key: 'errRateMany' })
  assert.deepEqual(classifyAuthError(e('Too many requests', undefined, 429), 'login'), { key: 'errRateMany' })
})

test('вход неизвестной почтой: «не зарегистрированы»; при регистрации — «отключено на сервере»', () => {
  const err = e('Signups not allowed for otp', 'otp_disabled', 422)
  assert.deepEqual(classifyAuthError(err, 'login'), { key: 'errNotRegistered' })
  assert.deepEqual(classifyAuthError(err, 'send'), { key: 'errSignupsOff' })
  assert.deepEqual(classifyAuthError(e('Signups not allowed for this instance', 'signup_disabled', 422), 'send'), { key: 'errSignupsOff' })
})

test('неверный адрес и запрещённый адрес', () => {
  assert.equal(classifyAuthError(e('Unable to validate email address: invalid format', 'email_address_invalid', 400), 'send').key, 'errEmailInvalid')
  assert.equal(classifyAuthError(e('Email address "x@y.z" cannot be used as it is not authorized', 'email_address_not_authorized', 400), 'send').key, 'errEmailBlocked')
})

test('почту отправить не удалось (SMTP)', () => {
  assert.equal(classifyAuthError(e('Error sending magic link email', 'unexpected_failure', 500), 'send').key, 'errSendFail')
  assert.equal(classifyAuthError(e('Error sending confirmation email', undefined, 500), 'login').key, 'errSendFail')
})

test('ответ 5xx от сервера — это не «нет сети» (supabase-js оборачивает его в AuthRetryableFetchError)', () => {
  assert.equal(classifyAuthError(e('Error sending magic link email', 'unexpected_failure', 500, 'AuthRetryableFetchError'), 'send').key, 'errSendFail')
  assert.equal(classifyAuthError(e('Bad gateway', undefined, 502, 'AuthRetryableFetchError'), 'login').key, 'errSendFail')
  assert.equal(classifyAuthError(e('Bad gateway', undefined, 502, 'AuthRetryableFetchError'), 'verify').key, 'errGeneric')
})

test('нет сети', () => {
  assert.equal(classifyAuthError(e('Failed to fetch', undefined, 0, 'AuthRetryableFetchError'), 'send').key, 'errNetwork')
  assert.equal(classifyAuthError(new TypeError('Load failed'), 'verify').key, 'errNetwork')
})

test('проверка кода: неверный/просроченный → «код не подошёл»; лимит и сеть — свои тексты', () => {
  assert.equal(classifyAuthError(e('Token has expired or is invalid', 'otp_expired', 403), 'verify').key, 'otpWrong')
  assert.equal(classifyAuthError(e('Email link is invalid or has expired', undefined, 403), 'verify').key, 'otpWrong')
  assert.equal(classifyAuthError(e('Request rate limit reached', 'over_request_rate_limit', 429), 'verify').key, 'errRateMany')
  assert.equal(classifyAuthError(e('boom', undefined, 500), 'verify').key, 'errGeneric')
})

test('неизвестная ошибка — общий русский текст, английский не показываем', () => {
  assert.equal(classifyAuthError(e('Something odd happened'), 'send').key, 'errGeneric')
  assert.equal(classifyAuthError(null, 'send').key, 'errGeneric')
  assert.equal(classifyAuthError('строка', 'login').key, 'errGeneric')
})
