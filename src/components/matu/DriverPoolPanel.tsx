import { useEffect, useState } from "react";
import { Users, Settings2, Loader2, Send, Ban } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

type PoolStatus = "forming" | "locked" | "dispatched" | "completed" | "collapsed";

type PoolPreferences = {
  auto_accept_enabled: boolean;
  max_auto_accept_members: number | null;
  max_auto_accept_detour_seconds: number | null;
};

type MatchedPool = {
  id: string;
  status: PoolStatus;
  per_head_fee: number | null;
  total_detour_seconds: number | null;
  route_id: string;
  destination_stage_id: string;
};

/**
 * Driver-side settings for the "pooled pickup" auto-accept preference
 * (driver_pool_preferences) plus a card for any pool currently locked and
 * waiting on this driver's trip, with a manual dispatch action.
 *
 * Auto-accept itself is applied server-side via try_auto_dispatch_pool,
 * typically called right after a trip starts; this panel just lets the
 * driver configure the caps and manually dispatch when auto-accept is off
 * or the pool exceeds their auto-accept caps.
 */
export function DriverPoolPanel({ driverId, tripId }: { driverId: string; tripId: string | null }) {
  const [prefs, setPrefs] = useState<PoolPreferences>({
    auto_accept_enabled: false,
    max_auto_accept_members: null,
    max_auto_accept_detour_seconds: null,
  });
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [matchedPool, setMatchedPool] = useState<MatchedPool | null>(null);
  const [memberCount, setMemberCount] = useState(0);
  const [dispatching, setDispatching] = useState(false);

  useEffect(() => {
    supabase
      .from("driver_pool_preferences")
      .select("auto_accept_enabled, max_auto_accept_members, max_auto_accept_detour_seconds")
      .eq("driver_id", driverId)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setPrefs(data as PoolPreferences);
      });
  }, [driverId]);

  // Find any pool locked and matched to this driver's current trip.
  useEffect(() => {
    if (!tripId) {
      setMatchedPool(null);
      return;
    }
    let cancelled = false;

    async function loadMatched() {
      const { data } = await supabase
        .from("pickup_pools")
        .select("id, status, per_head_fee, total_detour_seconds, route_id, destination_stage_id")
        .eq("trip_id", tripId)
        .in("status", ["locked", "dispatched"])
        .maybeSingle();
      if (!cancelled) setMatchedPool((data as MatchedPool) ?? null);
    }
    loadMatched();

    const channel = supabase
      .channel(`driver-pools-${tripId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "pickup_pools", filter: `trip_id=eq.${tripId}` },
        () => loadMatched(),
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [tripId]);

  useEffect(() => {
    if (!matchedPool) return;
    supabase
      .from("pickup_pool_members")
      .select("id", { count: "exact", head: true })
      .eq("pool_id", matchedPool.id)
      .eq("status", "pending")
      .then(({ count }) => setMemberCount(count ?? 0));
  }, [matchedPool?.id]);

  async function savePrefs(next: Partial<PoolPreferences>) {
    const merged = { ...prefs, ...next };
    setPrefs(merged);
    setSavingPrefs(true);
    try {
      const { error } = await supabase
        .from("driver_pool_preferences")
        .upsert({ driver_id: driverId, ...merged }, { onConflict: "driver_id" });
      if (error) throw error;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save pool preferences");
    } finally {
      setSavingPrefs(false);
    }
  }

  async function handleDispatch() {
    if (!matchedPool || !tripId) return;
    setDispatching(true);
    try {
      const { error } = await supabase.rpc("dispatch_pool", {
        _pool_id: matchedPool.id,
        _trip_id: tripId,
      });
      if (error) throw error;
      toast.success("Pool dispatched — head to the pickup point");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't dispatch pool");
    } finally {
      setDispatching(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Settings2 className="h-4 w-4 text-primary" />
            Pooled pickup preferences
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="auto-accept" className="font-medium">
                Auto-accept pools
              </Label>
              <p className="text-xs text-muted-foreground">
                Skip manual review and dispatch matched pools automatically.
              </p>
            </div>
            <Switch
              id="auto-accept"
              checked={prefs.auto_accept_enabled}
              disabled={savingPrefs}
              onCheckedChange={(checked) => savePrefs({ auto_accept_enabled: checked })}
            />
          </div>
          {prefs.auto_accept_enabled && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="max-members" className="text-xs text-muted-foreground">
                  Max pool size
                </Label>
                <Input
                  id="max-members"
                  type="number"
                  min={1}
                  placeholder="Platform default"
                  value={prefs.max_auto_accept_members ?? ""}
                  onChange={(e) =>
                    savePrefs({
                      max_auto_accept_members: e.target.value ? Number(e.target.value) : null,
                    })
                  }
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="max-detour" className="text-xs text-muted-foreground">
                  Max detour (sec)
                </Label>
                <Input
                  id="max-detour"
                  type="number"
                  min={0}
                  placeholder="Platform default"
                  value={prefs.max_auto_accept_detour_seconds ?? ""}
                  onChange={(e) =>
                    savePrefs({
                      max_auto_accept_detour_seconds: e.target.value
                        ? Number(e.target.value)
                        : null,
                    })
                  }
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {matchedPool && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between text-base">
              <span className="flex items-center gap-2">
                <Users className="h-4 w-4 text-primary" />
                Matched pool
              </span>
              <Badge variant={matchedPool.status === "dispatched" ? "default" : "secondary"}>
                {matchedPool.status === "dispatched" ? "Dispatched" : "Awaiting dispatch"}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Passengers</span>
              <span className="font-medium">{memberCount}</span>
            </div>
            {matchedPool.total_detour_seconds != null && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Est. detour</span>
                <span className="font-medium">
                  {Math.round(matchedPool.total_detour_seconds / 60)} min
                </span>
              </div>
            )}
            {matchedPool.per_head_fee != null && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Fee per passenger</span>
                <span className="font-medium">KES {matchedPool.per_head_fee.toFixed(0)}</span>
              </div>
            )}
            {matchedPool.status === "locked" && (
              <Button onClick={handleDispatch} disabled={dispatching} className="w-full">
                {dispatching ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                Dispatch pool
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {!matchedPool && tripId && (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Ban className="h-3.5 w-3.5" />
          No pooled pickup currently matched to this trip.
        </p>
      )}
    </div>
  );
}
