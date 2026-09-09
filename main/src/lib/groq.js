// This adapter isolates the external Groq LLM call from the rest of the app.
// The API is used for semantic skill matching; strict JSON validation keeps the
// model response compatible with the deterministic dashboard response shape.
import "dotenv/config";

const groqApiUrl = "https://api.groq.com/openai/v1/chat/completions";
const groqModel = process.env.GROQ_MODEL || "llama-3.1-8b-instant";

const parseJsonObject = (content) => {
  try {
    return JSON.parse(content);
  } catch {
    throw new Error("Groq returned invalid JSON for the skill match.");
  }
};

export const scoreSkillsWithGroq = async (studentSkills, requiredSkills) => {
  if (!process.env.GROQ_API_KEY) {
    const error = new Error(
      "Missing GROQ_API_KEY. Add a server-only Groq API key to main/.env.",
    );
    error.statusCode = 503;
    throw error;
  }

  // Only these two arrays enter the model. Profiles, resumes, and conversation
  // history stay outside this narrowly scoped matching operation.
  const input = JSON.stringify({
    student_skills: studentSkills,
    required_skills: requiredSkills,
  });
  const response = await fetch(groqApiUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: groqModel,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You score job skill fit. Return only a JSON object with match_score (integer 0 to 100) and reasoning (one short human-readable sentence). Consider semantic relationships between skills, not only exact spelling. Do not use any information beyond the two supplied arrays.",
        },
        { role: "user", content: input },
      ],
    }),
  });

  const result = await response.json();
  if (!response.ok) {
    const error = new Error(
      result.error?.message ||
        `Groq request failed with status ${response.status}.`,
    );
    error.statusCode = 503;
    throw error;
  }

  const content = result.choices?.[0]?.message?.content;
  const match = parseJsonObject(content || "");
  const score = Number(match.match_score);
  const reasoning = String(match.reasoning || "").trim();
  if (!Number.isInteger(score) || score < 0 || score > 100 || !reasoning) {
    throw new Error("Groq returned an invalid skill match.");
  }

  return { match_score: score, reasoning };
};
