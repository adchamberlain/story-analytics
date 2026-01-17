/**
 * TypeScript types for Story Analytics frontend.
 */

export interface User {
	id: number;
	email: string;
	name: string;
	preferred_provider: string;
	created_at: string;
}

export interface Token {
	access_token: string;
	token_type: string;
}

export interface Message {
	role: 'user' | 'assistant';
	content: string;
}

export interface ConversationSession {
	id: number;
	title: string | null;
	messages: Message[];
	phase: string;
	intent: string | null;
	target_dashboard: string | null;
	created_at: string;
	updated_at: string;
}

export interface ConversationSummary {
	id: number;
	title: string | null;
	phase: string;
	message_count: number;
	created_at: string;
	updated_at: string;
}

export interface ConversationListResponse {
	conversations: ConversationSummary[];
}

export interface MessageResponse {
	response: string;
	phase: string;
	session_id: number;
	title: string | null;
	dashboard_url: string | null;
	dashboard_created: boolean;
}

export interface Dashboard {
	id: number;
	slug: string;
	title: string;
	file_path: string;
	url: string;
	created_at: string;
	updated_at: string;
}

export interface DashboardList {
	dashboards: Dashboard[];
	total: number;
}

export interface Provider {
	id: string;
	name: string;
	models: string[];
}

export interface ProvidersResponse {
	providers: Provider[];
}

export interface ApiError {
	detail: string;
}
