import { describe, expect, it } from "vitest";
import { humanizeEkartNdrReason } from "./ekart.ndrSync.js";

describe("ekart NDR reason copy", () => {
  it("humanizes Durin undelivered codes", () => {
    expect(humanizeEkartNdrReason("undelivered_due_to_request_for_reschedule")).toBe(
      "Undelivered due to request for reschedule"
    );
    expect(humanizeEkartNdrReason("Undelivered. (Rescheduled to: __dd-mm-yy__)")).toBe(
      "Undelivered. (Rescheduled to: __dd-mm-yy__)"
    );
  });
});
