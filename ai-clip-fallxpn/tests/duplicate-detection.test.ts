import { describe, expect, it } from "vitest";
import {
  timestampOverlapRatio,
  transcriptSimilarity,
  hammingDistance,
  selectDistinctHighlights,
  type EnrichedCandidate,
} from "@/lib/highlight/duplicate-detection";

describe("timestampOverlapRatio", () => {
  it("returns 0 for non-overlapping ranges", () => {
    expect(timestampOverlapRatio({ start: 0, end: 10 }, { start: 20, end: 30 })).toBe(0);
  });

  it("returns 1 for identical ranges", () => {
    expect(timestampOverlapRatio({ start: 0, end: 10 }, { start: 0, end: 10 })).toBe(1);
  });

  it("computes partial overlap as intersection-over-union", () => {
    // [0,10] and [5,15]: intersection = 5, union = 15 -> 0.333...
    const ratio = timestampOverlapRatio({ start: 0, end: 10 }, { start: 5, end: 15 });
    expect(ratio).toBeCloseTo(5 / 15, 5);
  });
});

describe("transcriptSimilarity", () => {
  it("is 1 for identical text", () => {
    expect(transcriptSimilarity("hello world", "hello world")).toBe(1);
  });

  it("is 0 for completely different text", () => {
    expect(transcriptSimilarity("apple banana", "car train plane")).toBe(0);
  });

  it("is higher for mostly-overlapping text than for mostly-different text", () => {
    const high = transcriptSimilarity("the quick brown fox", "the quick brown dog");
    const low = transcriptSimilarity("the quick brown fox", "totally unrelated sentence");
    expect(high).toBeGreaterThan(low);
  });
});

describe("hammingDistance", () => {
  it("is 0 for identical hashes", () => {
    expect(hammingDistance("ff00ff00", "ff00ff00")).toBe(0);
  });

  it("counts differing bits", () => {
    // 0x0 = 0000, 0xf = 1111 -> 4 bits differ
    expect(hammingDistance("0", "f")).toBe(4);
  });
});

function makeCandidate(overrides: Partial<EnrichedCandidate>): EnrichedCandidate {
  return {
    id: Math.random().toString(36),
    start: 0,
    end: 30,
    title: "Clip",
    reason: "test",
    score: 80,
    category: "Funny",
    transcriptExcerpt: "some unique text " + Math.random(),
    ...overrides,
  };
}

describe("selectDistinctHighlights", () => {
  it("keeps all candidates when none overlap or resemble each other", () => {
    const candidates = [
      makeCandidate({ start: 0, end: 30, score: 90 }),
      makeCandidate({ start: 100, end: 130, score: 85 }),
      makeCandidate({ start: 200, end: 230, score: 80 }),
    ];
    const { selected } = selectDistinctHighlights(candidates, 3);
    expect(selected).toHaveLength(3);
  });

  it("rejects a candidate that heavily overlaps a higher-scored one", () => {
    const candidates = [
      makeCandidate({ start: 0, end: 30, score: 95, transcriptExcerpt: "aaa" }),
      makeCandidate({ start: 2, end: 32, score: 90, transcriptExcerpt: "bbb" }), // overlaps almost entirely
    ];
    const { selected, rejected } = selectDistinctHighlights(candidates, 2);
    expect(selected).toHaveLength(1);
    expect(selected[0]?.score).toBe(95);
    expect(rejected).toHaveLength(1);
  });

  it("rejects a candidate whose transcript is nearly identical even at a different timestamp", () => {
    const candidates = [
      makeCandidate({
        start: 0,
        end: 30,
        score: 95,
        transcriptExcerpt: "this is a great moment in the video",
      }),
      makeCandidate({
        start: 500,
        end: 530,
        score: 90,
        transcriptExcerpt: "this is a great moment in the video",
      }),
    ];
    const { selected } = selectDistinctHighlights(candidates, 2);
    expect(selected).toHaveLength(1);
  });

  it("never returns more than targetCount", () => {
    const candidates = Array.from({ length: 10 }, (_, i) =>
      makeCandidate({ start: i * 100, end: i * 100 + 30, score: 100 - i }),
    );
    const { selected } = selectDistinctHighlights(candidates, 5);
    expect(selected).toHaveLength(5);
    // Highest scores should win.
    expect(selected.map((c) => c.score)).toEqual([100, 99, 98, 97, 96]);
  });
});
