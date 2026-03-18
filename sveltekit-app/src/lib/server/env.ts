import { env } from '$env/dynamic/private';

export const IMMICH_API_URL = env.IMMICH_API_URL ?? 'http://localhost:2283/api';
export const IMMICH_API_KEY = env.IMMICH_API_KEY ?? '';
export const IMMICH_ML_URL = env.IMMICH_ML_URL ?? 'http://localhost:3003';
export const IMMICH_DB_URL = env.IMMICH_DB_URL ?? '';
export const APP_DATABASE_URL = env.APP_DATABASE_URL ?? '';
export const AUTH_SECRET = env.AUTH_SECRET ?? '';
export const AUTH_GOOGLE_ID = env.AUTH_GOOGLE_ID ?? '';
export const AUTH_GOOGLE_SECRET = env.AUTH_GOOGLE_SECRET ?? '';
export const IMMICH_SERVICE_USER_ID = env.IMMICH_SERVICE_USER_ID ?? '';
export const WATERMARK_BRAND_NAME = env.WATERMARK_BRAND_NAME ?? 'EventSnap';
export const WATERMARK_OPACITY = parseFloat(env.WATERMARK_OPACITY ?? '0.25');
export const WATERMARK_CACHE_DIR = env.WATERMARK_CACHE_DIR ?? '/tmp/watermark-cache';
export const WATERMARK_MAX_PREVIEW_WIDTH = parseInt(env.WATERMARK_MAX_PREVIEW_WIDTH ?? '1200');

// S3 storage (optional — when set, originals are stored in S3 with Immich fallback)
export const S3_URL = env.S3_URL ?? '';
export const S3_BUCKET = env.S3_BUCKET ?? '';
export const S3_ACCESS_KEY = env.S3_ACCESS_KEY ?? '';
export const S3_SECRET_KEY = env.S3_SECRET_KEY ?? '';
export const S3_REGION = env.S3_REGION ?? 'auto';
