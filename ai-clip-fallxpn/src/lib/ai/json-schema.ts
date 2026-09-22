import { z } from "zod";

/**
 * Same idea as `gemini-schema.ts` but emits lowercase, standard JSON Schema
 * (`"type": "object"` rather than Gemini's `"OBJECT"`), because we can't
 * assume what's on the other end of a user-configured "Custom AI" base URL.
 * Some OpenAI-compatible backends support `response_format: json_schema`
 * natively; for the ones that don't, this is embedded as text in the prompt
 * instead so the model still has an unambiguous contract to follow. Either
 * way, the actual response is always re-validated with the original Zod
 * schema before use.
 */
export function zodToJsonSchema(schema: z.ZodTypeAny): Record<string, unknown> {
  if (schema instanceof z.ZodOptional || schema instanceof z.ZodNullable) {
    return zodToJsonSchema(schema.unwrap());
  }
  if (schema instanceof z.ZodDefault) {
    return zodToJsonSchema(schema.removeDefault());
  }
  if (schema instanceof z.ZodEffects) {
    return zodToJsonSchema(schema.innerType());
  }
  if (schema instanceof z.ZodEnum) {
    return { type: "string", enum: schema.options };
  }
  if (schema instanceof z.ZodString) {
    return { type: "string" };
  }
  if (schema instanceof z.ZodNumber) {
    const isInt = schema._def.checks.some(
      (c: { kind: string }) => c.kind === "int",
    );
    return { type: isInt ? "integer" : "number" };
  }
  if (schema instanceof z.ZodBoolean) {
    return { type: "boolean" };
  }
  if (schema instanceof z.ZodArray) {
    return { type: "array", items: zodToJsonSchema(schema.element) };
  }
  if (schema instanceof z.ZodObject) {
    const shape = schema.shape as Record<string, z.ZodTypeAny>;
    const properties: Record<string, unknown> = {};
    const required: string[] = [];
    for (const [key, value] of Object.entries(shape)) {
      properties[key] = zodToJsonSchema(value);
      const optional =
        value instanceof z.ZodOptional ||
        value instanceof z.ZodDefault ||
        value.isNullable();
      if (!optional) required.push(key);
    }
    return { type: "object", properties, required, additionalProperties: false };
  }

  throw new Error(
    `zodToJsonSchema: unsupported Zod type "${schema.constructor.name}"`,
  );
}
