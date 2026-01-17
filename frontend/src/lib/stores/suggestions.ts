/**
 * Suggestions store with automatic rotation.
 */

import { writable, derived, readable } from 'svelte/store';
import { getSuggestions } from '../api';

// Suggestions list
export const suggestions = writable<string[]>([]);
export const rotationInterval = writable<number>(5000);
export const suggestionsLoading = writable<boolean>(false);

// Current index for rotation
export const currentIndex = writable<number>(0);

// Derived: current suggestion
export const currentSuggestion = derived(
	[suggestions, currentIndex],
	([$suggestions, $currentIndex]) => {
		if ($suggestions.length === 0) return 'Describe the dashboard you want to create...';
		return `Try: "${$suggestions[$currentIndex]}"`;
	}
);

/**
 * Load suggestions from API.
 */
export async function loadSuggestions(): Promise<void> {
	suggestionsLoading.set(true);

	try {
		const data = await getSuggestions();
		suggestions.set(data.suggestions);
		rotationInterval.set(data.rotation_interval);
	} catch (error) {
		console.error('Failed to load suggestions:', error);
		// Use defaults on error
		suggestions.set([
			'Show me monthly revenue trends',
			'Create a customer growth dashboard',
			'Analyze sales by product category'
		]);
	} finally {
		suggestionsLoading.set(false);
	}
}

// Rotation timer ID
let rotationTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Start rotating suggestions.
 */
export function startRotation(): void {
	stopRotation();

	let interval = 5000;
	rotationInterval.subscribe((v) => (interval = v))();

	rotationTimer = setInterval(() => {
		suggestions.subscribe((s) => {
			if (s.length > 0) {
				currentIndex.update((i) => (i + 1) % s.length);
			}
		})();
	}, interval);
}

/**
 * Stop rotating suggestions.
 */
export function stopRotation(): void {
	if (rotationTimer) {
		clearInterval(rotationTimer);
		rotationTimer = null;
	}
}

/**
 * Reset to first suggestion.
 */
export function resetRotation(): void {
	currentIndex.set(0);
}
