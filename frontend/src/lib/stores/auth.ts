/**
 * Authentication store.
 */

import { writable, derived, get } from 'svelte/store';
import type { User } from '../types';
import { getMe, updatePreferences, type UserPreferencesUpdate } from '../api';

// User store
export const user = writable<User | null>(null);

// Loading state
export const authLoading = writable<boolean>(true);

// Track if user just logged in (to start fresh conversation)
export const justLoggedIn = writable<boolean>(false);

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
	justLoggedIn.set(true);
}

/**
 * Clear the just logged in flag.
 */
export function clearJustLoggedIn(): void {
	justLoggedIn.set(false);
}

/**
 * Clear user on logout.
 */
export function clearUser(): void {
	user.set(null);
}

/**
 * Update a user preference.
 */
export async function updateUserPreference(
	key: keyof UserPreferencesUpdate,
	value: string
): Promise<void> {
	const preferences: UserPreferencesUpdate = { [key]: value };
	const updatedUser = await updatePreferences(preferences);
	user.set(updatedUser);
}
