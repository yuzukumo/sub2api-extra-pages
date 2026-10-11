export interface User {
  id: number;
  email: string;
  username: string;
  role: string;
  balance: number;
}

export type Provider = "sub-openai" | "sub-claude" | "sub-grok" | "sub-gemini";

export interface Model {
  id: string;
  provider: Provider;
  efforts: string[];
  effort_source: "models.dev" | "default";
  context_window: number;
}

export interface Binding {
  source_id: number;
  name: string;
  group: string;
  provider: Provider;
  models: string[];
}

export interface Account {
  user: User;
  key: string;
  base_url: string;
  bindings: Binding[];
  source_keys: SourceKey[];
  selected_source_ids: number[] | null;
  models: Model[];
  synced_at: string;
}

export interface SourceKey {
  id: number;
  name: string;
  group: string;
  provider: string;
  status: string;
  usable: boolean;
  rate_multiplier: number;
}

export interface PublicSettings {
  site_name: string;
  turnstile_enabled: boolean;
  turnstile_site_key: string;
  tencent_captcha_enabled: boolean;
  tencent_captcha_app_id: string;
  aliyun_captcha_enabled: boolean;
}

export interface LoginInput {
  email?: string;
  password?: string;
  temp_token?: string;
  totp_code?: string;
  turnstile_token?: string;
  tencent_captcha_ticket?: string;
  tencent_captcha_randstr?: string;
}

export interface TwoFactor {
  requires_2fa: true;
  temp_token: string;
}

export class APIError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export async function api<T>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method,
    credentials: "same-origin",
    headers:
      body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) {
    throw new APIError(
      response.status,
      data.error?.code ?? "request_failed",
      data.error?.message ?? "Request failed",
    );
  }
  return data as T;
}

export const providers = [
  { value: "sub-openai", label: "OpenAI" },
  { value: "sub-claude", label: "Claude" },
  { value: "sub-grok", label: "Grok" },
  { value: "sub-gemini", label: "Gemini" },
] satisfies { value: Provider; label: string }[];

export function providerLabel(value: string): string {
  return providers.find((provider) => provider.value === value)?.label ?? value;
}
