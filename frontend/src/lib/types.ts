/**
 * TypeScript types for Story Analytics frontend.
 */

export interface User {
	id: number;
	email: string;
	name: string;
	preferred_provider: string;
	business_type: BusinessType;
	created_at: string;
}

export type BusinessType = 'saas' | 'ecommerce' | 'general';

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

// Clarifying question types
export interface ClarifyingOption {
	label: string;
	value: string;
}

export interface MessageResponse {
	response: string;
	phase: string;
	session_id: number;
	title: string | null;
	dashboard_url: string | null;
	dashboard_created: boolean;
	clarifying_options: ClarifyingOption[] | null;
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

// Template types
export interface Template {
	id: string;
	name: string;
	icon: string;
	description: string;
	prompt: string;
	category_id: string;
	category_name: string;
}

export interface TemplatesResponse {
	templates: Template[];
	total: number;
}

export interface TemplateCategory {
	id: string;
	name: string;
	description: string | null;
}

export interface CategoriesResponse {
	categories: TemplateCategory[];
}

// Schema types
export interface ColumnInfo {
	name: string;
	type: string;
	nullable: boolean;
}

export interface TableInfo {
	name: string;
	columns: ColumnInfo[];
}

export interface SchemaInfo {
	source: string;
	database: string;
	schema: string;
	tables: TableInfo[];
}

// Suggestions types
export interface SuggestionsResponse {
	suggestions: string[];
	rotation_interval: number;
}
