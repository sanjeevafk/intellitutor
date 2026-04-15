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

const monthlyReportSchema = {
  type: "object",
  properties: {
    overview: {
      type: "string",
      description: "A concise overview of the student's monthly learning progress."
    },
    strengths: {
      type: "string",
      description: "Key strengths or positive trends observed during the month."
    },
    areas_to_monitor: {
      type: "string",
      description: "Concerns, gaps, or areas that need attention next month."
    }
  },
  required: ["overview", "strengths", "areas_to_monitor"]
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

export async function generateMonthlyReport(prompt: string) {
  const env = requireEnv();
  if (!client) {
    client = new GoogleGenAI({ apiKey: env.geminiApiKey });
  }

  if (process.env.GEMINI_TEST_MODE === "1") {
    return {
      overview: "Test report: Student maintained steady progress this month.",
      strengths: "Test report: Consistent engagement and homework completion.",
      areasToMonitor: "Test report: Needs more practice with multi-step problems."
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
      responseJsonSchema: monthlyReportSchema
    }
  });

  const rawText = await extractResponseText(response);
  if (!rawText) {
    throw new ApiError(502, "gemini returned empty response");
  }

  try {
    const parsed = JSON.parse(rawText);
    if (!parsed.overview || typeof parsed.overview !== "string") {
      throw new Error("missing overview");
    }
    if (!parsed.strengths || typeof parsed.strengths !== "string") {
      throw new Error("missing strengths");
    }
    if (!parsed.areas_to_monitor || typeof parsed.areas_to_monitor !== "string") {
      throw new Error("missing areas_to_monitor");
    }
    return {
      overview: parsed.overview.trim(),
      strengths: parsed.strengths.trim(),
      areasToMonitor: parsed.areas_to_monitor.trim()
    };
  } catch (error) {
    throw new ApiError(502, "failed to parse gemini response", error);
  }
}

async function extractResponseText(response: unknown): Promise<string> {
  if (response && typeof response === "object") {
    const maybeText = (response as { text?: string | (() => Promise<string>) }).text;
    if (typeof maybeText === "function") {
      return await maybeText.call(response);
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
