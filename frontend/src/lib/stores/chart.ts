/**
 * Chart store - state management for chart-first architecture.
 *
 * Handles:
 * - Chart conversation state
 * - Chart library management
 * - Dashboard composition state
 */

import { writable, derived, get } from 'svelte/store';
import type {
	Chart,
	ChartMessageResponse,
	ChartActionButton,
	ComposedDashboard
} from '../types';
import {
	sendChartMessage as apiSendChartMessage,
	newChartConversation as apiNewChartConversation,
	listCharts as apiListCharts,
	deleteChart as apiDeleteChart,
	getChartPreviewUrl as apiGetChartPreviewUrl,
	listComposedDashboards as apiListComposedDashboards,
	createComposedDashboard as apiCreateComposedDashboard,
	addChartToDashboard as apiAddChartToDashboard,
	removeChartFromDashboard as apiRemoveChartFromDashboard,
	deleteComposedDashboard as apiDeleteComposedDashboard,
	publishDashboard as apiPublishDashboard
} from '../api';

// =============================================================================
// Chart Conversation State
// =============================================================================

export interface ChartMessage {
	role: 'user' | 'assistant';
	content: string;
	chartUrl?: string;
	chartId?: string;
	actionButtons?: ChartActionButton[];
}

// Conversation stores
export const chartSessionId = writable<string | null>(null);
export const chartMessages = writable<ChartMessage[]>([]);
export const chartPhase = writable<string>('waiting');
export const chartLoading = writable<boolean>(false);
export const currentChartUrl = writable<string | null>(null);
export const currentChartId = writable<string | null>(null);
export const currentChartTitle = writable<string | null>(null);

// Derived store for action buttons from last message
export const chartActionButtons = derived(chartMessages, ($messages) => {
	const lastAssistant = [...$messages].reverse().find((m) => m.role === 'assistant');
	return lastAssistant?.actionButtons || null;
});

/**
 * Send a message in the chart conversation.
 */
