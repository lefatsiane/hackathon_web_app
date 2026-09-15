// This adapter isolates the external Groq LLM call from the rest of the app.
// The API is used for semantic skill matching; strict JSON validation keeps the
// model response compatible with the deterministic dashboard response shape.
import "dotenv/config";

const groqApiUrl = "https://api.groq.com/openai/v1/chat/completions";
const groqModel = process.env.GROQ_MODEL || "openai/gpt-oss-20b";

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

const asList = (value) =>
  Array.isArray(value)
    ? value
        .map((item) => String(item).trim())
        .filter(Boolean)
        .slice(0, 40)
    : [];

const asText = (value, limit = 1200) =>
  String(value || "")
    .trim()
    .slice(0, limit);

export const assessFitWithGroq = async ({
  subjectType,
  subject,
  targetType,
  target,
}) => {
  if (!process.env.GROQ_API_KEY) {
    const error = new Error(
      "Missing GROQ_API_KEY. Add a server-only Groq API key to main/.env.",
    );
    error.statusCode = 503;
    throw error;
  }

  const input = JSON.stringify({
    subject_type: asText(subjectType, 40),
    subject: {
      name: asText(subject?.name, 160),
      qualification: asText(subject?.qualification, 240),
      industry: asText(subject?.industry, 160),
      location: asText(subject?.location, 160),
      skills: asList(subject?.skills),
      experience: asText(subject?.experience),
      goals: asText(subject?.goals),
      description: asText(subject?.description),
    },
    target_type: asText(targetType, 40),
    target: target
      ? {
          name: asText(target.name, 160),
          title: asText(target.title, 160),
          qualification: asText(target.qualification, 240),
          industry: asText(target.industry, 160),
          location: asText(target.location, 160),
          skills: asList(target.skills),
          experience: asText(target.experience),
          description: asText(target.description),
        }
      : null,
  });

  const response = await fetch(groqApiUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: groqModel,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You are GraduRat's employability coach. Assess the subject's readiness and fit for the target when one is supplied. Return only JSON with fit_score (integer 0 to 100), summary (one concise sentence), strengths (array of up to 3 concise strings), gaps (array of up to 3 concise strings), and next_steps (array of up to 3 actionable strings). Be specific, constructive, and never invent credentials or experience.",
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

  const assessment = parseJsonObject(
    result.choices?.[0]?.message?.content || "",
  );
  const fitScore = Number(assessment.fit_score);
  const summary = asText(assessment.summary, 320);
  if (
    !Number.isInteger(fitScore) ||
    fitScore < 0 ||
    fitScore > 100 ||
    !summary
  ) {
    throw new Error("Groq returned an invalid profile assessment.");
  }

  return {
    fit_score: fitScore,
    summary,
    strengths: asList(assessment.strengths).slice(0, 3),
    gaps: asList(assessment.gaps).slice(0, 3),
    next_steps: asList(assessment.next_steps).slice(0, 3),
  };
};
