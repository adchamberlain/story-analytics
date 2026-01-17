/**
 * Dashboards store.
 */

import { writable } from 'svelte/store';
import type { Dashboard } from '../types';
import {
	getDashboards as apiGetDashboards,
	deleteDashboard as apiDeleteDashboard,
	syncDashboards as apiSyncDashboards
} from '../api';

// Dashboards list
export const dashboards = writable<Dashboard[]>([]);

// Loading state
export const dashboardsLoading = writable<boolean>(false);

/**
 * Load dashboards from API.
 */
export async function loadDashboards(): Promise<void> {
	dashboardsLoading.set(true);

	try {
		const response = await apiGetDashboards();
		dashboards.set(response.dashboards);
	} catch (error) {
		console.error('Failed to load dashboards:', error);
		dashboards.set([]);
	} finally {
		dashboardsLoading.set(false);
	}
}

/**
 * Delete a dashboard.
 */
export async function deleteDashboard(slug: string): Promise<void> {
	try {
		await apiDeleteDashboard(slug);
		dashboards.update((list) => list.filter((d) => d.slug !== slug));
	} catch (error) {
		console.error('Failed to delete dashboard:', error);
		throw error;
	}
}

/**
 * Sync dashboards from filesystem.
 */
export async function syncDashboards(): Promise<number> {
	try {
		const result = await apiSyncDashboards();
		await loadDashboards(); // Reload after sync
		return result.synced;
	} catch (error) {
		console.error('Failed to sync dashboards:', error);
		throw error;
	}
}
