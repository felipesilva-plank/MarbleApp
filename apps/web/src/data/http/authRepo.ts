import type { LoginInput, Org, RegisterInput, User } from '@marble/core'
import type { AuthPort } from '../ports'
import { apiGet, apiSend } from './client'

/**
 * There is no token handling here on purpose. The session rides in an httpOnly cookie the server
 * sets, which the page's own JavaScript cannot read — so an XSS bug cannot walk off with it, and
 * there is nothing to store, refresh or accidentally log.
 */
export const httpAuthPort: AuthPort = {
  async register(input: RegisterInput): Promise<User> {
    const { user } = await apiSend<{ user: User }>('/api/auth/register', 'POST', input)
    return user
  },

  async login(input: LoginInput): Promise<User> {
    const { user } = await apiSend<{ user: User }>('/api/auth/login', 'POST', input)
    return user
  },

  async logout(): Promise<void> {
    await apiSend('/api/auth/logout', 'POST')
  },

  async currentUser(): Promise<User | null> {
    // 200-with-null, not a 401: "nobody is signed in" is the normal answer on a cold visit, and
    // treating it as a failure would put an error banner on the login screen.
    const { user } = await apiGet<{ user: User | null }>('/api/auth/me')
    return user
  },

  async currentOrg(): Promise<Org | null> {
    const { org } = await apiGet<{ org: Org | null }>('/api/auth/me/org')
    return org
  },
}
