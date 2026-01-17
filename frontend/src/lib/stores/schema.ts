/**
 * Schema store with localStorage caching.
 */

import { writable, derived } from 'svelte/store';
import type { SchemaInfo, TableInfo } from '../types';
import { getSourceSchema } from '../api';

const CACHE_KEY = 'schema_cache';
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

interface CachedSchema {
	data: SchemaInfo;
	timestamp: number;
}

// Schema store
export const schema = writable<SchemaInfo | null>(null);
export const schemaLoading = writable<boolean>(false);
export const schemaError = writable<string | null>(null);

// Derived: list of table names
export const tableNames = derived(schema, ($schema) =>
	$schema?.tables.map((t) => t.name) ?? []
);

// Derived: tables for display
export const tables = derived(schema, ($schema) => $schema?.tables ?? []);

/**
 * Get cached schema from localStorage.
 */
function getCachedSchema(): CachedSchema | null {
	if (typeof window === 'undefined') return null;

	try {
		const cached = localStorage.getItem(CACHE_KEY);
		if (!cached) return null;

		const parsed = JSON.parse(cached) as CachedSchema;
		const isExpired = Date.now() - parsed.timestamp > CACHE_TTL;

		if (isExpired) {
			localStorage.removeItem(CACHE_KEY);
			return null;
		}

		return parsed;
	} catch {
		return null;
	}
}

/**
 * Set cached schema in localStorage.
 */
function setCachedSchema(data: SchemaInfo): void {
	if (typeof window === 'undefined') return;

	const cached: CachedSchema = {
		data,
		timestamp: Date.now()
	};

	try {
		localStorage.setItem(CACHE_KEY, JSON.stringify(cached));
	} catch {
		// Ignore localStorage errors
	}
}

/**
 * Load schema, using cache if available.
 */
export async function loadSchema(sourceName: string = 'snowflake_saas', forceRefresh: boolean = false): Promise<void> {
	// Check cache first
	if (!forceRefresh) {
		const cached = getCachedSchema();
		if (cached) {
			schema.set(cached.data);
			return;
		}
	}

	schemaLoading.set(true);
	schemaError.set(null);

	try {
		const data = await getSourceSchema(sourceName);
		schema.set(data);
		setCachedSchema(data);
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Failed to load schema';
		schemaError.set(message);
		schema.set(null);
	} finally {
		schemaLoading.set(false);
	}
}

/**
 * Clear schema cache.
 */
export function clearSchemaCache(): void {
	if (typeof window !== 'undefined') {
		localStorage.removeItem(CACHE_KEY);
	}
	schema.set(null);
}

/**
 * Get table info by name.
 */
export function getTableInfo(tableName: string): TableInfo | undefined {
	let result: TableInfo | undefined;
	schema.subscribe((s) => {
		result = s?.tables.find((t) => t.name.toLowerCase() === tableName.toLowerCase());
	})();
	return result;
}
