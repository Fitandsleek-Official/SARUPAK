/** Shared defaults — apps still load their own env via Nest/Next. */

/** Phase 5.2 stable SARUPAK API port (avoid :4000 — often another local app). */
export const DEFAULT_API_PORT = 4003;
/** Phase 5.2 stable SARUPAK web port (avoid :3000 — often another Next app). */
export const DEFAULT_WEB_PORT = 3010;
export const DEFAULT_WEB_ORIGIN = "http://localhost:3010";
export const DEFAULT_API_BASE_URL = "http://localhost:4003/v1";
export const DEFAULT_MAX_UPLOAD_MB = 500;
export const SARUPAK_SERVICE_ID = "sarupak-api";
