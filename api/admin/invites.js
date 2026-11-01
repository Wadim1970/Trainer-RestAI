import { route, httpError } from '../_lib/http.js'
import { assertAdmin } from '../_lib/adminAuth.js'
import { listInvites, createInvites, revokeInvite } from '../_lib/invitesService.js'

// Коды-приглашения для администратора ресторана (1 код = 1 официант = 1 оплаченное место).
//   GET    ?restaurantId=…                       — список кодов
//   POST   {restaurantId, count, days, note, actor} — выдать коды
//   DELETE ?restaurantId=…&id=…                  — отозвать неиспользованный код
export default route('admin/invites', {
  GET: ({ req, query }) => listInvites(assertAdmin(req, query.restaurantId)),
  POST: ({ req, body }) => createInvites(assertAdmin(req, body.restaurantId), body),
  DELETE: ({ req, query }) => {
    if (!query.id) throw httpError(400, 'id обязателен')
    return revokeInvite(assertAdmin(req, query.restaurantId), String(query.id))
  },
})
