"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Loader2, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/components/i18n/locale-provider";
import { apiFetch } from "@/lib/api-client/browser";

/**
 * Broker and server pickers for the add-account form.
 *
 * The two fields are one component because they are one lookup: MetaApi's
 * search returns each broker together with its servers, so choosing a broker
 * already carries the server list — no second request.
 *
 * Both accept free text on purpose. MetaApi's directory is a search capped at
 * ten brokers, and its own docs note that servers outside the list still work,
 * so a locked-down select would refuse valid accounts.
 *
 * The dropdown lists each broker's matching servers, not just its name,
 * because MetaApi indexes registered entities rather than trading brands. The
 * broker a member knows as "IC Markets Global" is filed as "Raw Trading Ltd";
 * only its servers (ICMarketsSC-*) carry a recognisable name. Showing servers
 * is what lets someone find their broker from what their terminal displays.
 */

type BrokerResult = { broker: string; servers: string[] };

export function BrokerServerPicker({
  platform,
  brokerError,
  serverError,
}: {
  platform: "MT4" | "MT5";
  brokerError?: string;
  serverError?: string;
}) {
  const t = useT();

  const [broker, setBroker] = useState("");
  const [server, setServer] = useState("");
  const [results, setResults] = useState<BrokerResult[]>([]);
  const [servers, setServers] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [brokerOpen, setBrokerOpen] = useState(false);
  const [serverOpen, setServerOpen] = useState(false);

  const brokerBox = useRef<HTMLDivElement | null>(null);
  const serverBox = useRef<HTMLDivElement | null>(null);
  // Guards against a slow earlier request overwriting a newer one's results.
  const requestSeq = useRef(0);

  // A server name is only valid for the version it belongs to, so switching
  // platform invalidates both fields rather than silently keeping a bad pair.
  useEffect(() => {
    setBroker("");
    setServer("");
    setResults([]);
    setServers([]);
  }, [platform]);

  const search = useCallback(
    async (query: string) => {
      if (query.trim().length < 2) {
        setResults([]);
        return;
      }
      const seq = ++requestSeq.current;
      setLoading(true);
      try {
        const res = await apiFetch(
          `/api/brokers?platform=${platform}&query=${encodeURIComponent(query)}`,
          { cache: "no-store" },
        );
        const json = (await res.json()) as { ok: boolean; data?: { results: BrokerResult[] } };
        if (seq !== requestSeq.current) return; // a newer keystroke already won
        setResults(json.ok && json.data ? json.data.results : []);
      } catch {
        if (seq === requestSeq.current) setResults([]);
      } finally {
        if (seq === requestSeq.current) setLoading(false);
      }
    },
    [platform],
  );

  // Debounced: this fires per keystroke and spends provider quota.
  useEffect(() => {
    if (!brokerOpen) return;
    const id = window.setTimeout(() => search(broker), 300);
    return () => window.clearTimeout(id);
  }, [broker, brokerOpen, search]);

  useEffect(() => {
    const onDown = (event: MouseEvent) => {
      if (!brokerBox.current?.contains(event.target as Node)) setBrokerOpen(false);
      if (!serverBox.current?.contains(event.target as Node)) setServerOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const chooseBroker = (result: BrokerResult) => {
    setBroker(result.broker);
    setServers(result.servers);
    setServer(result.servers.length === 1 ? result.servers[0]! : "");
    setBrokerOpen(false);
  };

  const filteredServers = servers.filter((s) => s.toLowerCase().includes(server.toLowerCase()));

  const needle = broker.trim().toLowerCase().replace(/\s+/g, "");
  const matchesQuery = (value: string) => value.toLowerCase().replace(/\s+/g, "").includes(needle);

  // A broker found only through its servers is easy to scroll past when the
  // name looks unrelated, so those servers are surfaced first.
  const ranked = results.map((result) => {
    const hits = needle.length >= 2 ? result.servers.filter(matchesQuery) : [];
    return { ...result, hits, preview: [...hits, ...result.servers.filter((s) => !hits.includes(s))] };
  });

  return (
    <>
      <div className="space-y-1.5" ref={brokerBox}>
        <label htmlFor="broker" className="block text-sm font-medium">
          {t.accountManager.broker}
        </label>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            id="broker"
            name="broker"
            required
            autoComplete="off"
            value={broker}
            onChange={(event) => {
              setBroker(event.target.value);
              setBrokerOpen(true);
            }}
            onFocus={() => setBrokerOpen(true)}
            placeholder={t.accountManager.brokerSearchPlaceholder}
            aria-invalid={Boolean(brokerError)}
            className={cn(
              "panel h-10 w-full rounded-lg pl-9 pr-9 text-sm outline-none transition placeholder:text-muted focus:border-brand-500",
              brokerError && "border-red-500",
            )}
          />
          {loading && (
            <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted" />
          )}

          {brokerOpen && broker.trim().length >= 2 && (
            <div className="panel absolute left-0 right-0 top-11 z-30 max-h-64 overflow-y-auto rounded-lg shadow-xl">
              {results.length === 0 ? (
                <p className="px-3 py-2.5 text-xs text-muted">
                  {loading ? t.accountManager.searching : t.accountManager.noBrokers}
                </p>
              ) : (
                ranked.map((result) => (
                  <button
                    key={result.broker}
                    type="button"
                    onClick={() => chooseBroker(result)}
                    className="flex w-full items-start gap-2 px-3 py-2.5 text-left text-sm transition hover:bg-black/5 dark:hover:bg-white/5"
                  >
                    <Check
                      className={cn(
                        "mt-0.5 h-3.5 w-3.5 shrink-0",
                        result.broker === broker ? "opacity-100" : "opacity-0",
                      )}
                      style={{ color: "var(--gold)" }}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{result.broker}</span>
                      <span className="mt-0.5 block truncate text-xs">
                        {result.preview.slice(0, 3).map((name, index) => (
                          <span
                            key={name}
                            style={result.hits.includes(name) ? { color: "var(--gold)" } : undefined}
                            className={result.hits.includes(name) ? "font-medium" : "text-muted"}
                          >
                            {index > 0 && <span className="text-muted"> · </span>}
                            {name}
                          </span>
                        ))}
                        {result.servers.length > 3 && (
                          <span className="text-muted"> +{result.servers.length - 3}</span>
                        )}
                      </span>
                    </span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
        {brokerError && <p className="text-xs text-red-500">{brokerError}</p>}
        <p className="text-xs text-muted">{t.accountManager.brokerHint}</p>
      </div>

      <div className="space-y-1.5" ref={serverBox}>
        <label htmlFor="server" className="block text-sm font-medium">
          {t.accountManager.server}
        </label>
        <div className="relative">
          <input
            id="server"
            name="server"
            required
            autoComplete="off"
            value={server}
            onChange={(event) => {
              setServer(event.target.value);
              setServerOpen(true);
            }}
            onFocus={() => setServerOpen(true)}
            placeholder={
              servers.length > 0
                ? t.accountManager.serverSelectPlaceholder
                : t.accountManager.serverPlaceholder
            }
            aria-invalid={Boolean(serverError)}
            className={cn(
              "panel h-10 w-full rounded-lg px-3 pr-9 text-sm outline-none transition placeholder:text-muted focus:border-brand-500",
              serverError && "border-red-500",
            )}
          />
          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />

          {serverOpen && servers.length > 0 && (
            <div className="panel absolute left-0 right-0 top-11 z-30 max-h-64 overflow-y-auto rounded-lg shadow-xl">
              {filteredServers.length === 0 ? (
                <p className="px-3 py-2.5 text-xs text-muted">{t.accountManager.noServerMatch}</p>
              ) : (
                filteredServers.map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => {
                      setServer(option);
                      setServerOpen(false);
                    }}
                    className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm transition hover:bg-black/5 dark:hover:bg-white/5"
                  >
                    <Check
                      className={cn("h-3.5 w-3.5 shrink-0", option === server ? "opacity-100" : "opacity-0")}
                      style={{ color: "var(--gold)" }}
                    />
                    <span className="truncate">{option}</span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
        {serverError && <p className="text-xs text-red-500">{serverError}</p>}
        <p className="text-xs text-muted">
          {servers.length > 0 ? t.accountManager.serverHint : t.accountManager.serverHintNoBroker}
        </p>
      </div>
    </>
  );
}
