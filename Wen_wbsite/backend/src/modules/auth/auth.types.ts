export interface AuthUser {
  userId: number;
  tokenId: string;
}

export interface RequestMetadata {
  ipAddress?: string;
  userAgent?: string;
}

export interface PublicUser {
  id: number;
  phone: string;
  nickname: string | null;
  signature: string | null;
  avatar: string | null;
  status: string;
  phoneVerifiedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export class AuthError extends Error {
  constructor(
    message: string,
    public readonly status = 401,
    public readonly code = 'AUTH_FAILED',
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

declare global {
  namespace Express {
    interface Request {
      auth?: AuthUser;
    }
  }
}
