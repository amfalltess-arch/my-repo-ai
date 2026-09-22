import { Badge } from "@/components/ui/card";
import type { GenerationStatus } from "@prisma/client";

const LABELS: Record<GenerationStatus, string> = {
  QUEUED: "Queued",
  ANALYZING: "Analyzing",
  TRANSCRIBING: "Transcribing",
  FINDING_HIGHLIGHTS: "Finding highlights",
  GENERATING_CLIPS: "Generating clips",
  AUTO_EDITING: "Auto-editing",
  GENERATING_SUBTITLES: "Generating subtitles",
  RENDERING: "Rendering",
  GENERATING_METADATA: "Generating metadata",
  COMPLETED: "Completed",
  COMPLETED_WITH_WARNINGS: "Completed with warnings",
  FAILED: "Failed",
};

export function GenerationStatusBadge({ status }: { status: GenerationStatus }) {
  const tone =
    status === "COMPLETED"
      ? "signal"
      : status === "FAILED"
        ? "danger"
        : status === "COMPLETED_WITH_WARNINGS"
          ? "score"
          : "neutral";
  return <Badge tone={tone as "signal" | "danger" | "neutral"}>{LABELS[status]}</Badge>;
}
