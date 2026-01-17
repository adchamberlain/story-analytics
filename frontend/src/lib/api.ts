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
	ProvidersResponse
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

export async function updatePreferences(preferred_provider: string): Promise<User> {
	const response = await fetchWithAuth('/auth/preferences', {
		method: 'PUT',
		body: JSON.stringify({ preferred_provider })
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
