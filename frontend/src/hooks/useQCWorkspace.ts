import { useCallback, useEffect, useRef, useState } from "react";
import api from "@/lib/api";
import { getSharedSocket } from "./useRealtimeSync";
import type { QCQueueQuery, QCWorkspaceResponse } from "@/lib/qc-workspace";

export function useQCWorkspace(
  query: QCQueueQuery,
  search: string,
  scope: "all" | "mine",
  rangeDays: number,
) {
  const [data, setData] = useState<QCWorkspaceResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [revision, setRevision] = useState(0);
  const requestId = useRef(0);
  const key = JSON.stringify({ ...query, search, scope, rangeDays });
  const currentKey = useRef(key);
  currentKey.current = key;
  const refresh = useCallback(() => setRevision((v) => v + 1), []);
  const [resolvedKey, setResolvedKey] = useState("");
  useEffect(() => {
    const id = ++requestId.current;
    const abort = new AbortController();
    setLoading(true);
    const timer = window.setTimeout(
      async () => {
        try {
          const response = await api.get("/qc/jobs", {
            params: { ...JSON.parse(key), workspace: true, limit: 20 },
            signal: abort.signal,
            meta: { suppressErrorToast: true, suppressCancelLog: true },
          } as any);
          if (
            id !== requestId.current ||
            currentKey.current !== key ||
            abort.signal.aborted
          )
            return;
          if (!response.data?.success || !response.data.summary)
            throw new Error("Workspace data is unavailable.");
          setData(response.data);
          setResolvedKey(key);
          setError(null);
        } catch (err: any) {
          if (
            abort.signal.aborted ||
            id !== requestId.current ||
            currentKey.current !== key
          )
            return;
          setError(
            err?.response?.data?.message ||
              "Could not refresh the QC workspace.",
          );
        } finally {
          if (
            !abort.signal.aborted &&
            id === requestId.current &&
            currentKey.current === key
          )
            setLoading(false);
        }
      },
      search ? 250 : 0,
    );
    return () => {
      abort.abort();
      window.clearTimeout(timer);
    };
  }, [key, revision]);

  useEffect(() => {
    const socket = getSharedSocket();
    let timer: ReturnType<typeof setTimeout>;
    let settledTimer: ReturnType<typeof setTimeout>;
    const update = () => {
      clearTimeout(timer);
      clearTimeout(settledTimer);
      timer = setTimeout(refresh, 400);
      // Some legacy photo writers do not invalidate the short read cache.
      settledTimer = setTimeout(refresh, 3500);
    };
    const changed = (payload: any) => {
      if (payload.collection === "orders") update();
    };
    const connect = () => {
      setConnected(true);
      update();
    };
    const disconnect = () => setConnected(false);
    setConnected(socket.connected);
    socket.on("connect", connect);
    socket.on("disconnect", disconnect);
    socket.on("orderUpdated", update);
    socket.on("db_change", changed);
    const visible = () => {
      if (!document.hidden) refresh();
    };
    const interval = window.setInterval(visible, 60000);
    document.addEventListener("visibilitychange", visible);
    return () => {
      clearTimeout(timer);
      clearTimeout(settledTimer);
      clearInterval(interval);
      document.removeEventListener("visibilitychange", visible);
      socket.off("connect", connect);
      socket.off("disconnect", disconnect);
      socket.off("orderUpdated", update);
      socket.off("db_change", changed);
    };
  }, [refresh]);
  // Prior-scope rows must never be presented as belonging to the newly selected scope.
  const sameScope = resolvedKey && JSON.parse(resolvedKey).scope === scope;
  return {
    data: sameScope ? data : null,
    loading,
    error,
    connected,
    refresh,
    settled: resolvedKey === key && !loading && !error,
  };
}
