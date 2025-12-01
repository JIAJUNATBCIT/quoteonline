export interface User {
  _id: string;
  email: string;
  name: string;
  role: 'customer' | 'supplier' | 'quoter' | 'admin';
  company?: string;
  isActive?: boolean;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: User;
}

export interface TokenResponse {
  accessToken: string;
  refreshToken: string;
}