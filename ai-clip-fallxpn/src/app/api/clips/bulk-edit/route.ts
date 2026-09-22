import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, AuthError } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { subtitleStyleEnum } from "@/lib/security/validation";
import { subtitleGenerationQueue } from "@/lib/queue/queues";

const schema = z.object({
  clipIds: z.array(z.string().cuid()).min(1).max(40),
  hashtags: z.array(z.string()).optional(),
  description: z.string().optional(),
  contentTemplateId: z.string().cuid().nullable().optional(),
  subtitleStyle: subtitleStyleEnum.optional(),
});

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = await request.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

    const clips = await prisma.clip.findMany({
      where: { id: { in: parsed.data.clipIds }, generation: { userId: user.id } },
      include: { generation: true },
    });
    if (clips.length !== parsed.data.clipIds.length) {
      return NextResponse.json({ error: "One or more clips were not found." }, { status: 404 });
    }

    let updatedCount = 0;
    let requeuedCount = 0;

    if (parsed.data.hashtags || parsed.data.description) {
      await prisma.clip.updateMany({
        where: { id: { in: parsed.data.clipIds } },
        data: {
          ...(parsed.data.hashtags ? { hashtags: parsed.data.hashtags } : {}),
          ...(parsed.data.description ? { description: parsed.data.description } : {}),
        },
      });
      updatedCount += clips.length;
    }

    if (parsed.data.contentTemplateId !== undefined) {
      // Applying a template is per-generation (spec section 13: same bio for
      // the whole batch), so this updates the generations these clips belong
      // to rather than the clips themselves.
      const generationIds = [...new Set(clips.map((c) => c.generationId))];
      await prisma.generation.updateMany({
        where: { id: { in: generationIds } },
        data: { contentTemplateId: parsed.data.contentTemplateId },
      });
      updatedCount += generationIds.length;
    }

    if (parsed.data.subtitleStyle) {
      const generationIds = [...new Set(clips.map((c) => c.generationId))];
      await prisma.generation.updateMany({
        where: { id: { in: generationIds } },
        data: { subtitleStyle: parsed.data.subtitleStyle },
      });
      for (const clip of clips) {
        await prisma.clip.update({ where: { id: clip.id }, data: { status: "PENDING" } });
        await subtitleGenerationQueue.add("subtitle", {
          generationId: clip.generationId,
          clipId: clip.id,
        });
        requeuedCount++;
      }
    }

    return NextResponse.json({ updatedCount, requeuedCount });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("bulk-edit error:", err);
    return NextResponse.json({ error: "Could not apply bulk edit." }, { status: 500 });
  }
}
