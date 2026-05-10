/**
 * @deprecated Import from ./email/emailClient.js or ./email/emailService.js for new code.
 * Kept for backward compatibility with server startup logs and older imports.
 */
export { envTrim, resolveSmtp, isSmtpReady, getMailTransportStatus } from "./email/emailClient.js";

/** Password reset — uses branded HTML template; does not log OTP when SMTP is missing. */
export async function sendPasswordResetOtp(to: string, code: string): Promise<void> {
  const { sendPasswordResetBranded } = await import("./email/emailService.js");
  await sendPasswordResetBranded(to, code, 15);
}
