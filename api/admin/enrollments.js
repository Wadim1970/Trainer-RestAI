import { route, httpError } from '../_lib/http.js'
import { assertAdmin } from '../_lib/adminAuth.js'
import { listEnrollments, addEnrollments, closeEnrollment } from '../_lib/enrollmentsService.js'

// Доступы официантов к тренажёру (1 email = 1 оплаченное место на один курс).
//   GET  ?restaurantId=…                                  — список доступов с прогрессом
//   POST {restaurantId, action:'add', emails, actor}      — внести email'ы (строки «email Имя»)
//        {restaurantId, action:'close', id}               — закрыть доступ (прогресс сохраняется)
export default route('admin/enrollments', {
  GET: ({ req, query }) => listEnrollments(assertAdmin(req, query.restaurantId)),
  POST: ({ req, body }) => {
    const restaurantId = assertAdmin(req, body.restaurantId)
    if (body.action === 'add') return addEnrollments(restaurantId, body)
    if (body.action === 'close') {
      if (!body.id) throw httpError(400, 'id обязателен')
      return closeEnrollment(restaurantId, String(body.id))
    }
    throw httpError(400, 'Неизвестное действие')
  },
})
