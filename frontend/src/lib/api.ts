/**
 * API client for Story Analytics backend.
 */

import type {
	User,
	ConversationSession,
	ConversationListResponse,
	MessageResponse,
	Dashboard,
	DashboardList,
	ProvidersResponse,
	TemplatesResponse,
	CategoriesResponse,
	SchemaInfo,
	SuggestionsResponse,
	BusinessType,
	SourceInfo,
	// Chart-first architecture types
	ChartMessageResponse,
	Chart,
	ChartListResponse,
	ChartCreateResponse,
	ComposedDashboard,
	ComposedDashboardListResponse,
	DashboardCreateResponse
} from './types';

const API_BASE = 'http://localhost:8000/api';

/**
 * Get the stored JWT token.
 */
function getToken(): string | null {
	if (typeof window === 'undefined') return null;
	return localStorage.getItem('token');
}

/**
 * Set the JWT token.
 */
export function setToken(token: string): void {
	localStorage.setItem('token', token);
}

/**
 * Make an authenticated API request.
 */
async function fetchWithAuth(url: string, options: RequestInit = {}): Promise<Response> {
	const token = getToken();
	const headers: HeadersInit = {
		'Content-Type': 'application/json',
		...options.headers
	};

	if (token) {
		(headers as Record<string, string>)['Authorization'] = `Bearer ${token}`;
	}

	const response = await fetch(`${API_BASE}${url}`, {
		...options,
		headers
	});

	if (response.status === 401) {
		// Token expired or invalid - clear it
		localStorage.removeItem('token');
		window.location.href = '/login';
	}

	return response;
}

/**
 * Handle API response and throw on error.
 */
async function handleResponse<T>(response: Response): Promise<T> {
	if (!response.ok) {
		const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
		throw new Error(error.detail || `HTTP ${response.status}`);
	}
	return response.json();
}

// Auth endpoints (passwordless)

export interface MagicLinkResponse {
	message: string;
	email: string;
}

export interface VerifyResponse {
	access_token: string;
	token_type: string;
	user: User;
}

/**
 * Request a magic link for login/signup.
 */
export async function requestMagicLink(email: string, name?: string): Promise<MagicLinkResponse> {
	const response = await fetch(`${API_BASE}/auth/magic-link`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ email, name })
	});
	return handleResponse<MagicLinkResponse>(response);
}

/**
 * Verify a magic link token.
 */
export async function verifyMagicLink(token: string): Promise<VerifyResponse> {
	const response = await fetch(`${API_BASE}/auth/verify?token=${encodeURIComponent(token)}`);
	const data = await handleResponse<VerifyResponse>(response);
	// Store the JWT token
	setToken(data.access_token);
	return data;
}

export function logout(): void {
	localStorage.removeItem('token');
	window.location.href = '/login';
}

export async function getMe(): Promise<User> {
	const response = await fetchWithAuth('/auth/me');
	return handleResponse<User>(response);
}

export interface UserPreferencesUpdate {
	preferred_provider?: string;
	preferred_source?: string;
	business_type?: BusinessType;
}

export async function updatePreferences(preferences: UserPreferencesUpdate): Promise<User> {
	const response = await fetchWithAuth('/auth/preferences', {
		method: 'PUT',
		body: JSON.stringify(preferences)
	});
	return handleResponse<User>(response);
}

// Conversation endpoints

export async function sendMessage(message: string, sessionId?: number): Promise<MessageResponse> {
	const response = await fetchWithAuth('/conversation/message', {
		method: 'POST',
		body: JSON.stringify({ message, session_id: sessionId })
	});
	return handleResponse<MessageResponse>(response);
}

/**
 * Progress event from SSE stream.
 */
export interface ProgressEvent {
	step: string;
	status: 'pending' | 'in_progress' | 'completed' | 'failed';
	message: string;
	details?: string;
}

/**
 * Callbacks for streaming message response.
 */
export interface StreamCallbacks {
	onProgress?: (event: ProgressEvent) => void;
	onComplete?: (response: MessageResponse) => void;
	onError?: (error: string) => void;
}

/**
 * Send a message and receive streaming progress updates via SSE.
 * Returns a function to abort the stream.
 */
