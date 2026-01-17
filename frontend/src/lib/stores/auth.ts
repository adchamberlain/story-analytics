/**
 * Authentication store.
 */

import { writable, derived } from 'svelte/store';
import type { User } from '../types';
import { getMe } from '../api';

// User store
export const user = writable<User | null>(null);

// Loading state
export const authLoading = writable<boolean>(true);

// Derived: is authenticated
export const isAuthenticated = derived(user, ($user) => $user !== null);

/**
 * Initialize auth state from stored token.
 */
export async function initAuth(): Promise<void> {
	authLoading.set(true);

	try {
		if (typeof window !== 'undefined') {
			const token = localStorage.getItem('token');
			if (token) {
				const userData = await getMe();
				user.set(userData);
			}
		}
	} catch (error) {
		// Token invalid or expired
		if (typeof window !== 'undefined') {
			localStorage.removeItem('token');
		}
		user.set(null);
	} finally {
		authLoading.set(false);
	}
}

/**
 * Set user after login.
 */
export function setUser(userData: User): void {
	user.set(userData);
}

/**
 * Clear user on logout.
 */
export function clearUser(): void {
	user.set(null);
}
