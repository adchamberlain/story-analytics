/**
 * Authenticated fetch wrapper.
 * Attaches Bearer token from localStorage and handles 401 redirects.
 */

const PUBLIC_PATH_PREFIXES = ['/login', '/embed/', '/public/']

function isPublicPage(): boolean {
  return PUBLIC_PATH_PREFIXES.some((p) => window.location.pathname.startsWith(p))
}

export async function authFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  let token: string | null = null
  try { token = localStorage.getItem('auth_token') } catch { /* test env */ }

  const headers = new Headers(init?.headers)
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  const response = await fetch(input, { ...init, headers })

  if (response.status === 401 && token && !isPublicPage()) {
    try { localStorage.removeItem('auth_token') } catch { /* test env */ }
    window.location.href = '/login'
  }

  return response
}
