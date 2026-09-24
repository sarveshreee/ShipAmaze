/**
 * Master switch for Velocity on the website.
 * false = hide Velocity couriers, warehouse-sync prompts, and Velocity booking actions.
 * Set to true to show Velocity again. Also set VELOCITY_SITE_CONNECTED = true
 * in backend/src/config/env.ts and VELOCITY_ENABLED=true, then restart the API.
 */
export const VELOCITY_UI_ENABLED = false;
