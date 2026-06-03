"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ActivityEntry, ApiPosition, ApiScanResponse, ApiScoredPool } from "./types";

export interface LivingData {
  pools: ApiScoredPool[];
  /** Epoch-ms of the last persisted scan snapshot; null on cold first run. */
  scanUpdatedAt: number | null;
  position: ApiPosition | null;
  activity: ActivityEntry[];
  loading: boolean;
  scanning: boolean; // true briefly after a manual rescan / when fresh log activity arrives
  connected: boolean; // true once polling has succeeded at least once
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

// Poll cadences. Position+decision+activity are cheap reads; the scan array is
// pulled less often. (On Vercel, SSE can't be held open across the function
// timeout, so the live feed is plain polling — robust and serverless-friendly.)
const LIVE_POLL_MS = 3_000;
const SCAN_POLL_MS = 15_000;

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

  const flashScanning = useCallback(() => {
    setScanning(true);
    if (scanTimer.current) clearTimeout(scanTimer.current);
    scanTimer.current = setTimeout(() => setScanning(false), 2200);
  }, []);

  // Initial load: scan + position + activity in parallel.
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

  // Live feed via polling: pull position (already merged with the latest agent
  // decision) + the activity log every few seconds. When a fresh "scan" /
  // "rebalance" log line appears, re-pull the scan array and flash the animation.
  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      const [pos, act] = await Promise.all([
        getJson<ApiPosition>("/api/position"),
        getJson<ActivityEntry[]>("/api/activity"),
      ]);
      if (cancelled) return;
      if (pos || Array.isArray(act)) setConnected(true);
      if (pos) setPosition(pos);
      if (Array.isArray(act)) {
        setActivity(act);
        const newest = act[0];
        if (newest && newest.ts > lastLogTs.current) {
          lastLogTs.current = newest.ts;
          if (newest.kind === "scan" || newest.kind === "rebalance") {
            void refetchScan();
            flashScanning();
          }
        }
      }
    };
    void poll();
    const id = setInterval(poll, LIVE_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [refetchScan, flashScanning]);

  // Periodic scan refresh as a safety net (the live poll only carries the pool
  // array when a fresh scan log lands).
  useEffect(() => {
    const id = setInterval(() => void refetchScan(), SCAN_POLL_MS);
    return () => clearInterval(id);
  }, [refetchScan]);

  // Manual "Start scan" — re-pulls scan + position and flashes the scanning
  // animation. (The agent tick drives real scans; this surfaces the latest.)
  const rescan = useCallback(() => {
    flashScanning();
    void refetchScan();
    void refetchPosition();
  }, [flashScanning, refetchScan, refetchPosition]);

  return { pools, scanUpdatedAt, position, activity, loading, scanning, connected, rescan };
}
