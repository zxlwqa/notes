import { extractAndVerifySession } from '../_utils/session'
import { getEffectivePassword } from '../_utils/auth'
import { getPasswordVersion } from '../_utils/credentials'
import type { PagesFunction } from '../types'
import { apiCors, apiPreflight } from '../_utils/cors'

export const onRequestGet: PagesFunction = async ({ request, env }) => {
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: apiPreflight(request, env, 'GET, OPTIONS'),
    })
  }

  const password = await getEffectivePassword(env)
  const isProduction = env.NODE_ENV === 'production'
  const pwdVer = await getPasswordVersion(env)
  const authenticated = password
    ? await extractAndVerifySession(
        request,
        password,
        env.JWT_SECRET as string | undefined,
        pwdVer,
        isProduction
      )
    : false

  return Response.json({ authenticated }, { headers: apiCors(request, env) })
}
