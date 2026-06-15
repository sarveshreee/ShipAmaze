/** ShipAmaze brand assets (served from /public/brand). */

/** App mark — purple icon for sidebar / favicon contexts. */
export const LOGO_MARK = "/brand/icon-192.png";

/** Sidebar card — original logo with cream/white background (legacy). */
export const LOGO_CARD = "/brand/logo-card.png";

/** Transparent purple logo for light-mode headers (Locations #2, #3). */
export const LOGO_LIGHT = "/brand/logo-light.png";

/** Transparent white logo for dark-mode headers (Locations #2, #3). */
export const LOGO_DARK = "/brand/logo-dark.png";

/** @deprecated Use LOGO_LIGHT */
export const BRAND_LOGO = LOGO_LIGHT;
/** @deprecated Use LOGO_CARD */
export const BRAND_LOGO_WITH_BG = LOGO_CARD;
export const BRAND_LOGO_MARK = LOGO_MARK;
export const BRAND_OG_IMAGE = "/brand/og-image.png";
export const BRAND_FAVICON = "/brand/favicon-32.png";
export const BRAND_APPLE_TOUCH = "/brand/apple-touch-icon.png";

/** Auth hero illustrations (login / signup split panels). */
export const AUTH_LOGIN_HERO = "/brand/loginpage.png";
export const AUTH_SIGNUP_HERO = "/brand/singuppage.png";

export function themeAwareLogo(isDark: boolean): string {
  return isDark ? LOGO_DARK : LOGO_LIGHT;
}
