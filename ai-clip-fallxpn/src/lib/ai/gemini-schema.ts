import { z } from "zod";

/**
 * Gemini's `responseSchema` (generationConfig) accepts a restricted subset of
 * OpenAPI 3.0 schema objects. This converts the Zod schemas in `types.ts`
 * into that shape, so every prompt's expected output is defined exactly
 * once and reused for both "ask the model for this JSON shape" and
 * "validate what came back."
 *
 * Only the constructs actually used in this codebase are supported
 * (object, array, string, number/int, enum, optional/default, nullable).
 * Extend this if a future prompt needs something more exotic.
 */
export interface GeminiSchema {
  type: "OBJECT" | "ARRAY" | "STRING" | "NUMBER" | "INTEGER" | "BOOLEAN";
  description?: string;
  nullable?: boolean;
  enum?: string[];
  properties?: Record<string, GeminiSchema>;
  required?: string[];
  items?: GeminiSchema;
  propertyOrdering?: string[];
}

export function zodToGeminiSchema(schema: z.ZodTypeAny): GeminiSchema {
  const description = schema.description;

  if (schema instanceof z.ZodOptional) {
    return { ...zodToGeminiSchema(schema.unwrap()), nullable: true };
  }
  if (schema instanceof z.ZodNullable) {
    return { ...zodToGeminiSchema(schema.unwrap()), nullable: true };
  }
  if (schema instanceof z.ZodDefault) {
    return zodToGeminiSchema(schema.removeDefault());
  }
  if (schema instanceof z.ZodEffects) {
    return zodToGeminiSchema(schema.innerType());
  }
  if (schema instanceof z.ZodEnum) {
    return { type: "STRING", enum: schema.options, description };
  }
  if (schema instanceof z.ZodString) {
    return { type: "STRING", description };
  }
  if (schema instanceof z.ZodNumber) {
    const isInt = schema._def.checks.some(
      (c: { kind: string }) => c.kind === "int",
    );
    return { type: isInt ? "INTEGER" : "NUMBER", description };
  }
  if (schema instanceof z.ZodBoolean) {
    return { type: "BOOLEAN", description };
  }
  if (schema instanceof z.ZodArray) {
    return {
      type: "ARRAY",
      items: zodToGeminiSchema(schema.element),
      description,
    };
  }
  if (schema instanceof z.ZodObject) {
    const shape = schema.shape as Record<string, z.ZodTypeAny>;
    const properties: Record<string, GeminiSchema> = {};
    const required: string[] = [];
    for (const [key, value] of Object.entries(shape)) {
      properties[key] = zodToGeminiSchema(value);
      const optional =
        value instanceof z.ZodOptional ||
        value instanceof z.ZodDefault ||
        value.isNullable();
      if (!optional) required.push(key);
    }
    return {
      type: "OBJECT",
      properties,
      required,
      propertyOrdering: Object.keys(shape),
      description,
    };
  }

  throw new Error(
    `zodToGeminiSchema: unsupported Zod type "${schema.constructor.name}"`,
  );
}
