// Voice Profile — maintains writing consistency across all autonomous content.
// Built once from samples, referenced on every content generation task.
// Extracts: sentence patterns, vocabulary, formality, framing style, signature phrases.
// Self-updates based on content performance data.

import { prisma } from "@/lib/prisma";
import { runAIJob } from "./job-runner";
import { safeParseJSON } from "@/lib/safe-json";

interface VoiceCharacteristics {
  sentenceLength: { avg: number; range: string };
  vocabularyLevel: string; // "direct" | "technical" | "conversational"
  formalityLevel: number; // 1-10 (1 = very casual, 10 = very formal)
  problemFraming: string; // How problems are introduced
  dataUsage: string; // "heavy" | "moderate" | "narrative"
  signaturePhrases: string[];
  structuralPatterns: string[];
  toneDescriptor: string; // One-line voice summary
  avoidPatterns: string[]; // Things that don't sound like the author
}

/**
 * Build or rebuild the voice profile from sample content.
 */
export async function buildVoiceProfile(
  sampleContent: string[]
): Promise<string> {
  const result = await runAIJob("lifecycle_manager", "build_voice_profile", {
    samples: sampleContent,
    instructions: `Analyze these writing samples and extract a comprehensive voice profile.

This profile will be used as a constraint on ALL content generation — newsletter, blog, LinkedIn, Twitter.
The goal is that every piece of AI-generated content sounds authentically like this person wrote it.

Extract:
1. **Sentence length patterns** — average word count, longest/shortest typical sentences
2. **Vocabulary** — does the author use jargon? Colloquialisms? Technical terms?
3. **Formality** — 1-10 scale. A LinkedIn post vs. a peer email.
4. **Problem framing** — How does the author introduce problems? Direct statement? Question? Anecdote?
5. **Data usage** — Does the author cite numbers frequently, or rely on narrative?
6. **Signature phrases** — Recurring expressions or patterns unique to this voice
7. **Structural patterns** — How are points organized? Bullet lists? Short paragraphs? Headers?
8. **Tone** — One-line descriptor (e.g., "Direct practitioner who leads with specifics, not theory")
9. **Avoid patterns** — Things that would sound wrong in this voice (corporate jargon, hedging, etc.)

Return JSON matching the VoiceCharacteristics interface:
{
  sentenceLength: { avg: number, range: "X-Y words" },
  vocabularyLevel: "direct" | "technical" | "conversational",
  formalityLevel: number,
  problemFraming: string,
  dataUsage: "heavy" | "moderate" | "narrative",
  signaturePhrases: string[],
  structuralPatterns: string[],
  toneDescriptor: string,
  avoidPatterns: string[]
}`,
  });

  const characteristics = result.output as VoiceCharacteristics;

  // Deactivate old profile
  await prisma.voiceProfile.updateMany({
    where: { isActive: true },
    data: { isActive: false },
  });

  const currentMax = await prisma.voiceProfile.aggregate({
    _max: { version: true },
  });

  const profile = await prisma.voiceProfile.create({
    data: {
      version: (currentMax._max.version || 0) + 1,
      isActive: true,
      characteristics: JSON.stringify(characteristics),
      sampleContent: JSON.stringify(sampleContent),
    },
  });

  return profile.id;
}

/**
 * Get the active voice profile characteristics for content generation.
 */
let cachedProfile: { data: VoiceCharacteristics; fetchedAt: number } | null = null;
const VOICE_CACHE_TTL = 10 * 60 * 1000; // 10 minutes

export async function getVoiceProfile(): Promise<VoiceCharacteristics | null> {
  if (cachedProfile && Date.now() - cachedProfile.fetchedAt < VOICE_CACHE_TTL) {
    return cachedProfile.data;
  }

  const profile = await prisma.voiceProfile.findFirst({
    where: { isActive: true },
    orderBy: { version: "desc" },
  });

  if (!profile) return null;

  const characteristics = safeParseJSON<VoiceCharacteristics>(profile.characteristics, {
    sentenceLength: { avg: 0, range: "" },
    vocabularyLevel: "",
    formalityLevel: 5,
    problemFraming: "",
    dataUsage: "",
    signaturePhrases: [],
    structuralPatterns: [],
    toneDescriptor: "",
    avoidPatterns: [],
  });
  cachedProfile = { data: characteristics, fetchedAt: Date.now() };
  return characteristics;
}

/**
 * Score how well a piece of content matches the voice profile.
 * Returns 0-1. Used to quality-gate content before publishing.
 */
export async function scoreVoiceMatch(content: string): Promise<{
  score: number;
  feedback: string;
}> {
  const profile = await getVoiceProfile();
  if (!profile) return { score: 0.7, feedback: "No voice profile configured" };

  const result = await runAIJob("lifecycle_manager", "score_voice", {
    content: content.substring(0, 5000),
    voiceProfile: profile,
    instructions: `Score how well this content matches the voice profile.

Voice profile summary: "${profile.toneDescriptor}"
Formality target: ${profile.formalityLevel}/10
Vocabulary: ${profile.vocabularyLevel}
Avoid: ${profile.avoidPatterns.join(", ")}

Score 0-1:
- 0.9-1.0: Reads exactly like the author wrote it
- 0.7-0.8: Close match with minor deviations
- 0.5-0.6: Recognizable but some off-voice elements
- Below 0.5: Doesn't sound like the author

If below 0.8, provide specific rewording suggestions.

Return JSON: { score: number, feedback: string }`,
  });

  return result.output as { score: number; feedback: string };
}

/**
 * Seed a basic voice profile if none exists.
 * Uses the signature config name to establish initial voice.
 */
export async function seedVoiceProfileIfEmpty(): Promise<void> {
  const count = await prisma.voiceProfile.count();
  if (count > 0) return;

  // Create a default profile for Chris Tabb / Nexus Ops
  await prisma.voiceProfile.create({
    data: {
      version: 1,
      isActive: true,
      characteristics: JSON.stringify({
        sentenceLength: { avg: 14, range: "6-25 words" },
        vocabularyLevel: "direct",
        formalityLevel: 4,
        problemFraming: "Lead with the specific problem and its cost. No preamble.",
        dataUsage: "moderate",
        signaturePhrases: [
          "Here's what that actually looks like",
          "The real problem isn't",
          "Most companies get this wrong",
        ],
        structuralPatterns: [
          "Short paragraphs (2-3 sentences max)",
          "One clear point per paragraph",
          "End with a specific next step, not a generic CTA",
        ],
        toneDescriptor: "Direct practitioner who leads with specifics and real examples, not theory or corporate speak",
        avoidPatterns: [
          "Corporate jargon (synergy, leverage, optimize)",
          "Hedging language (I think, maybe, perhaps)",
          "Generic marketing speak (game-changer, revolutionary)",
          "Emoji in professional content",
          "Exclamation marks",
        ],
      } satisfies VoiceCharacteristics),
      sampleContent: JSON.stringify(["[Initial seed — update with real writing samples via settings]"]),
    },
  });

  console.log("[voice] Seeded default voice profile");
}
