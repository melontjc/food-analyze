export const APP_TIME_ZONE = "Asia/Shanghai";
export const SESSION_COOKIE = "calorie_session";
export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
export const MODEL_IMAGE_MAX_EDGE = 1280;
export const MODEL_IMAGE_QUALITY = 72;
export const JIN_KCAL = 3850;

export function env(name: string, fallback?: string) {
  const value = process.env[name] || fallback;
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

export function optionalEnv(name: string) {
  return process.env[name] || null;
}
