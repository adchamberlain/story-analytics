/**
 * TypeScript types for Story Analytics frontend.
 */

export interface User {
	id: number;
	email: string;
	name: string;
	preferred_provider: string;
	preferred_source: string;
	business_type: BusinessType;
	created_at: string;
}

// Data source types
export interface SourceInfo {
	name: string;
	type: string;
	connected: boolean;
	database: string | null;
	schema_name: string | null;
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
	conversation_type: 'dashboard' | 'chart';
	chart_id: string | null;
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

// Action button types for phase transitions
export interface ActionButton {
	id: string;
	label: string;
	style: 'primary' | 'secondary';
}

// QA validation result
export interface QAResult {
	passed: boolean;
	summary: string;
	critical_issues: string[];
	suggestions: string[];
	screenshot_url: string | null;
	auto_fixed: boolean;
	issues_fixed: string[];
}

export interface MessageResponse {
	response: string;
	phase: string;
	session_id: number;
	title: string | null;
	dashboard_url: string | null;
	dashboard_slug: string | null;
	dashboard_created: boolean;
	clarifying_options: ClarifyingOption[] | null;
	action_buttons: ActionButton[] | null;
	qa_result: QAResult | null;
	error_context: string | null;
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

// =============================================================================
// Chart-First Architecture Types
// =============================================================================

// Chart conversation types
export interface ChartActionButton {
	id: string;
	label: string;
	style: 'primary' | 'secondary';
}

export interface ChartMessageResponse {
	response: string;
	phase: string; // 'waiting' | 'generating' | 'viewing' | 'complete'
	session_id: number;
	title: string | null; // Conversation title
	chart_id: string | null;
	chart_url: string | null;
	chart_title: string | null;
	action_buttons: ChartActionButton[] | null;
	error: string | null;
}

// Chart library types
export interface ChartConfig {
	x: string | null;
	y: string | string[] | null;
	value: string | null;
	series: string | null;
	title: string | null;
	extra_props: Record<string, unknown> | null;
}

export interface Chart {
	id: string;
	title: string;
	description: string;
	query_name: string;
	sql: string;
	chart_type: string;
	config: ChartConfig;
	created_at: string;
	updated_at: string;
	original_request: string;
	is_valid: boolean;
}

export interface ChartListResponse {
	charts: Chart[];
	total: number;
}

export interface ChartCreateResponse {
	success: boolean;
	chart: Chart | null;
	chart_url: string | null;
	error: string | null;
}

// Dashboard composition types
export interface DashboardLayoutSection {
	title: string | null;
	chart_ids: string[];
}

export interface DashboardLayout {
	sections: DashboardLayoutSection[];
}

export interface ComposedDashboard {
	id: string;
	slug: string;
	title: string;
	description: string | null;
	chart_ids: string[];
	layout: DashboardLayout | null;
	created_at: string;
	updated_at: string;
}

export interface ComposedDashboardListResponse {
	dashboards: ComposedDashboard[];
	total: number;
}

export interface DashboardCreateResponse {
	success: boolean;
	dashboard: ComposedDashboard | null;
	dashboard_url: string | null;
	error: string | null;
}
