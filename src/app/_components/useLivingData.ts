"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ActivityEntry, ApiPosition, ApiScanResponse, ApiScoredPool, SsePayload } from "./types";

export interface LivingData {
  pools: ApiScoredPool[];
  /** Epoch-ms of the last persisted scan snapshot; null on cold first run. */
  scanUpdatedAt: number | null;
  position: ApiPosition | null;
  activity: ActivityEntry[];
  loading: boolean;
  scanning: boolean; // true briefly after a manual rescan / when fresh log activity arrives
  connected: boolean; // SSE stream open
  rescan: () => void;
}

async function getJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export function useLivingData(): LivingData {
  const [pools, setPools] = useState<ApiScoredPool[]>([]);
  const [scanUpdatedAt, setScanUpdatedAt] = useState<number | null>(null);
  const [position, setPosition] = useState<ApiPosition | null>(null);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  // loading is true only while the very first fetch is in-flight.
  // Once the fetch resolves (even with an empty snapshot), it becomes false.
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [connected, setConnected] = useState(false);
  const scanTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastLogTs = useRef<number>(0);

  const refetchScan = useCallback(async () => {
    const data = await getJson<ApiScanResponse>("/api/scan");
    if (data && Array.isArray(data.pools)) {
      setPools(data.pools);
      setScanUpdatedAt(data.updatedAt ?? null);
    }
  }, []);

  const refetchPosition = useCallback(async () => {
    const data = await getJson<ApiPosition>("/api/position");
    if (data) setPosition(data);
  }, []);

  // Initial load.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [scan, pos, act] = await Promise.all([
        getJson<ApiScanResponse>("/api/scan"),
        getJson<ApiPosition>("/api/position"),
        getJson<ActivityEntry[]>("/api/activity"),
      ]);
      if (cancelled) return;
      if (scan && Array.isArray(scan.pools)) {
        setPools(scan.pools);
        setScanUpdatedAt(scan.updatedAt ?? null);
      }
      if (pos) setPosition(pos);
      if (Array.isArray(act)) {
        setActivity(act);
        lastLogTs.current = act[0]?.ts ?? 0;
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // SSE: live position + decision + activity. Re-fetch the scan when a "scan"
  // log line appears (fresh pool data is available).
  useEffect(() => {
    if (typeof window === "undefined" || typeof EventSource === "undefined") return;
    const es = new EventSource("/api/events");
    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);
    es.onmessage = (ev) => {
      try {
        const payload = JSON.parse(ev.data) as SsePayload;
        // Merge SSE position (poolId+amount) with the decision so the chosen pool
        // + rationale stay in sync without a separate poll.
        setPosition((prev) => ({
          poolId: payload.position.poolId,
          amountUsdc: payload.position.amountUsdc,
          chosenPoolId: payload.decision?.chosenPoolId ?? prev?.chosenPoolId ?? null,
          rationale: payload.decision?.rationale ?? prev?.rationale ?? "",
          action: payload.decision?.action ?? prev?.action ?? "hold",
        }));
        if (Array.isArray(payload.log) && payload.log.length) {
          setActivity((prev) => {
            const seen = new Set(prev.map((e) => `${e.ts}:${e.message}`));
            const fresh = payload.log.filter((e) => !seen.has(`${e.ts}:${e.message}`));
            if (!fresh.length) return prev;
            return [...fresh, ...prev].slice(0, 60);
          });
          const newest = payload.log[0];
          if (newest && newest.ts > lastLogTs.current) {
            lastLogTs.current = newest.ts;
            if (newest.kind === "scan" || newest.kind === "rebalance") {
              void refetchScan();
              flashScanning();
            }
          }
        }
      } catch {
        /* ignore malformed frames */
      }
    };
    return () => es.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refetchScan]);

  // Periodic scan refresh as a safety net (SSE doesn't carry the pool array).
  useEffect(() => {
    const id = setInterval(() => void refetchScan(), 15_000);
    return () => clearInterval(id);
  }, [refetchScan]);

  const flashScanning = useCallback(() => {
    setScanning(true);
    if (scanTimer.current) clearTimeout(scanTimer.current);
    scanTimer.current = setTimeout(() => setScanning(false), 2200);
  }, []);

  // Manual "Start scan" — re-pulls scan + position and flashes the scanning
  // animation. (The agent loop drives real scans; this surfaces the latest.)
  const rescan = useCallback(() => {
    flashScanning();
    void refetchScan();
    void refetchPosition();
  }, [flashScanning, refetchScan, refetchPosition]);

  return { pools, scanUpdatedAt, position, activity, loading, scanning, connected, rescan };
}
