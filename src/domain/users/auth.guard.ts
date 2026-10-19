import type { AppEnv } from "../../config/env.js";
import { isAdmin } from "../../config/env.js";
import { ForbiddenError, UnauthorizedError } from "../../shared/errors.js";

export function assertCanActOnOccurrence(
  userId: number,
  targetUserId: number,
  occurrenceId: string,
  isAdmin = false,
): void {
  if (userId !== targetUserId && !isAdmin) {
    throw new ForbiddenError(
      `User ${userId} is not authorized to act on occurrence ${occurrenceId} intended for ${targetUserId}`,
    );
  }
}

export function assertCanManageReminders(userId: number, env: AppEnv): void {
  if (!isAdmin(userId, env)) {
    throw new UnauthorizedError(`User ${userId} does not have administrator privileges`);
  }
}

export function canAccessUserHistory(
  requestingUserId: number,
  targetUserId: number,
  env: AppEnv,
  targetUserConsented = true,
): boolean {
  if (requestingUserId === targetUserId) return true;
  return isAdmin(requestingUserId, env) && targetUserConsented;
}