export function sendMessageStream(
	message: string,
	sessionId: number | undefined,
	callbacks: StreamCallbacks
): () => void {
	const token = getToken();
	const abortController = new AbortController();

	const fetchStream = async () => {
		try {
			const response = await fetch(`${API_BASE}/conversation/message/stream`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					...(token ? { Authorization: `Bearer ${token}` } : {})
				},
				body: JSON.stringify({ message, session_id: sessionId }),
				signal: abortController.signal
			});

			if (response.status === 401) {
				localStorage.removeItem('token');
				window.location.href = '/login';
				return;
			}

			if (!response.ok) {
				const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
				callbacks.onError?.(error.detail || `HTTP ${response.status}`);
				return;
			}

			const reader = response.body?.getReader();
			if (!reader) {
				callbacks.onError?.('No response body');
				return;
			}

			const decoder = new TextDecoder();
			let buffer = '';

			while (true) {
				const { done, value } = await reader.read();
				if (done) break;

				buffer += decoder.decode(value, { stream: true });

				// Process complete SSE events from buffer
				const lines = buffer.split('\n');
				buffer = lines.pop() || ''; // Keep incomplete line in buffer

				let eventType = '';
				let eventData = '';

				for (const line of lines) {
					if (line.startsWith('event: ')) {
						eventType = line.slice(7).trim();
					} else if (line.startsWith('data: ')) {
						eventData = line.slice(6);
					} else if (line === '' && eventType && eventData) {
						// End of event, process it
						try {
							const data = JSON.parse(eventData);
							if (eventType === 'progress') {
								callbacks.onProgress?.(data as ProgressEvent);
							} else if (eventType === 'complete') {
								callbacks.onComplete?.(data as MessageResponse);
							} else if (eventType === 'error') {
								callbacks.onError?.(data.error || 'Unknown error');
							}
						} catch (e) {
							console.error('Failed to parse SSE data:', e);
						}
						eventType = '';
						eventData = '';
					}
				}
			}
		} catch (e) {
			if ((e as Error).name !== 'AbortError') {
				callbacks.onError?.((e as Error).message || 'Stream error');
			}
		}
	};

	fetchStream();

	// Return abort function
	return () => abortController.abort();
}

export async function listConversations(): Promise<ConversationListResponse> {
	const response = await fetchWithAuth('/conversation/list');
	return handleResponse<ConversationListResponse>(response);
}

export async function getConversation(sessionId?: number): Promise<ConversationSession> {
	const url = sessionId ? `/conversation/${sessionId}` : '/conversation';
	const response = await fetchWithAuth(url);
	return handleResponse<ConversationSession>(response);
}

export async function newConversation(): Promise<ConversationSession> {
	const response = await fetchWithAuth('/conversation/new', {
		method: 'POST'
	});
	return handleResponse<ConversationSession>(response);
}

export async function deleteConversation(sessionId: number): Promise<void> {
	await fetchWithAuth(`/conversation/${sessionId}`, {
		method: 'DELETE'
	});
}

export async function renameConversation(sessionId: number, title: string): Promise<void> {
	await fetchWithAuth(`/conversation/${sessionId}`, {
		method: 'PATCH',
		body: JSON.stringify({ title })
	});
}

export async function clearAllConversations(): Promise<void> {
	await fetchWithAuth('/conversation', {
		method: 'DELETE'
	});
}

// Dashboard endpoints

export async function getDashboards(): Promise<DashboardList> {
	const response = await fetchWithAuth('/dashboards');
	return handleResponse<DashboardList>(response);
}

export async function getDashboard(slug: string): Promise<Dashboard> {
	const response = await fetchWithAuth(`/dashboards/${slug}`);
	return handleResponse<Dashboard>(response);
}

export async function deleteDashboard(slug: string): Promise<void> {
	await fetchWithAuth(`/dashboards/${slug}`, {
		method: 'DELETE'
	});
}

export async function syncDashboards(): Promise<{ synced: number }> {
	const response = await fetchWithAuth('/dashboards/sync', {
		method: 'POST'
	});
	return handleResponse<{ synced: number }>(response);
}

export interface DashboardContent {
	slug: string;
	title: string;
	content: string;
	url: string;
}

export async function getDashboardContent(slug: string): Promise<DashboardContent> {
	const response = await fetchWithAuth(`/dashboards/${slug}/content`);
	return handleResponse<DashboardContent>(response);
}

export async function updateDashboardContent(
	slug: string,
	content: string,
	title?: string
): Promise<DashboardContent> {
	const response = await fetchWithAuth(`/dashboards/${slug}/content`, {
		method: 'PUT',
		body: JSON.stringify({ content, title })
	});
	return handleResponse<DashboardContent>(response);
}

// Provider endpoints

export async function getProviders(): Promise<ProvidersResponse> {
	const response = await fetchWithAuth('/providers');
	return handleResponse<ProvidersResponse>(response);
}

/**
 * Check if user is authenticated.
 */
export function isAuthenticated(): boolean {
	return !!getToken();
}

// Template endpoints

export async function getTemplates(category?: string): Promise<TemplatesResponse> {
	const url = category ? `/templates?category=${encodeURIComponent(category)}` : '/templates';
	const response = await fetchWithAuth(url);
	return handleResponse<TemplatesResponse>(response);
}

export async function getAllTemplates(): Promise<TemplatesResponse> {
	const response = await fetchWithAuth('/templates/all');
	return handleResponse<TemplatesResponse>(response);
}

export async function getTemplateCategories(): Promise<CategoriesResponse> {
	const response = await fetchWithAuth('/templates/categories');
	return handleResponse<CategoriesResponse>(response);
}

export async function getSuggestions(): Promise<SuggestionsResponse> {
	const response = await fetchWithAuth('/templates/suggestions');
	return handleResponse<SuggestionsResponse>(response);
}

// Source endpoints

export async function getSources(): Promise<SourceInfo[]> {
	const response = await fetchWithAuth('/sources');
	return handleResponse<SourceInfo[]>(response);
}

