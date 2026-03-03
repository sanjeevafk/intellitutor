import { GoogleGenAI } from "@google/genai";
import { ApiError } from "./api-error";
import { requireEnv } from "./env";

let client: GoogleGenAI | null = null;

const summarySchema = {
  type: "object",
  properties: {
    summary_text: {
      type: "string",
      description: "A 2-4 sentence, factual weekly summary of the student's learning progress and concerns."
    }
  },
  required: ["summary_text"]
};

export async function generateWeeklySummary(prompt: string) {
  const env = requireEnv();
  if (!client) {
    client = new GoogleGenAI({ apiKey: env.geminiApiKey });
  }

  if (process.env.GEMINI_TEST_MODE === "1") {
    return {
      summaryText: "Test summary: Student showed steady progress this week."
    };
  }

  const response = await client.models.generateContent({
    model: process.env.GEMINI_MODEL ?? "gemini-2.5-flash",
    contents: [
      {
        role: "user",
        parts: [{ text: prompt }]
      }
    ],
    config: {
      temperature: env.summaryTemperature,
      maxOutputTokens: env.summaryMaxTokens,
      responseMimeType: "application/json",
      responseJsonSchema: summarySchema
    }
  });

  const rawText = await extractResponseText(response);
  if (!rawText) {
    throw new ApiError(502, "gemini returned empty response");
  }

  try {
    const parsed = JSON.parse(rawText);
    if (!parsed.summary_text || typeof parsed.summary_text !== "string") {
      throw new Error("missing summary_text");
    }
    return {
      summaryText: parsed.summary_text.trim()
    };
  } catch (error) {
    throw new ApiError(502, "failed to parse gemini response", error);
  }
}

async function extractResponseText(response: unknown): Promise<string> {
  if (response && typeof response === "object") {
    const maybeText = (response as { text?: string | (() => Promise<string>) }).text;
    if (typeof maybeText === "function") {
      return await maybeText();
    }
    if (typeof maybeText === "string") {
      return maybeText;
    }
    const candidates = (response as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> }).candidates;
    if (candidates && candidates.length > 0) {
      const parts = candidates[0]?.content?.parts ?? [];
      const combined = parts.map((part) => part.text ?? "").join("");
      return combined;
    }
  }
  return "";
}