export async function sendChartMessage(content: string): Promise<void> {
	const sessionId = get(chartSessionId);
	chartLoading.set(true);

	try {
		// Add user message immediately
		chartMessages.update((msgs) => [...msgs, { role: 'user', content }]);

		// Send to API
		const response = await apiSendChartMessage(content, sessionId || undefined);

		// Update state
		chartSessionId.set(response.session_id);
		chartPhase.set(response.phase);

		if (response.chart_url) {
			currentChartUrl.set(response.chart_url);
		}
		if (response.chart_id) {
			currentChartId.set(response.chart_id);
		}
		if (response.chart_title) {
			currentChartTitle.set(response.chart_title);
		}

		// Add assistant response
		chartMessages.update((msgs) => [
			...msgs,
			{
				role: 'assistant',
				content: response.response,
				chartUrl: response.chart_url || undefined,
				chartId: response.chart_id || undefined,
				actionButtons: response.action_buttons || undefined
			}
		]);
	} catch (error) {
		chartMessages.update((msgs) => [
			...msgs,
			{
				role: 'assistant',
				content: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`
			}
		]);
	} finally {
		chartLoading.set(false);
	}
}

/**
 * Start a new chart conversation.
 */
export async function startNewChartConversation(): Promise<void> {
	chartLoading.set(true);

	try {
		const response = await apiNewChartConversation();

		// Reset state
		chartSessionId.set(response.session_id);
		chartPhase.set(response.phase);
		currentChartUrl.set(null);
		currentChartId.set(null);
		currentChartTitle.set(null);

		chartMessages.set([
			{
				role: 'assistant',
				content: response.response
			}
		]);
	} catch (error) {
		console.error('Failed to start new chart conversation:', error);
	} finally {
		chartLoading.set(false);
	}
}

/**
 * Reset chart conversation state.
 */
export function resetChartConversation(): void {
	chartSessionId.set(null);
	chartMessages.set([]);
	chartPhase.set('waiting');
	currentChartUrl.set(null);
	currentChartId.set(null);
	currentChartTitle.set(null);
}

// =============================================================================
// Chart Library State
// =============================================================================

export const charts = writable<Chart[]>([]);
export const chartsLoading = writable<boolean>(false);
export const chartsError = writable<string | null>(null);
export const selectedChartIds = writable<string[]>([]);

/**
 * Load all charts from the library.
 */
export async function loadCharts(params?: {
	query?: string;
	chart_type?: string;
}): Promise<void> {
	chartsLoading.set(true);
	chartsError.set(null);

	try {
		const response = await apiListCharts(params);
		charts.set(response.charts);
	} catch (error) {
		chartsError.set(error instanceof Error ? error.message : 'Failed to load charts');
	} finally {
		chartsLoading.set(false);
	}
}

/**
 * Delete a chart from the library.
 */
export async function deleteChartFromLibrary(chartId: string): Promise<void> {
	try {
		await apiDeleteChart(chartId);
		charts.update((list) => list.filter((c) => c.id !== chartId));
	} catch (error) {
		console.error('Failed to delete chart:', error);
		throw error;
	}
}

/**
 * Get the preview URL for a chart.
 */
export async function getChartPreviewUrl(chartId: string): Promise<string> {
	const result = await apiGetChartPreviewUrl(chartId);
	return result.url;
}

/**
 * Toggle chart selection (for dashboard composition).
 */
export function toggleChartSelection(chartId: string): void {
	selectedChartIds.update((ids) => {
		if (ids.includes(chartId)) {
			return ids.filter((id) => id !== chartId);
		}
		return [...ids, chartId];
	});
}

/**
 * Clear chart selection.
 */
export function clearChartSelection(): void {
	selectedChartIds.set([]);
}

// =============================================================================
// Dashboard Composition State
// =============================================================================

export const composedDashboards = writable<ComposedDashboard[]>([]);
export const dashboardsLoading = writable<boolean>(false);
export const currentDashboard = writable<ComposedDashboard | null>(null);

/**
 * Load all composed dashboards.
 */
export async function loadComposedDashboards(): Promise<void> {
	dashboardsLoading.set(true);

	try {
		const response = await apiListComposedDashboards();
		composedDashboards.set(response.dashboards);
	} catch (error) {
		console.error('Failed to load dashboards:', error);
	} finally {
		dashboardsLoading.set(false);
	}
}

/**
 * Create a new dashboard from selected charts.
 */
export async function createDashboardFromSelection(
	title: string,
	description?: string
): Promise<ComposedDashboard | null> {
	const chartIds = get(selectedChartIds);

	if (chartIds.length === 0) {
		throw new Error('No charts selected');
	}

	try {
		const response = await apiCreateComposedDashboard({
			title,
			description,
			chart_ids: chartIds
		});

		if (response.success && response.dashboard) {
			composedDashboards.update((list) => [...list, response.dashboard!]);
			clearChartSelection();
			return response.dashboard;
		}

		throw new Error(response.error || 'Failed to create dashboard');
	} catch (error) {
		console.error('Failed to create dashboard:', error);
		throw error;
	}
}

/**
 * Add a chart to an existing dashboard.
 */
export async function addChartToDashboard(
	dashboardId: string,
	chartId: string,
	section?: string
): Promise<void> {
	try {
		const updated = await apiAddChartToDashboard(dashboardId, chartId, section);

		composedDashboards.update((list) =>
			list.map((d) => (d.id === dashboardId ? updated : d))
		);

		if (get(currentDashboard)?.id === dashboardId) {
			currentDashboard.set(updated);
		}
	} catch (error) {
		console.error('Failed to add chart to dashboard:', error);
		throw error;
	}
}

/**
 * Remove a chart from a dashboard.
 */
export async function removeChartFromDashboard(
	dashboardId: string,
	chartId: string
): Promise<void> {
	try {
		const updated = await apiRemoveChartFromDashboard(dashboardId, chartId);

		composedDashboards.update((list) =>
			list.map((d) => (d.id === dashboardId ? updated : d))
		);

		if (get(currentDashboard)?.id === dashboardId) {
			currentDashboard.set(updated);
		}
	} catch (error) {
		console.error('Failed to remove chart from dashboard:', error);
		throw error;
	}
}

/**
 * Delete a composed dashboard.
 */
export async function deleteComposedDashboard(dashboardId: string): Promise<void> {
	try {
		await apiDeleteComposedDashboard(dashboardId);
		composedDashboards.update((list) => list.filter((d) => d.id !== dashboardId));

		if (get(currentDashboard)?.id === dashboardId) {
			currentDashboard.set(null);
		}
	} catch (error) {
		console.error('Failed to delete dashboard:', error);
		throw error;
	}
}

/**
 * Publish a dashboard (write to Evidence pages).
 */
export async function publishDashboard(
	dashboardId: string
): Promise<{ url: string; embed_url: string }> {
	const result = await apiPublishDashboard(dashboardId);
	return { url: result.url, embed_url: result.embed_url };
}
