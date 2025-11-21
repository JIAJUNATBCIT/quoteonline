export interface User {
  id: string;
  email: string;
  name: string;
  role: 'customer' | 'supplier' | 'quoter' | 'admin';
  company?: string;
  isActive?: boolean;
}

export interface AuthResponse {
  token: string;
  user: User;
}