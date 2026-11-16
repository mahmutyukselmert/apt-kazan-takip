declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    APP_PASSWORD?: string;
    AUTH_REQUIRED?: string;
  }
}
