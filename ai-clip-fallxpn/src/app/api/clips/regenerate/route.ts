import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, AuthError } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import {
  buildRegeneratePreview,
  regenerateSubtitle,
  regenerateHighlight,
} from "@/lib/regenerate/regenerate-service";

const schema = z.object({
  clipIds: z.array(z.string().cuid()).min(1).max(40),
  fields: z.array(z.enum(["title", "description", "hashtags", "caption", "subtitle", "highlight"])).min(1),
});

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = await request.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

    const owned = await prisma.clip.count({
      where: { id: { in: parsed.data.clipIds }, generation: { userId: user.id } },
    });
    if (owned !== parsed.data.clipIds.length) {
      return NextResponse.json({ error: "One or more clips were not found." }, { status: 404 });
    }

    const previews = [];
    const queued: string[] = [];
    const errors: string[] = [];

    for (const clipId of parsed.data.clipIds) {
      for (const field of parsed.data.fields) {
        try {
          if (field === "subtitle") {
            await regenerateSubtitle(clipId);
            queued.push(`${clipId}:subtitle`);
          } else if (field === "highlight") {
            const result = await regenerateHighlight(clipId);
            if (result.ok) queued.push(`${clipId}:highlight`);
            else errors.push(`${clipId}: ${result.message}`);
          } else {
            previews.push(await buildRegeneratePreview(clipId, field));
          }
        } catch (err) {
          errors.push(`${clipId}:${field} - ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    }

    // "subtitle" and "highlight" re-run the async render pipeline directly
    // (there's no meaningful text to preview beforehand), so they're
    // queued immediately. Text fields come back as previews requiring
    // /api/clips/regenerate/confirm before anything is overwritten.
    return NextResponse.json({ previews, queued, errors });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("regenerate error:", err);
    return NextResponse.json({ error: "Could not regenerate." }, { status: 500 });
  }
}
