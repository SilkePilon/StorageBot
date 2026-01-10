import dotenv from 'dotenv';

// Load .env file if it exists (for local development)
// In Docker, environment variables are passed directly via docker-compose
dotenv.config();

const nodeEnv = process.env.NODE_ENV || 'development';

// Validate JWT_SECRET in production
function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret && nodeEnv === 'production') {
    throw new Error('JWT_SECRET environment variable is required in production');
  }
  if (!secret) {
    console.warn('WARNING: Using fallback JWT secret. Set JWT_SECRET in production!');
  }
  return secret || 'dev-fallback-secret-not-for-production';
}

export const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  nodeEnv,
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
  jwt: {
    secret: getJwtSecret(),
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },
  database: {
    url: process.env.DATABASE_URL,
  },
};
