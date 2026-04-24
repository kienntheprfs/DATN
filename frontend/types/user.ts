export interface User {
  id: string;
  email: string;
  display_name?: string;
  avatar_url?: string;
  is_active: boolean;
  is_superuser: boolean;
  auth_provider: string;
  roles: Array<{ id: string; name: string }>;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
}