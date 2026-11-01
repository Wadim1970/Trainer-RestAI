import { route } from '../_lib/http.js'
import { assertAdmin } from '../_lib/adminAuth.js'
import { listMembers } from '../_lib/invitesService.js'

// GET ?restaurantId=… — официанты ресторана в тренажёре: баллы, серия, последняя активность.
export default route('admin/members', {
  GET: ({ req, query }) => listMembers(assertAdmin(req, query.restaurantId)),
})
