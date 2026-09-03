import { describe, expect, it } from "vitest";
import { canOccupySchedule, customerMutationViolation, transitionViolation, type BookingState } from "./booking-state-machine.js";

const states: BookingState[] = ["HELD", "PENDING", "CONFIRMED", "CANCELLED", "COMPLETED", "NO_SHOW"];
const legal = new Set([
  "HELD:PENDING", "HELD:CONFIRMED", "HELD:CANCELLED",
  "PENDING:CONFIRMED", "PENDING:CANCELLED",
  "CONFIRMED:CANCELLED", "CONFIRMED:COMPLETED", "CONFIRMED:NO_SHOW"
]);

describe("booking state machine", () => {
  it("defines every legal and illegal state pair", () => {
    const now = new Date("2030-01-01T12:00:00Z");
    for (const current of states) for (const target of states) {
      const violation = transitionViolation(current, target, new Date("2030-01-01T10:00:00Z"), new Date("2030-01-01T11:00:00Z"), now);
      expect(violation === null, `${current}:${target}`).toBe(legal.has(`${current}:${target}`));
    }
  });

  it("prevents premature completion and no-show decisions", () => {
    const now = new Date("2030-01-01T10:00:00Z");
    expect(transitionViolation("CONFIRMED", "COMPLETED", new Date("2030-01-01T11:00:00Z"), new Date("2030-01-01T12:00:00Z"), now)).toContain("scheduled end");
    expect(transitionViolation("CONFIRMED", "NO_SHOW", new Date("2030-01-01T11:00:00Z"), new Date("2030-01-01T12:00:00Z"), now)).toContain("scheduled start");
  });

  it("enforces customer notice and terminal states", () => {
    const now = new Date("2030-01-01T10:00:00Z");
    expect(customerMutationViolation("CONFIRMED", new Date("2030-01-01T12:00:00Z"), 60, "cancel", now)).toBeNull();
    expect(customerMutationViolation("CONFIRMED", new Date("2030-01-01T10:30:00Z"), 60, "cancel", now)).toContain("60 minutes");
    expect(customerMutationViolation("COMPLETED", new Date("2030-01-01T12:00:00Z"), 0, "reschedule", now)).toContain("cannot");
    expect(states.filter(canOccupySchedule)).toEqual(["HELD", "PENDING", "CONFIRMED"]);
  });
});
