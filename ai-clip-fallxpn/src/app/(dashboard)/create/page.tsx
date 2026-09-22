"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Sparkles, Upload, Youtube } from "lucide-react";

interface VideoSummary {
  id: string;
  title: string | null;
  thumbnailUrl: string | null;
  durationSec: number | null;
  channel: string | null;
}
interface TemplateSummary {
  id: string;
  name: string;
}
interface TikTokAccountSummary {
  id: string;
  username: string;
}

const CONTENT_TYPES = [
  "FUNNY", "PODCAST", "GAMING", "STORY", "EDUCATION",
  "MOTIVATION", "DRAMA", "REACTION", "INTERVIEW", "NEWS", "GENERAL",
];
const VIDEO_COUNT_PRESETS = [5, 10, 20, 30, 40];
const SUBTITLE_STYLES = ["KARAOKE", "BOLD", "MINIMAL", "HIGHLIGHT_WORD", "PODCAST", "GAMING", "MODERN", "CLEAN"];

export default function CreatePage() {
  const router = useRouter();
  const [video, setVideo] = useState<VideoSummary | null>(null);
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [rightsConfirmed, setRightsConfirmed] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [tiktokAccounts, setTiktokAccounts] = useState<TikTokAccountSummary[]>([]);

  const [videoCount, setVideoCount] = useState(40);
  const [customCount, setCustomCount] = useState("");
  const [contentType, setContentType] = useState("GENERAL");
  const [clipMin, setClipMin] = useState(30);
  const [clipMax, setClipMax] = useState(60);
  const [aspectRatio, setAspectRatio] = useState<"RATIO_9_16" | "RATIO_1_1" | "RATIO_16_9">("RATIO_9_16");
  const [subtitleEnabled, setSubtitleEnabled] = useState(true);
  const [subtitleStyle, setSubtitleStyle] = useState("BOLD");
  const [templateId, setTemplateId] = useState<string>("");
  const [variantCount, setVariantCount] = useState(1);
  const [autoPost, setAutoPost] = useState(false);
  const [tiktokAccountId, setTiktokAccountId] = useState<string>("");
  const [scheduleStart, setScheduleStart] = useState("");
  const [scheduleInterval, setScheduleInterval] = useState(30);
  const [submitting, setSubmitting] = useState(false);
  const [maxVideoCount, setMaxVideoCount] = useState(40);

  useEffect(() => {
    api.get<{ templates: TemplateSummary[] }>("/templates").then((d) => setTemplates(d.templates)).catch(() => undefined);
    api.get<{ accounts: TikTokAccountSummary[] }>("/tiktok/accounts").then((d) => setTiktokAccounts(d.accounts)).catch(() => undefined);
    // Spec section 31: admin-set defaults (Default Videos, Clip Duration,
    // Ratio, Subtitle, Bio Template) seed the form instead of hardcoded values.
    api
      .get<{ defaults: {
        defaultVideoCount: number; maxVideoCount: number; defaultClipMinSec: number;
        defaultClipMaxSec: number; defaultAspectRatio: "RATIO_9_16" | "RATIO_1_1" | "RATIO_16_9";
        defaultSubtitleEnabled: boolean; defaultSubtitleStyle: string; defaultContentTemplateId: string | null;
      } }>("/settings/defaults")
      .then(({ defaults }) => {
        setVideoCount(defaults.defaultVideoCount);
        setMaxVideoCount(defaults.maxVideoCount);
        setClipMin(defaults.defaultClipMinSec);
        setClipMax(defaults.defaultClipMaxSec);
        setAspectRatio(defaults.defaultAspectRatio);
        setSubtitleEnabled(defaults.defaultSubtitleEnabled);
        setSubtitleStyle(defaults.defaultSubtitleStyle);
        if (defaults.defaultContentTemplateId) setTemplateId(defaults.defaultContentTemplateId);
      })
      .catch(() => undefined);
  }, []);

  async function handleAnalyzeYoutube() {
    setError(null);
    setAnalyzing(true);
    try {
      const { video } = await api.post<{ video: VideoSummary }>("/videos/youtube", {
        url: youtubeUrl,
        rightsConfirmed: true,
      });
      setVideo(video);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not analyze this URL.");
    } finally {
      setAnalyzing(false);
    }
  }

  async function handleFileUpload(file: File) {
    setError(null);
    setUploading(true);
    try {
      const { video } = await api.uploadVideo<{ video: VideoSummary }>(file);
      setVideo(video);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  async function handleGenerate() {
    if (!video) return;
    setError(null);
    setSubmitting(true);
    try {
      const finalCount = customCount ? Number(customCount) : videoCount;
      const { generation } = await api.post<{ generation: { id: string } }>("/generations", {
        videoId: video.id,
        videoCount: finalCount,
        contentType,
        clipLengthMinSec: clipMin,
        clipLengthMaxSec: clipMax,
        aspectRatio,
        subtitleEnabled,
        subtitleStyle,
        contentTemplateId: templateId || null,
        textVariantCount: variantCount,
        autoPostEnabled: autoPost,
        tiktokAccountId: autoPost ? tiktokAccountId || null : null,
        schedule:
          autoPost && scheduleStart
            ? {
                startAt: new Date(scheduleStart).toISOString(),
                intervalMin: scheduleInterval,
                timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
              }
            : null,
      });
      router.push(`/generations/${generation.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not start generation.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-ink">Create</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Feed in one long video, get back scored, ready-to-post vertical clips.
        </p>
      </div>

      {!video ? (
        <Card className="p-6">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-card border-2 border-dashed border-base-border p-8 text-center hover:border-signal">
              <Upload size={22} className="text-ink-muted" />
              <span className="text-sm text-ink-muted">
                {uploading ? "Uploading..." : "Upload MP4 / MOV / WEBM / MKV / AVI"}
              </span>
              <input
                type="file"
                accept="video/mp4,video/quicktime,video/webm,video/x-matroska,video/x-msvideo"
                className="hidden"
                disabled={uploading}
                onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0])}
              />
            </label>
            <div className="flex flex-col justify-center gap-2 rounded-card border border-base-border p-6">
              <div className="flex items-center gap-2 text-sm text-ink-muted">
                <Youtube size={18} /> YouTube URL
              </div>
              <input
                value={youtubeUrl}
                onChange={(e) => setYoutubeUrl(e.target.value)}
                placeholder="https://youtube.com/watch?v=..."
                className="rounded-card border border-base-border bg-base-raised px-3 py-2 text-sm text-ink outline-none focus:border-signal"
              />
              <Button
                size="sm"
                variant="secondary"
                disabled={!youtubeUrl || analyzing}
                onClick={handleAnalyzeYoutube}
              >
                {analyzing ? "Analyzing..." : "Analyze"}
              </Button>
            </div>
          </div>
          <p className="mt-4 text-xs text-ink-faint">
            Only process content you have the rights to use. AI ClipFlow does not bypass private
            videos, login walls, or DRM.
          </p>
          {error && <p className="mt-3 text-sm text-danger">{error}</p>}
        </Card>
      ) : (
        <>
          <Card className="flex items-center gap-4 p-4">
            {video.thumbnailUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={video.thumbnailUrl} alt="" className="h-16 w-28 rounded object-cover" />
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-ink">{video.title}</p>
              <p className="text-xs text-ink-muted">
                {video.channel ? `${video.channel} • ` : ""}
                {video.durationSec ? `${Math.floor(video.durationSec / 60)}:${String(video.durationSec % 60).padStart(2, "0")}` : ""}
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setVideo(null)}>
              Change
            </Button>
          </Card>

          <Card className="space-y-6 p-6">
            <Field label="Content type">
              <select value={contentType} onChange={(e) => setContentType(e.target.value)} className={selectClass}>
                {CONTENT_TYPES.map((c) => (
                  <option key={c} value={c}>{c.charAt(0) + c.slice(1).toLowerCase()}</option>
                ))}
              </select>
            </Field>

            <Field label="Number of videos">
              <div className="flex flex-wrap gap-2">
                {VIDEO_COUNT_PRESETS.filter((n) => n <= maxVideoCount).map((n) => (
                  <PresetButton key={n} active={!customCount && videoCount === n} onClick={() => { setVideoCount(n); setCustomCount(""); }}>
                    {n}
                  </PresetButton>
                ))}
                <input
                  value={customCount}
                  onChange={(e) => setCustomCount(e.target.value.replace(/\D/g, ""))}
                  placeholder="Custom"
                  className="w-24 rounded-card border border-base-border bg-base-raised px-3 py-1.5 text-sm text-ink outline-none focus:border-signal"
                />
              </div>
              <p className="mt-1 text-xs text-ink-faint">Maximum {maxVideoCount} per generation.</p>
            </Field>

            <Field label="Clip length (seconds)">
              <div className="flex items-center gap-2">
                <input type="number" value={clipMin} onChange={(e) => setClipMin(Number(e.target.value))} className={`${selectClass} w-24`} />
                <span className="text-ink-muted">to</span>
                <input type="number" value={clipMax} onChange={(e) => setClipMax(Number(e.target.value))} className={`${selectClass} w-24`} />
              </div>
            </Field>

            <Field label="Aspect ratio">
              <div className="flex gap-2">
                {(["RATIO_9_16", "RATIO_1_1", "RATIO_16_9"] as const).map((r) => (
                  <PresetButton key={r} active={aspectRatio === r} onClick={() => setAspectRatio(r)}>
                    {r === "RATIO_9_16" ? "9:16" : r === "RATIO_1_1" ? "1:1" : "16:9"}
                  </PresetButton>
                ))}
              </div>
            </Field>

            <Field label="Subtitle">
              <div className="flex flex-wrap items-center gap-3">
                <Toggle checked={subtitleEnabled} onChange={setSubtitleEnabled} />
                {subtitleEnabled && (
                  <select value={subtitleStyle} onChange={(e) => setSubtitleStyle(e.target.value)} className={selectClass}>
                    {SUBTITLE_STYLES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                )}
              </div>
            </Field>

            <Field label="Bio / caption template">
              <select value={templateId} onChange={(e) => setTemplateId(e.target.value)} className={selectClass}>
                <option value="">None</option>
                {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </Field>

            <Field label="Text variants">
              <div className="flex gap-2">
                {[1, 3, 5, 10].map((n) => (
                  <PresetButton key={n} active={variantCount === n} onClick={() => setVariantCount(n)}>{n}</PresetButton>
                ))}
              </div>
            </Field>

            <Field label="Auto post to TikTok">
              <Toggle checked={autoPost} onChange={setAutoPost} />
              {autoPost && (
                <div className="mt-3 space-y-3">
                  <select value={tiktokAccountId} onChange={(e) => setTiktokAccountId(e.target.value)} className={selectClass}>
                    <option value="">Select TikTok account...</option>
                    {tiktokAccounts.map((a) => <option key={a.id} value={a.id}>@{a.username}</option>)}
                  </select>
                  {tiktokAccounts.length === 0 && (
                    <p className="text-xs text-ink-faint">
                      No TikTok account connected yet — connect one from the TikTok page first.
                    </p>
                  )}
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="text-ink-muted">Start</span>
                    <input
                      type="datetime-local"
                      value={scheduleStart}
                      onChange={(e) => setScheduleStart(e.target.value)}
                      className={selectClass}
                    />
                    <span className="text-ink-muted">every</span>
                    <input
                      type="number"
                      value={scheduleInterval}
                      onChange={(e) => setScheduleInterval(Number(e.target.value))}
                      className={`${selectClass} w-20`}
                    />
                    <span className="text-ink-muted">min</span>
                  </div>
                </div>
              )}
            </Field>

            {error && <p className="text-sm text-danger">{error}</p>}

            <Button size="lg" className="w-full" disabled={submitting} onClick={handleGenerate}>
              <Sparkles size={18} />
              {submitting ? "Starting..." : `Generate ${customCount || videoCount} Videos`}
            </Button>
          </Card>
        </>
      )}
    </div>
  );
}

const selectClass =
  "rounded-card border border-base-border bg-base-raised px-3 py-1.5 text-sm text-ink outline-none focus:border-signal";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-sm font-medium text-ink">{label}</p>
      {children}
    </div>
  );
}

function PresetButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-card border px-3 py-1.5 text-sm transition-colors ${
        active ? "border-signal bg-signal-bg text-signal" : "border-base-border text-ink-muted hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`h-6 w-11 rounded-full transition-colors ${checked ? "bg-signal" : "bg-base-elevated"}`}
    >
      <span
        className={`block h-5 w-5 translate-y-0.5 rounded-full bg-white transition-transform ${
          checked ? "translate-x-5" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}
