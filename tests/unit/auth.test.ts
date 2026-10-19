import { describe, expect, it } from "vitest";
import { readEnv } from "../../src/config/env.js";
import {
  assertCanActOnOccurrence,
  assertCanManageReminders,
  canAccessUserHistory,
} from "../../src/domain/users/auth.guard.js";
import { ForbiddenError, UnauthorizedError } from "../../src/shared/errors.js";

describe("auth.guard", () => {
  const env = readEnv({
    TG_BOT_TOKEN: "1234567890:AAFakeMockTokenForTestingPurposes00000",
    TG_ADMIN_USER_IDS: "359079621, 261171441",
  });

  const fatherId = 915156343;
  const adminId = 359079621;
  const strangerId = 88888888;

  it("permits only the target user to act on an occurrence", () => {
    expect(() => assertCanActOnOccurrence(fatherId, fatherId, "occ-1")).not.toThrow();
    // Even an admin cannot click Done on someone else's button directly
    expect(() => assertCanActOnOccurrence(adminId, fatherId, "occ-1")).toThrow(ForbiddenError);
    // Stranger definitely rejected
    expect(() => assertCanActOnOccurrence(strangerId, fatherId, "occ-1")).toThrow(ForbiddenError);
  });

  it("permits only admins to manage reminders in the admin menu", () => {
    expect(() => assertCanManageReminders(adminId, env)).not.toThrow();
    expect(() => assertCanManageReminders(261171441, env)).not.toThrow();
    expect(() => assertCanManageReminders(fatherId, env)).toThrow(UnauthorizedError);
    expect(() => assertCanManageReminders(strangerId, env)).toThrow(UnauthorizedError);
  });

  it("controls access to private health history", () => {
    // User can always access their own history
    expect(canAccessUserHistory(fatherId, fatherId, env, false)).toBe(true);

    // Admin can access if user consented
    expect(canAccessUserHistory(adminId, fatherId, env, true)).toBe(true);

    // Admin cannot access if user revoked consent
    expect(canAccessUserHistory(adminId, fatherId, env, false)).toBe(false);

    // Stranger cannot access
    expect(canAccessUserHistory(strangerId, fatherId, env, true)).toBe(false);
  });
});
