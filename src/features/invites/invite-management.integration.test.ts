import { describe, expect, it } from "vitest";
import { invitationMessage } from "./invite-management";

describe("invite management presentation boundary", () => {
  const issued = {
    intendedEmail: "athlete@example.test",
    expiresAt: "2026-08-31T14:30:00.000Z",
    inviteUrl: "http://localhost:3100/sign-up?invite=non-usable-test-token",
  };

  it("interpolates the one-time result into the exact localized beta boundary message", () => {
    const portuguese = invitationMessage(issued, "pt");
    const english = invitationMessage(issued, "en");
    for (const message of [portuguese, english]) {
      expect(message).toContain(issued.inviteUrl);
      expect(message).toContain(issued.intendedEmail);
      expect(message).toContain("Strava");
      expect(message).toContain("\n\n");
    }
    expect(portuguese).toContain("pode ser usado uma vez");
    expect(english).toContain("can be used once");
  });
});