export async function getSourceSchema(sourceName: string): Promise<SchemaInfo> {
	const response = await fetchWithAuth(`/sources/${encodeURIComponent(sourceName)}/schema`);
	return handleResponse<SchemaInfo>(response);
}

// =============================================================================
// Chart-First Architecture API
// =============================================================================

// Chart Conversation endpoints

export async function sendChartMessage(
	message: string,
	sessionId?: number
): Promise<ChartMessageResponse> {
	const response = await fetchWithAuth('/charts/conversation/message', {
		method: 'POST',
		body: JSON.stringify({ message, session_id: sessionId })
	});
	return handleResponse<ChartMessageResponse>(response);
}

export async function newChartConversation(): Promise<ChartMessageResponse> {
	const response = await fetchWithAuth('/charts/conversation/new', {
		method: 'POST'
	});
	return handleResponse<ChartMessageResponse>(response);
}

export async function deleteChartConversation(sessionId: string): Promise<void> {
	await fetchWithAuth(`/charts/conversation/${sessionId}`, {
		method: 'DELETE'
	});
}

// Chart Library endpoints

export async function listCharts(params?: {
	query?: string;
	chart_type?: string;
	limit?: number;
}): Promise<ChartListResponse> {
	const searchParams = new URLSearchParams();
	if (params?.query) searchParams.set('query', params.query);
	if (params?.chart_type) searchParams.set('chart_type', params.chart_type);
	if (params?.limit) searchParams.set('limit', params.limit.toString());

	const queryString = searchParams.toString();
	const url = queryString ? `/charts/library?${queryString}` : '/charts/library';

	const response = await fetchWithAuth(url);
	return handleResponse<ChartListResponse>(response);
}

export async function getChart(chartId: string): Promise<Chart> {
	const response = await fetchWithAuth(`/charts/library/${chartId}`);
	return handleResponse<Chart>(response);
}

export async function deleteChart(chartId: string): Promise<void> {
	await fetchWithAuth(`/charts/library/${chartId}`, {
		method: 'DELETE'
	});
}

export async function createChart(request: string): Promise<ChartCreateResponse> {
	const response = await fetchWithAuth('/charts/library/create', {
		method: 'POST',
		body: JSON.stringify({ request })
	});
	return handleResponse<ChartCreateResponse>(response);
}

export async function getChartPreviewUrl(
	chartId: string
): Promise<{ chart_id: string; url: string; dashboard_slug: string }> {
	const response = await fetchWithAuth(`/charts/library/${chartId}/preview-url`);
	return handleResponse<{ chart_id: string; url: string; dashboard_slug: string }>(response);
}

// Dashboard Composition endpoints

export async function listComposedDashboards(): Promise<ComposedDashboardListResponse> {
	const response = await fetchWithAuth('/charts/dashboards');
	return handleResponse<ComposedDashboardListResponse>(response);
}

export async function getComposedDashboard(dashboardId: string): Promise<ComposedDashboard> {
	const response = await fetchWithAuth(`/charts/dashboards/${dashboardId}`);
	return handleResponse<ComposedDashboard>(response);
}

export async function createComposedDashboard(params: {
	title: string;
	description?: string;
	chart_ids?: string[];
}): Promise<DashboardCreateResponse> {
	const response = await fetchWithAuth('/charts/dashboards', {
		method: 'POST',
		body: JSON.stringify(params)
	});
	return handleResponse<DashboardCreateResponse>(response);
}

export async function deleteComposedDashboard(dashboardId: string): Promise<void> {
	await fetchWithAuth(`/charts/dashboards/${dashboardId}`, {
		method: 'DELETE'
	});
}

export async function addChartToDashboard(
	dashboardId: string,
	chartId: string,
	section?: string
): Promise<ComposedDashboard> {
	const response = await fetchWithAuth(`/charts/dashboards/${dashboardId}/charts`, {
		method: 'POST',
		body: JSON.stringify({ chart_id: chartId, section })
	});
	return handleResponse<ComposedDashboard>(response);
}

export async function removeChartFromDashboard(
	dashboardId: string,
	chartId: string
): Promise<ComposedDashboard> {
	const response = await fetchWithAuth(`/charts/dashboards/${dashboardId}/charts/${chartId}`, {
		method: 'DELETE'
	});
	return handleResponse<ComposedDashboard>(response);
}

export async function reorderDashboardCharts(
	dashboardId: string,
	chartIds: string[]
): Promise<ComposedDashboard> {
	const response = await fetchWithAuth(`/charts/dashboards/${dashboardId}/reorder`, {
		method: 'PUT',
		body: JSON.stringify({ chart_ids: chartIds })
	});
	return handleResponse<ComposedDashboard>(response);
}

export async function publishDashboard(
	dashboardId: string
): Promise<{ success: boolean; url: string; embed_url: string }> {
	const response = await fetchWithAuth(`/charts/dashboards/${dashboardId}/publish`, {
		method: 'POST'
	});
	return handleResponse<{ success: boolean; url: string; embed_url: string }>(response);
}
