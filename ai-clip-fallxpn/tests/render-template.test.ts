import { describe, expect, it } from "vitest";
import { renderTemplate, assembleCaption } from "@/lib/template/render-template";

describe("renderTemplate", () => {
  it("substitutes known variables", () => {
    const result = renderTemplate("Hello {{title}}!", { title: "World" });
    expect(result).toBe("Hello World!");
  });

  it("pads clip_number to two digits", () => {
    expect(renderTemplate("Clip {{clip_number}}", { clip_number: 3 })).toBe("Clip 03");
    expect(renderTemplate("Clip {{clip_number}}", { clip_number: 12 })).toBe("Clip 12");
  });

  it("joins hashtags with # prefixes", () => {
    const result = renderTemplate("{{hashtags}}", { hashtags: ["fyp", "viral"] });
    expect(result).toBe("#fyp #viral");
  });

  it("formats duration as m:ss", () => {
    expect(renderTemplate("{{duration}}", { duration: 65 })).toBe("1:05");
  });

  it("leaves unknown variables untouched rather than dropping them silently", () => {
    expect(renderTemplate("{{not_a_real_variable}}", {})).toBe("{{not_a_real_variable}}");
  });

  it("renders the same template identically for every call (determinism, spec section 13)", () => {
    const vars = { title: "X", clip_number: 1 };
    const a = renderTemplate("{{title}} #{{clip_number}}", vars);
    const b = renderTemplate("{{title}} #{{clip_number}}", vars);
    expect(a).toBe(b);
  });
});

describe("assembleCaption", () => {
  it("combines title, description, rendered bio, and hashtags in order", () => {
    const caption = assembleCaption({
      title: "My Title",
      description: "My description.",
      hashtags: ["fyp", "funny"],
      bioTemplate: "Follow for more! Part {{clip_number}}",
      variables: { clip_number: 5 },
    });
    expect(caption).toContain("My Title");
    expect(caption).toContain("My description.");
    expect(caption).toContain("Follow for more! Part 05");
    expect(caption).toContain("#fyp #funny");
  });

  it("omits the bio section entirely when no template is provided", () => {
    const caption = assembleCaption({
      title: "T",
      description: "D",
      hashtags: [],
      variables: {},
    });
    expect(caption).toBe("T\n\nD");
  });
});
