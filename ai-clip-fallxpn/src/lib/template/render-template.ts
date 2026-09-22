/**
 * Deterministic `{{variable}}` substitution (spec section 14). This is
 * intentionally NOT an AI call: applying "the same Bio Template" to all 40
 * clips (section 13) has to be exact and reproducible, so it's plain string
 * substitution, not a model asked to "write something similar" 40 times.
 */
export interface TemplateVariables {
  title?: string;
  description?: string;
  hashtags?: string[];
  clip_number?: number;
  category?: string;
  score?: number;
  duration?: number;
  channel?: string;
  date?: string;
  cta?: string;
}

const VARIABLE_PATTERN = /\{\{\s*(\w+)\s*\}\}/g;

export function renderTemplate(
  template: string,
  variables: TemplateVariables,
): string {
  return template.replace(VARIABLE_PATTERN, (match, key: string) => {
    switch (key) {
      case "title":
        return variables.title ?? "";
      case "description":
        return variables.description ?? "";
      case "hashtags":
        return (variables.hashtags ?? []).map((h) => `#${h}`).join(" ");
      case "clip_number":
        return variables.clip_number != null
          ? String(variables.clip_number).padStart(2, "0")
          : "";
      case "category":
        return variables.category ?? "";
      case "score":
        return variables.score != null ? String(variables.score) : "";
      case "duration":
        return variables.duration != null
          ? formatDuration(variables.duration)
          : "";
      case "channel":
        return variables.channel ?? "";
      case "date":
        return variables.date ?? new Date().toLocaleDateString();
      case "cta":
        return variables.cta ?? "";
      default:
        return match; // unknown variable — leave it untouched rather than silently dropping it
    }
  });
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * Assembles the final ready-to-post caption from title + description +
 * bio template + hashtags (spec sections 13/25), applying `{{variable}}`
 * substitution to the bio template itself so it can reference the clip's
 * own metadata alongside its static boilerplate text.
 */
export function assembleCaption(params: {
  title: string;
  description: string;
  hashtags: string[];
  bioTemplate?: string;
  variables: TemplateVariables;
}): string {
  const parts = [params.title, params.description];
  if (params.bioTemplate) {
    parts.push(renderTemplate(params.bioTemplate, params.variables));
  }
  if (params.hashtags.length > 0) {
    parts.push(params.hashtags.map((h) => `#${h}`).join(" "));
  }
  return parts.filter(Boolean).join("\n\n");
}
