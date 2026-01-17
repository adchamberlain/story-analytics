/**
 * Templates store for dashboard templates.
 */

import { writable, derived } from 'svelte/store';
import type { Template, TemplateCategory } from '../types';
import { getTemplates, getTemplateCategories } from '../api';

// Templates store
export const templates = writable<Template[]>([]);
export const templatesLoading = writable<boolean>(false);
export const templatesError = writable<string | null>(null);

// Categories store
export const categories = writable<TemplateCategory[]>([]);
export const categoriesLoading = writable<boolean>(false);

// Derived: templates grouped by category
export const templatesByCategory = derived(templates, ($templates) => {
	const grouped: Record<string, Template[]> = {};
	for (const template of $templates) {
		if (!grouped[template.category_id]) {
			grouped[template.category_id] = [];
		}
		grouped[template.category_id].push(template);
	}
	return grouped;
});

/**
 * Load templates, optionally filtered by category.
 * If no category specified, uses user's business_type on the server.
 */
export async function loadTemplates(category?: string): Promise<void> {
	templatesLoading.set(true);
	templatesError.set(null);

	try {
		const data = await getTemplates(category);
		templates.set(data.templates);
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Failed to load templates';
		templatesError.set(message);
		templates.set([]);
	} finally {
		templatesLoading.set(false);
	}
}

/**
 * Load template categories.
 */
export async function loadCategories(): Promise<void> {
	categoriesLoading.set(true);

	try {
		const data = await getTemplateCategories();
		categories.set(data.categories);
	} catch (error) {
		console.error('Failed to load categories:', error);
		categories.set([]);
	} finally {
		categoriesLoading.set(false);
	}
}

/**
 * Refresh templates with a specific category.
 */
export async function refreshTemplates(category: string): Promise<void> {
	await loadTemplates(category);
}
