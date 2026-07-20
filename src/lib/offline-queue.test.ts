import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the two modules offline-queue.ts talks to, so tests never touch a
// real Supabase project or real IndexedDB.
const rpcMock = vi.fn();
const updateMock = vi.fn();
const eqMock = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpcMock(...args),
    from: () => ({
      update: (...args: unknown[]) => {
        updateMock(...args);
        return { eq: (...eqArgs: unknown[]) => eqMock(...eqArgs) };
      },
    }),
  },
}));

const getQueuedActionsMock = vi.fn();
const removeQueuedActionMock = vi.fn();

vi.mock("@/lib/offline-cache", () => ({
  getQueuedActions: (...args: unknown[]) => getQueuedActionsMock(...args),
  removeQueuedAction: (...args: unknown[]) => removeQueuedActionMock(...args),
}));

// Import after mocks are registered.
const { flushQueue } = await import("@/lib/offline-queue");

describe("flushQueue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
  });

  it("does nothing when offline", async () => {
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
    getQueuedActionsMock.mockResolvedValue([
      { id: "1", type: "mark_alighted", bookingId: "b1", createdAt: 1 },
    ]);

    const result = await flushQueue();

    expect(result).toEqual({ synced: 0, failed: 0 });
    expect(getQueuedActionsMock).not.toHaveBeenCalled();
  });

  it("replays queued actions oldest-first and removes each on success", async () => {
    getQueuedActionsMock.mockResolvedValue([
      { id: "newer", type: "mark_alighted", bookingId: "b1", createdAt: 200 },
      { id: "older", type: "mark_alighted", bookingId: "b2", createdAt: 100 },
    ]);
    eqMock.mockResolvedValue({ error: null });

    const result = await flushQueue();

    expect(result).toEqual({ synced: 2, failed: 0 });
    // The older action (createdAt: 100) must be replayed before the newer one,
    // otherwise a stale status could overwrite a more recent one for the
    // same booking.
    expect(removeQueuedActionMock.mock.calls[0][0]).toBe("older");
    expect(removeQueuedActionMock.mock.calls[1][0]).toBe("newer");
  });

  it("routes mark_cash_collected through the confirm_cash_payment RPC, not a direct column write", async () => {
    getQueuedActionsMock.mockResolvedValue([
      { id: "1", type: "mark_cash_collected", bookingId: "b1", createdAt: 1 },
    ]);
    rpcMock.mockResolvedValue({ error: null });

    await flushQueue();

    expect(rpcMock).toHaveBeenCalledWith("confirm_cash_payment", { p_booking_id: "b1" });
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("stops at the first real failure and leaves the rest queued", async () => {
    getQueuedActionsMock.mockResolvedValue([
      { id: "1", type: "mark_alighted", bookingId: "b1", createdAt: 1 },
      { id: "2", type: "mark_alighted", bookingId: "b2", createdAt: 2 },
    ]);
    eqMock.mockResolvedValueOnce({ error: new Error("network blip") });

    const result = await flushQueue();

    expect(result).toEqual({ synced: 0, failed: 1 });
    expect(removeQueuedActionMock).not.toHaveBeenCalled();
    // Only the first action should have been attempted — a real failure
    // stops the pass rather than spamming the rest immediately.
    expect(eqMock).toHaveBeenCalledTimes(1);
  });

  it("is a no-op re-entrant guard: concurrent calls don't double-flush", async () => {
    getQueuedActionsMock.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve([]), 10)),
    );

    const [first, second] = await Promise.all([flushQueue(), flushQueue()]);

    // One of the two concurrent calls should be short-circuited by the
    // `flushing` guard, which only getQueuedActions being called once proves.
    expect(getQueuedActionsMock).toHaveBeenCalledTimes(1);
    expect([first, second]).toContainEqual({ synced: 0, failed: 0 });
  });
});
