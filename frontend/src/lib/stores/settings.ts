/**
 * Settings store - user preferences and feature flags.
 *
 * Persists settings to localStorage for persistence across sessions.
 */

import { writable, get } from 'svelte/store';
import { browser } from '$app/environment';

// =============================================================================
// Renderer Settings
// =============================================================================

export type ChartRenderer = 'evidence' | 'react';

const RENDERER_STORAGE_KEY = 'story-analytics-renderer';

/**
 * Get the initial renderer preference from localStorage.
 */
function getInitialRenderer(): ChartRenderer {
	if (browser) {
		const stored = localStorage.getItem(RENDERER_STORAGE_KEY);
		if (stored === 'evidence' || stored === 'react') {
			return stored;
		}
	}
	return 'evidence'; // Default to Evidence for backward compatibility
}

/**
 * Current chart renderer preference.
 * - 'evidence': Use Evidence framework (port 3000) - legacy
 * - 'react': Use React + Plotly.js (port 3001) - new
 */
export const chartRenderer = writable<ChartRenderer>(getInitialRenderer());

// Persist to localStorage when changed
if (browser) {
	chartRenderer.subscribe((value) => {
		localStorage.setItem(RENDERER_STORAGE_KEY, value);
	});
}

/**
 * Toggle between renderers.
 */
export function toggleRenderer(): void {
	chartRenderer.update((current) => (current === 'evidence' ? 'react' : 'evidence'));
}

/**
 * Set a specific renderer.
 */
export function setRenderer(renderer: ChartRenderer): void {
	chartRenderer.set(renderer);
}

// =============================================================================
// URL Utilities
// =============================================================================

const EVIDENCE_BASE_URL = 'http://localhost:3000';
const REACT_BASE_URL = 'http://localhost:3001';

/**
 * Get the appropriate chart URL based on current renderer setting.
 *
 * @param slug - The Evidence page slug
 * @param chartId - Optional chart ID for React renderer
 * @returns The chart URL for the current renderer
 */
export function getChartUrl(slug: string, chartId?: string): string {
	const renderer = get(chartRenderer);

	if (renderer === 'react') {
		// React renderer - use chart ID if available, otherwise fall back to slug
		if (chartId) {
			return `${REACT_BASE_URL}/chart/${chartId}`;
		}
		// No chartId available - this shouldn't happen in normal flow
		// Fall back to Evidence
		console.warn('[Settings] No chartId available for React renderer, falling back to Evidence');
		return `${EVIDENCE_BASE_URL}/${slug}?embed=true`;
	}

	// Evidence renderer
	return `${EVIDENCE_BASE_URL}/${slug}?embed=true`;
}

/**
 * Get the full page URL (non-embedded) for opening in new tab.
 */
export function getChartFullUrl(slug: string, chartId?: string): string {
	const renderer = get(chartRenderer);

	if (renderer === 'react' && chartId) {
		return `${REACT_BASE_URL}/chart/${chartId}`;
	}

	return `${EVIDENCE_BASE_URL}/${slug}`;
}

/**
 * Get the base URL for the current renderer.
 */
export function getRendererBaseUrl(): string {
	const renderer = get(chartRenderer);
	return renderer === 'react' ? REACT_BASE_URL : EVIDENCE_BASE_URL;
}
