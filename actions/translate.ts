"use server";

import OpenAI from "openai";

export interface TranslationResult {
  translatedText?: string;
  detectedSourceLang?: string;
  error?: string;
}

export async function translateTextAction(
  text: string,
  targetLang: string
): Promise<TranslationResult> {
  // 1. Validation
  if (!text || !text.trim()) {
    return { translatedText: "" };
  }

  try {
    // Initialize OpenAI inside the action to prevent top-level execution issues
    // and enable browser access for hybrid environments
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY || "placeholder-key",
      dangerouslyAllowBrowser: true,
    });

    // 2. OpenAI Request
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are a high-accuracy translation engine. 
          1. Detect the source language of the input text (ISO 639-1 code).
          2. Translate the text into the target language with code "${targetLang}".
          3. Return a JSON object with keys: "translatedText" (string) and "detectedSourceLang" (string).`,
        },
        {
          role: "user",
          content: text,
        },
      ],
      response_format: { type: "json_object" },
    });

    const result = JSON.parse(completion.choices[0].message.content || "{}");

    return {
      translatedText: result.translatedText,
      detectedSourceLang: result.detectedSourceLang,
    };
  } catch (_error) {
    return { error: "Failed to translate text. Please try again." };
  }
}
