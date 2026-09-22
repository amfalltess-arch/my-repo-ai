import { prisma } from "@/lib/db";

/**
 * Spec section 31 (Admin Default Generation). Stored as a single
 * `SystemSetting` row (key: "generation_defaults") rather than a dedicated
 * table, since it's one small config blob — see `AdminSettingsPage` /
 * `PUT /api/admin/settings` for how it's edited.
 */
export interface GenerationDefaults {
  defaultVideoCount: number;
  maxVideoCount: number;
  defaultClipMinSec: number;
  defaultClipMaxSec: number;
  defaultAspectRatio: "RATIO_9_16" | "RATIO_1_1" | "RATIO_16_9";
  defaultSubtitleEnabled: boolean;
  defaultSubtitleStyle: string;
  defaultAiProvider: "GEMINI" | "CUSTOM";
  defaultContentTemplateId: string | null;
}

const SETTINGS_KEY = "generation_defaults";

function envDefaults(): GenerationDefaults {
  return {
    defaultVideoCount: Number(process.env.DEFAULT_VIDEOS_PER_BATCH ?? 40),
    maxVideoCount: Number(process.env.MAX_VIDEOS_PER_BATCH ?? 40),
    defaultClipMinSec: 30,
    defaultClipMaxSec: 60,
    defaultAspectRatio: "RATIO_9_16",
    defaultSubtitleEnabled: true,
    defaultSubtitleStyle: "BOLD",
    defaultAiProvider: (process.env.AI_PROVIDER ?? "gemini").toUpperCase() as "GEMINI" | "CUSTOM",
    defaultContentTemplateId: null,
  };
}

export async function getGenerationDefaults(): Promise<GenerationDefaults> {
  const row = await prisma.systemSetting.findUnique({ where: { key: SETTINGS_KEY } }).catch(() => null);
  if (!row) return envDefaults();
  return { ...envDefaults(), ...(row.value as Partial<GenerationDefaults>) };
}

export async function setGenerationDefaults(
  patch: Partial<GenerationDefaults>,
): Promise<GenerationDefaults> {
  const current = await getGenerationDefaults();
  const next = { ...current, ...patch };
  await prisma.systemSetting.upsert({
    where: { key: SETTINGS_KEY },
    create: { key: SETTINGS_KEY, value: next },
    update: { value: next },
  });
  return next;
}
