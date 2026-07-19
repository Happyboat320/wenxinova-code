import { createContext } from 'react';
import type { User } from '@/api';

interface AuthContextValue {
  isAuthenticated: boolean;
  isInitializing: boolean;
  user: User | null;
  openLogin: () => void;
  logout: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue>({
  isAuthenticated: false,
  isInitializing: true,
  user: null,
  openLogin: () => {},
  logout: async () => {},
});
