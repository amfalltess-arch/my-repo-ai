"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api-client";
import { Card, Badge } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle } from "lucide-react";

interface ProviderConfig {
  type: "GEMINI" | "CUSTOM";
  name: string;
  baseUrl: string | null;
  model: string | null;
  temperature: number;
  maxTokens: number;
  timeoutMs: number;
  enabled: boolean;
  hasApiKey: boolean;
}

function ProviderForm({ type, initial }: { type: "GEMINI" | "CUSTOM"; initial?: ProviderConfig }) {
  const [name, setName] = useState(initial?.name ?? (type === "GEMINI" ? "Gemini" : "Custom AI"));
  const [baseUrl, setBaseUrl] = useState(initial?.baseUrl ?? (type === "GEMINI" ? "https://generativelanguage.googleapis.com" : ""));
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState(initial?.model ?? "");
  const [temperature, setTemperature] = useState(initial?.temperature ?? 0.7);
  const [maxTokens, setMaxTokens] = useState(initial?.maxTokens ?? 8192);
  const [timeoutMs, setTimeoutMs] = useState(initial?.timeoutMs ?? 60000);
  const [enabled, setEnabled] = useState(initial?.enabled ?? false);
  const [hasApiKey, setHasApiKey] = useState(initial?.hasApiKey ?? false);
  const [models, setModels] = useState<string[]>([]);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function handleSave() {
    setBusy("save");
    try {
      await api.put("/admin/ai-providers", {
        type, name, baseUrl, model, temperature, maxTokens, timeoutMs, enabled,
        ...(apiKey ? { apiKey } : {}),
      });
      if (apiKey) setHasApiKey(true);
      setApiKey("");
      setTestResult(null);
    } catch (err) {
      setTestResult({ ok: false, message: err instanceof ApiError ? err.message : "Save failed." });
    } finally {
      setBusy(null);
    }
  }

  async function handleTest() {
    setBusy("test");
    setTestResult(null);
    try {
      const result = await api.post<{ ok: boolean; message: string }>("/admin/ai-providers/test-connection", {
        type, baseUrl, model, ...(apiKey ? { apiKey } : {}),
      });
      setTestResult(result);
    } finally {
      setBusy(null);
    }
  }

  async function handleFetchModels() {
    setBusy("fetch");
    try {
      const { models } = await api.post<{ models: string[] }>("/admin/ai-providers/fetch-models", {
        type, baseUrl, ...(apiKey ? { apiKey } : {}),
      });
      setModels(models);
    } catch (err) {
      setTestResult({ ok: false, message: err instanceof ApiError ? err.message : "Could not fetch models." });
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card className="space-y-4 p-5">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-bold text-ink">{type === "GEMINI" ? "Gemini" : "Custom AI"}</h2>
        <label className="flex items-center gap-2 text-sm text-ink-muted">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          Enabled
        </label>
      </div>

      <Row label="Provider Name"><input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} /></Row>
      <Row label="Base URL"><input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} className={inputClass} /></Row>
      <Row label="API Key">
        <input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder={hasApiKey ? "•••••••••••• (saved — leave blank to keep)" : "Enter API key"}
          className={inputClass}
        />
      </Row>
      <Row label="Model">
        <div className="flex gap-2">
          <input value={model} onChange={(e) => setModel(e.target.value)} className={inputClass} list={`${type}-models`} />
          <datalist id={`${type}-models`}>
            {models.map((m) => <option key={m} value={m} />)}
          </datalist>
          <Button size="sm" variant="secondary" disabled={busy !== null} onClick={handleFetchModels}>
            {busy === "fetch" ? "..." : "Fetch Models"}
          </Button>
        </div>
      </Row>
      <div className="grid grid-cols-3 gap-3">
        <Row label="Temperature"><input type="number" step="0.1" value={temperature} onChange={(e) => setTemperature(Number(e.target.value))} className={inputClass} /></Row>
        <Row label="Max Tokens"><input type="number" value={maxTokens} onChange={(e) => setMaxTokens(Number(e.target.value))} className={inputClass} /></Row>
        <Row label="Timeout (ms)"><input type="number" value={timeoutMs} onChange={(e) => setTimeoutMs(Number(e.target.value))} className={inputClass} /></Row>
      </div>

      {testResult && (
        <div className={`flex items-center gap-2 rounded-card p-3 text-sm ${testResult.ok ? "bg-signal-bg text-signal" : "bg-danger-bg text-danger"}`}>
          {testResult.ok ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
          {testResult.message}
        </div>
      )}

      <div className="flex gap-2">
        <Button size="sm" variant="secondary" disabled={busy !== null} onClick={handleTest}>
          {busy === "test" ? "Testing..." : "Test Connection"}
        </Button>
        <Button size="sm" disabled={busy !== null} onClick={handleSave}>
          {busy === "save" ? "Saving..." : "Save"}
        </Button>
      </div>
    </Card>
  );
}

export default function AdminAiProvidersPage() {
  const [configs, setConfigs] = useState<Record<string, ProviderConfig>>({});
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    api.get<{ configs: ProviderConfig[] }>("/admin/ai-providers").then((d) => {
      const map: Record<string, ProviderConfig> = {};
      d.configs.forEach((c) => (map[c.type] = c));
      setConfigs(map);
      setLoaded(true);
    });
  }, []);

  if (!loaded) return <p className="text-ink-muted">Loading...</p>;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-ink">AI Providers</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Exactly one provider should be enabled at a time — enabling one disables the other.
          API keys are encrypted at rest and never sent back to the browser.
        </p>
      </div>
      <ProviderForm type="GEMINI" initial={configs.GEMINI} />
      <ProviderForm type="CUSTOM" initial={configs.CUSTOM} />
    </div>
  );
}

const inputClass = "w-full rounded-card border border-base-border bg-base-raised px-3 py-1.5 text-sm text-ink outline-none focus:border-signal";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs text-ink-muted">{label}</label>
      {children}
    </div>
  );
}
