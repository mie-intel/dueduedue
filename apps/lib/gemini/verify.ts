import { GoogleGenerativeAI } from "@google/generative-ai";

function getGeminiApiKey() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not configured");
  return apiKey;
}

const genAI = new GoogleGenerativeAI(getGeminiApiKey());
const GEMINI_MODEL = "gemini-2.5-flash";
const MAX_GEMINI_ATTEMPTS = 4;

export interface VerificationResult {
  isSafe: boolean;
  matchesAnswer: boolean;
  confidence: number;
  difficulty: "easy" | "medium" | "hard";
  isUniversal: boolean;
  rejectReason: string | null;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function isRetryableGeminiError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return (
    message.includes("503 service unavailable") ||
    message.includes("currently experiencing high demand") ||
    message.includes("try again later") ||
    message.includes("429") ||
    message.includes("resource exhausted") ||
    message.includes("rate limit")
  );
}

async function generateVerificationContent(
  imagePart: { inlineData: { data: string; mimeType: string } },
  prompt: string,
) {
  const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });

  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_GEMINI_ATTEMPTS; attempt++) {
    try {
      return await model.generateContent([imagePart, prompt]);
    } catch (error) {
      lastError = error;
      if (!isRetryableGeminiError(error) || attempt === MAX_GEMINI_ATTEMPTS) {
        throw error;
      }

      await sleep(1000 * 2 ** (attempt - 1));
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Gemini request failed");
}

export async function verifyQuestionImage(
  imageUrl: string,
  answer: string,
): Promise<VerificationResult> {
  const prompt = `You are a strict quality gatekeeper for a global picture-guessing game played by all ages.

Your job: verify whether the image is suitable as a question where players must guess the word "${answer}".

VERIFICATION RULES — apply all strictly:

1. ANSWER MATCH (matchesAnswer):
   - The claimed answer "${answer}" must be the PRIMARY, DOMINANT subject of the image.
   - If a player looks at this image and guesses "${answer}", it must feel OBVIOUS and CORRECT.
   - Reject if: the answer word only appears as a background element, minor detail, or partial subject.
   - Reject if: the image shows something that COULD be called "${answer}" but equally fits 3+ other words.
   - Reject if: the answer word is a stretch, metaphor, or abstract interpretation of the image.
   - Example PASS: image of a banana → answer "BANANA". Clear, unambiguous, primary subject.
   - Example FAIL: image of a fruit bowl with one banana → answer "BANANA". Banana is not dominant.
   - Example FAIL: image of a sunset → answer "BEAUTIFUL". Abstract, not a concrete object.

2. UNIVERSALITY (isUniversal):
   - The answer word must be recognizable to players worldwide regardless of culture or language.
   - Reject if: the answer is a local brand, regional food, person's name, or location-specific object.
   - Pass: "BICYCLE", "CAT", "GUITAR", "UMBRELLA" — globally understood concrete nouns.
   - Fail: "OJEK", "RENDANG", "JAKARTA", names of people.

3. SAFETY (isSafe):
   - Reject any NSFW content, violence, gore, hate symbols, or inappropriate content for all ages.

4. DIFFICULTY:
   - easy: most 10-year-olds worldwide would guess correctly in under 5 seconds.
   - medium: clear subject but requires a moment of thought.
   - hard: recognizable but obscure — most adults would need more than 10 seconds.

5. CONFIDENCE (0.0 to 1.0):
   - Your certainty that "${answer}" is the correct and obvious label for this image.
   - Score below 0.7 means the image is ambiguous — treat as rejection.

Respond in JSON only, no explanation, no markdown:
{
  "isSafe": boolean,
  "matchesAnswer": boolean,
  "confidence": number,
  "difficulty": "easy" | "medium" | "hard",
  "isUniversal": boolean,
  "rejectReason": string | null
}

If rejecting, rejectReason must be a short, specific explanation (e.g. "Answer is not the primary subject", "Image is NSFW", "Answer word is culturally specific").
If passing, rejectReason must be null.`;

  const imageResponse = await fetch(imageUrl);
  const imageBuffer = await imageResponse.arrayBuffer();
  const base64 = Buffer.from(imageBuffer).toString("base64");
  const mimeType = imageResponse.headers.get("content-type") ?? "image/jpeg";

  const result = await generateVerificationContent(
    { inlineData: { data: base64, mimeType } },
    prompt,
  );

  const text = result.response.text().trim();
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Invalid Gemini response");

  return JSON.parse(jsonMatch[0]) as VerificationResult;
}

export function passesVerification(result: VerificationResult): boolean {
  return (
    result.isSafe &&
    result.matchesAnswer &&
    result.confidence >= 0.7 &&
    result.isUniversal
  );
}
