// Express is used as the small HTTP boundary: it parses browser form payloads,
// serves the static frontend, validates API input, and delegates persistence to
// the server-only Supabase client. Keeping these concerns here makes the public
// browser contract explicit while credentials and database writes stay private.
import "dotenv/config";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import { supabaseServer } from "./lib/supabase-server.js";
import { scoreSkillsWithGroq } from "./lib/groq.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const port = Number(process.env.PORT) || 3000;

// Requests flow through body parsing first, then static file serving, API routes,
// and finally the home page fallback for browser navigation.
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "../GraduRat")));

// Forms send either comma-separated strings or repeated checkbox values. Keeping
// this conversion at the API boundary gives the database one predictable shape.
const asArray = (value) => {
  if (Array.isArray(value))
    return value
      .map(String)
      .map((item) => item.trim())
      .filter(Boolean);
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
};

const errorResponse = (response, error, fallback = "Request failed") => {
  // PostgreSQL's unique-constraint code is translated to 409 so duplicate
  // registrations are distinguishable from malformed requests.
  // Supabase errors may include a statusCode, but other errors (like validation)
  const status = error?.statusCode || (error?.code === "23505" ? 409 : 400);
  response.status(status).json({ error: error?.message || fallback });
};

const normalizeSkills = (skills = []) => {
  // Skills are stored in lowercase, trimmed, and deduplicated to keep the
  const seen = new Set();
  const normalized = [];
  for (const skill of asArray(skills)) {
    const value = String(skill).trim().replace(/\s+/g, " ");
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push(value.toLowerCase());
  }
  return normalized;
};

const isValidEmail = (value) => {
  if (!value || !String(value).trim()) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value).trim());
};

const isValidUrl = (value) => {
  if (!value || !String(value).trim()) return false;
  try {
    const url = new URL(String(value).trim());
    return ["http:", "https:"].includes(url.protocol);
  } catch {
    return false;
  }
};

const parseOptionalInt = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
};

const parseOptionalDate = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const parseOptionalNumber = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Number(parsed.toFixed(2)) : null;
};

const parseBoolean = (value, fallback = false) => {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  return ["true", "1", "yes", "on"].includes(String(value).toLowerCase());
};

const coerceText = (value, fallback = null) => {
  if (value === null || value === undefined || value === "") return fallback;
  const output = String(value).trim();
  return output || fallback;
};

const computeProfileCompleteness = (profile, type = "student") => {
  // Profile completeness is a simple percentage of non-empty fields. 
  // This is not a perfect measure of quality, but it gives students and employers a sense of how much information they have provided.
  const fields = {
    student: [
      "full_name",
      "email",
      "skills",
      "location",
      "qualification",
      "graduation_year",
      "availability",
      "linkedin_url",
      "portfolio_url",
      "work_experience_summary",
      "certifications",
      "projects",
      "preferred_opportunity_type",
      "preferred_industry",
      "preferred_location",
      "remote_work_preference",
    ],
    employer: [
      "company_name",
      "email",
      "industry",
      "location",
      "contact_person_name",
      "contact_email",
      "contact_phone",
      "company_size",
      "company_description",
      "benefits",
      "website",
      "verification_status",
    ],
  };

  const candidateFields = fields[type] || [];
  const total = candidateFields.length;
  const populated = candidateFields.filter((field) => {
    const value = profile?.[field];
    if (Array.isArray(value)) return value.length > 0;
    return value !== null && value !== undefined && String(value).trim() !== "";
  }).length;
  return total === 0 ? 0 : Math.round((populated / total) * 100);
};

const buildStudentUpdate = (body = {}) => {
  const updates = {};
  const firstName = coerceText(body.firstName || body.first_name);
  const lastName = coerceText(body.lastName || body.last_name);
  if (firstName || lastName)
    updates.full_name = [firstName, lastName].filter(Boolean).join(" ").trim();

  if (body.email !== undefined) {
    const email = coerceText(body.email, null);
    if (!email || !isValidEmail(email)) {
      const error = new Error("Student email must be a valid email address.");
      error.statusCode = 422;
      throw error;
    }
    updates.email = email;
  }
  if (body.skills !== undefined) updates.skills = normalizeSkills(body.skills);
  if (body.bio !== undefined) updates.bio = coerceText(body.bio, null);
  if (body.location !== undefined)
    updates.location = coerceText(body.location, null);
  if (body.qualification !== undefined)
    updates.qualification = coerceText(body.qualification, null);
  if (body.graduationYear !== undefined || body.graduation !== undefined) {
    const graduationYear = parseOptionalInt(
      body.graduationYear ?? body.graduation,
    );
    if (
      graduationYear !== null &&
      (graduationYear < 1900 || graduationYear > 2100)
    ) {
      const error = new Error("Graduation year must be between 1900 and 2100.");
      error.statusCode = 422;
      throw error;
    }
    updates.graduation_year = graduationYear;
  }
  if (body.availability !== undefined)
    updates.availability = coerceText(body.availability, null);
  if (body.linkedinUrl !== undefined || body.linkedin_url !== undefined) {
    const url = coerceText(body.linkedinUrl ?? body.linkedin_url, null);
    if (url && !isValidUrl(url)) {
      const error = new Error(
        "LinkedIn URL must start with http:// or https://.",
      );
      error.statusCode = 422;
      throw error;
    }
    updates.linkedin_url = url;
  }
  if (body.portfolioUrl !== undefined || body.portfolio_url !== undefined) {
    const url = coerceText(body.portfolioUrl ?? body.portfolio_url, null);
    if (url && !isValidUrl(url)) {
      const error = new Error(
        "Portfolio URL must start with http:// or https://.",
      );
      error.statusCode = 422;
      throw error;
    }
    updates.portfolio_url = url;
  }
  if (
    body.workExperienceSummary !== undefined ||
    body.work_experience_summary !== undefined
  ) {
    updates.work_experience_summary = coerceText(
      body.workExperienceSummary ?? body.work_experience_summary,
      null,
    );
  }
  if (body.certifications !== undefined)
    updates.certifications = normalizeSkills(body.certifications);
  if (body.projects !== undefined)
    updates.projects = normalizeSkills(body.projects);
  if (
    body.preferredOpportunityType !== undefined ||
    body.preferred_opportunity_type !== undefined
  ) {
    updates.preferred_opportunity_type = coerceText(
      body.preferredOpportunityType ?? body.preferred_opportunity_type,
      null,
    );
  }
  if (
    body.preferredIndustry !== undefined ||
    body.preferred_industry !== undefined
  ) {
    updates.preferred_industry = coerceText(
      body.preferredIndustry ?? body.preferred_industry,
      null,
    );
  }
  if (
    body.preferredLocation !== undefined ||
    body.preferred_location !== undefined
  ) {
    updates.preferred_location = coerceText(
      body.preferredLocation ?? body.preferred_location,
      null,
    );
  }
  if (
    body.remoteWorkPreference !== undefined ||
    body.remote_work_preference !== undefined
  ) {
    const value = coerceText(
      body.remoteWorkPreference ?? body.remote_work_preference,
      null,
    );
    if (
      value &&
      !["remote", "hybrid", "onsite", "flexible"].includes(value.toLowerCase())
    ) {
      const error = new Error(
        "Remote work preference must be remote, hybrid, onsite, or flexible.",
      );
      error.statusCode = 422;
      throw error;
    }
    updates.remote_work_preference = value ? value.toLowerCase() : null;
  }
  if (Object.keys(updates).length === 0) {
    const error = new Error("No valid student profile fields were provided.");
    error.statusCode = 422;
    throw error;
  }
  updates.updated_at = new Date().toISOString();
  return updates;
};

const buildEmployerUpdate = (body = {}) => {
  const updates = {};
  const firstName = coerceText(body.firstName || body.first_name);
  const lastName = coerceText(body.lastName || body.last_name);
  if (firstName || lastName)
    updates.contact_person_name = [firstName, lastName]
      .filter(Boolean)
      .join(" ")
      .trim();

  if (body.companyName !== undefined || body.company_name !== undefined) {
    const companyName = coerceText(body.companyName ?? body.company_name, null);
    if (companyName) updates.company_name = companyName;
  }
  if (body.email !== undefined) {
    const email = coerceText(body.email, null);
    if (!email || !isValidEmail(email)) {
      const error = new Error("Employer email must be a valid email address.");
      error.statusCode = 422;
      throw error;
    }
    updates.email = email;
  }
  if (body.industry !== undefined)
    updates.industry = coerceText(body.industry, null);
  if (body.location !== undefined)
    updates.location = coerceText(body.location, null);
  if (body.contactEmail !== undefined || body.contact_email !== undefined) {
    const email = coerceText(body.contactEmail ?? body.contact_email, null);
    if (email && !isValidEmail(email)) {
      const error = new Error("Contact email must be a valid email address.");
      error.statusCode = 422;
      throw error;
    }
    updates.contact_email = email;
  }
  if (body.contactPhone !== undefined || body.contact_phone !== undefined)
    updates.contact_phone = coerceText(
      body.contactPhone ?? body.contact_phone,
      null,
    );
  if (body.companySize !== undefined || body.company_size !== undefined)
    updates.company_size = coerceText(
      body.companySize ?? body.company_size,
      null,
    );
  if (
    body.description !== undefined ||
    body.company_description !== undefined
  ) {
    updates.company_description = coerceText(
      body.description ?? body.company_description,
      null,
    );
    updates.bio = updates.company_description;
  }
  if (body.benefits !== undefined)
    updates.benefits = normalizeSkills(body.benefits);
  if (body.website !== undefined) {
    const website = coerceText(body.website, null);
    if (website && !isValidUrl(website)) {
      const error = new Error("Website must start with http:// or https://.");
      error.statusCode = 422;
      throw error;
    }
    updates.website = website;
  }
  if (
    body.verificationStatus !== undefined ||
    body.verification_status !== undefined
  ) {
    const value = coerceText(
      body.verificationStatus ?? body.verification_status,
      null,
    );
    if (
      value &&
      !["unverified", "pending", "verified", "rejected"].includes(
        value.toLowerCase(),
      )
    ) {
      const error = new Error(
        "Verification status must be unverified, pending, verified, or rejected.",
      );
      error.statusCode = 422;
      throw error;
    }
    updates.verification_status = value ? value.toLowerCase() : null;
  }
  if (
    body.verificationTimestamp !== undefined ||
    body.verification_timestamp !== undefined
  ) {
    const timestamp = parseOptionalDate(
      body.verificationTimestamp ?? body.verification_timestamp,
    );
    if (timestamp) updates.verification_timestamp = timestamp;
  }
  if (Object.keys(updates).length === 0) {
    const error = new Error("No valid employer profile fields were provided.");
    error.statusCode = 422;
    throw error;
  }
  updates.updated_at = new Date().toISOString();
  return updates;
};

const buildOpportunityUpdate = (body = {}) => {
  const updates = {};
  if (body.jobTitle !== undefined || body.title !== undefined) {
    const title = coerceText(body.jobTitle ?? body.title, null);
    if (title) updates.title = title;
  }
  if (body.description !== undefined)
    updates.description = coerceText(body.description, null);
  if (body.employer_id !== undefined) updates.employer_id = body.employer_id;
  if (
    body.requiredSkills !== undefined ||
    body.required_skills !== undefined ||
    body.skills !== undefined
  ) {
    updates.required_skills = normalizeSkills(
      body.requiredSkills ?? body.required_skills ?? body.skills,
    );
  }
  if (
    body.preferredSkills !== undefined ||
    body.preferred_skills !== undefined
  ) {
    updates.preferred_skills = normalizeSkills(
      body.preferredSkills ?? body.preferred_skills,
    );
  }
  if (
    body.type !== undefined ||
    body.jobType !== undefined ||
    body.opportunity_type !== undefined
  ) {
    updates.type = coerceText(
      body.type ?? body.jobType ?? body.opportunity_type,
      null,
    );
    updates.opportunity_type = updates.type;
  }
  if (body.location !== undefined)
    updates.location = coerceText(body.location, null);
  if (body.status !== undefined) {
    const status = coerceText(body.status, null);
    if (
      status &&
      !["draft", "published", "closed", "archived"].includes(
        status.toLowerCase(),
      )
    ) {
      const error = new Error(
        "Opportunity status must be draft, published, closed, or archived.",
      );
      error.statusCode = 422;
      throw error;
    }
    updates.status = status ? status.toLowerCase() : null;
  }
  if (
    body.applicationDeadline !== undefined ||
    body.application_deadline !== undefined
  ) {
    const deadline = parseOptionalDate(
      body.applicationDeadline ?? body.application_deadline,
    );
    if ((body.applicationDeadline ?? body.application_deadline) && !deadline) {
      const error = new Error("Application deadline must be a valid date.");
      error.statusCode = 422;
      throw error;
    }
    updates.application_deadline = deadline ? deadline.slice(0, 10) : null;
  }
  if (
    body.externalApplicationUrl !== undefined ||
    body.external_application_url !== undefined
  ) {
    const url = coerceText(
      body.externalApplicationUrl ?? body.external_application_url,
      null,
    );
    if (url && !isValidUrl(url)) {
      const error = new Error(
        "External application URL must start with http:// or https://.",
      );
      error.statusCode = 422;
      throw error;
    }
    updates.external_application_url = url;
  }
  if (
    body.workArrangement !== undefined ||
    body.work_arrangement !== undefined
  ) {
    const value = coerceText(
      body.workArrangement ?? body.work_arrangement,
      null,
    );
    if (
      value &&
      !["onsite", "hybrid", "remote", "flexible"].includes(value.toLowerCase())
    ) {
      const error = new Error(
        "Work arrangement must be onsite, hybrid, remote, or flexible.",
      );
      error.statusCode = 422;
      throw error;
    }
    updates.work_arrangement = value ? value.toLowerCase() : null;
  }
  if (body.duration !== undefined)
    updates.duration = coerceText(body.duration, null);
  if (body.salaryMin !== undefined || body.salary_min !== undefined) {
    const min = parseOptionalNumber(body.salaryMin ?? body.salary_min);
    if (min !== null && min < 0) {
      const error = new Error("Minimum salary cannot be negative.");
      error.statusCode = 422;
      throw error;
    }
    if ((body.salaryMin ?? body.salary_min) !== "" && min === null) {
      const error = new Error("Minimum salary must be a valid number.");
      error.statusCode = 422;
      throw error;
    }
    updates.salary_min = min;
  }
  if (body.salaryMax !== undefined || body.salary_max !== undefined) {
    const max = parseOptionalNumber(body.salaryMax ?? body.salary_max);
    if (max !== null && max < 0) {
      const error = new Error("Maximum salary cannot be negative.");
      error.statusCode = 422;
      throw error;
    }
    if ((body.salaryMax ?? body.salary_max) !== "" && max === null) {
      const error = new Error("Maximum salary must be a valid number.");
      error.statusCode = 422;
      throw error;
    }
    updates.salary_max = max;
  }
  if (
    updates.salary_min !== undefined &&
    updates.salary_max !== undefined &&
    updates.salary_min > updates.salary_max
  ) {
    const error = new Error(
      "Minimum salary must be less than or equal to maximum salary.",
    );
    error.statusCode = 422;
    throw error;
  }
  if (body.salaryCurrency !== undefined || body.salary_currency !== undefined) {
    const value = coerceText(body.salaryCurrency ?? body.salary_currency, null);
    if (value && !/^[A-Z]{3}$/.test(value.toUpperCase())) {
      const error = new Error(
        "Salary currency must be a three-letter ISO code.",
      );
      error.statusCode = 422;
      throw error;
    }
    updates.salary_currency = value ? value.toUpperCase() : null;
  }
  if (body.industry !== undefined)
    updates.industry = coerceText(body.industry, null);
  if (body.vacancies !== undefined) {
    const vacancies = parseOptionalInt(body.vacancies);
    if (vacancies !== null && vacancies <= 0) {
      const error = new Error("Vacancies must be greater than zero.");
      error.statusCode = 422;
      throw error;
    }
    updates.vacancies = vacancies;
  }
  if (body.contactEmail !== undefined || body.contact_email !== undefined) {
    const email = coerceText(body.contactEmail ?? body.contact_email, null);
    if (email && !isValidEmail(email)) {
      const error = new Error(
        "Opportunity contact email must be a valid email address.",
      );
      error.statusCode = 422;
      throw error;
    }
    updates.contact_email = email;
  }
  if (body.closingReason !== undefined || body.closing_reason !== undefined)
    updates.closing_reason = coerceText(
      body.closingReason ?? body.closing_reason,
      null,
    );
  if (body.featured !== undefined)
    updates.featured = parseBoolean(body.featured);
  if (body.publishedAt !== undefined || body.published_at !== undefined) {
    const publishedAt = parseOptionalDate(
      body.publishedAt ?? body.published_at,
    );
    if ((body.publishedAt ?? body.published_at) && !publishedAt) {
      const error = new Error("Published date must be valid.");
      error.statusCode = 422;
      throw error;
    }
    updates.published_at = publishedAt;
  }
  if (Object.keys(updates).length === 0) {
    const error = new Error("No valid opportunity fields were provided.");
    error.statusCode = 422;
    throw error;
  }
  updates.updated_at = new Date().toISOString();
  return updates;
};

const getMatch = async (student, opportunity) => {
  const studentSkills = normalizeSkills(student.skills || []);
  const requiredSkills = normalizeSkills(
    opportunity.required_skills || opportunity.preferred_skills || [],
  );
  const groqMatch = await scoreSkillsWithGroq(studentSkills, requiredSkills);
  const skillLookup = new Set(studentSkills);
  const matchingSkills = requiredSkills.filter((skill) =>
    skillLookup.has(skill),
  );
  const missingSkills = requiredSkills.filter(
    (skill) => !skillLookup.has(skill),
  );

  const { error } = await supabaseServer.from("matches").upsert(
    {
      student_id: student.id,
      opportunity_id: opportunity.id,
      match_score: groqMatch.match_score,
      reasoning: groqMatch.reasoning,
    },
    { onConflict: "student_id,opportunity_id" },
  );
  if (error) throw error;

  return {
    ...opportunity,
    ...groqMatch,
    matching_skills: matchingSkills,
    matched_skills: matchingSkills,
    missing_skills: missingSkills,
    reasoning:
      `${groqMatch.reasoning}${matchingSkills.length ? ` Matched skills: ${matchingSkills.join(", ")}.` : ""}${missingSkills.length ? ` Missing skills: ${missingSkills.join(", ")}.` : ""}`.trim(),
  };
};

const getStudent = async (studentId) => {
  // Profile lookups stay on the server because this client uses the protected
  // service key and the browser must never receive that credential.
  const { data, error } = await supabaseServer
    .from("students")
    .select("*")
    .eq("id", studentId)
    .single();
  if (error) throw error;
  return data;
};

const getEmployer = async (employerId) => {
  const { data, error } = await supabaseServer
    .from("employers")
    .select("*")
    .eq("id", employerId)
    .single();
  if (error) throw error;
  return data;
};

const isPublicOpportunity = (opportunity) => {
  if (
    !opportunity ||
    opportunity.archived_at ||
    opportunity.status !== "published"
  )
    return false;
  if (!opportunity.application_deadline) return true;
  const deadline = new Date(
    `${opportunity.application_deadline}T23:59:59.999Z`,
  );
  return Number.isNaN(deadline.getTime()) || deadline >= new Date();
};

app.get("/api/health", async (_request, response) => {
  // A lightweight table query verifies both Supabase credentials and schema
  // availability without transferring application data.
  const { error } = await supabaseServer
    .from("students")
    .select("id", { head: true, count: "exact" });
  if (error)
    return response
      .status(503)
      .json({ status: "error", database: error.message });
  response.json({ status: "ok", database: "connected" });
});

app.get("/api/students/:studentId", async (request, response) => {
  try {
    const student = await getStudent(request.params.studentId);
    response.json({
      student,
      profile_completeness: computeProfileCompleteness(student, "student"),
    });
  } catch (error) {
    errorResponse(response, error, "Could not load student profile");
  }
});

app.patch("/api/students/:studentId", async (request, response) => {
  try {
    const updates = buildStudentUpdate(request.body || {});
    const { data, error } = await supabaseServer
      .from("students")
      .update(updates)
      .eq("id", request.params.studentId)
      .select()
      .single();
    if (error) throw error;
    response.json({
      student: data,
      profile_completeness: computeProfileCompleteness(data, "student"),
    });
  } catch (error) {
    errorResponse(response, error, "Could not update student profile");
  }
});

app.get("/api/employers/:employerId", async (request, response) => {
  try {
    const employer = await getEmployer(request.params.employerId);
    response.json({
      employer,
      profile_completeness: computeProfileCompleteness(employer, "employer"),
    });
  } catch (error) {
    errorResponse(response, error, "Could not load employer profile");
  }
});

app.patch("/api/employers/:employerId", async (request, response) => {
  try {
    const updates = buildEmployerUpdate(request.body || {});
    const { data, error } = await supabaseServer
      .from("employers")
      .update(updates)
      .eq("id", request.params.employerId)
      .select()
      .single();
    if (error) throw error;
    response.json({
      employer: data,
      profile_completeness: computeProfileCompleteness(data, "employer"),
    });
  } catch (error) {
    errorResponse(response, error, "Could not update employer profile");
  }
});

app.post("/api/students", async (request, response) => {
  const body = request.body;
  if (
    !body.email ||
    !body.firstName ||
    !body.lastName ||
    !body.qualification ||
    !body.institution ||
    !body.field
  ) {
    return response.status(422).json({
      error:
        "First name, last name, email, qualification, institution and field are required.",
    });
  }
  const email = coerceText(body.email, null);
  const graduationYear = parseOptionalInt(body.graduation);
  const linkedinUrl = coerceText(body.linkedinUrl ?? body.linkedin_url, null);
  const portfolioUrl = coerceText(
    body.portfolioUrl ?? body.portfolio_url,
    null,
  );
  if (!isValidEmail(email)) {
    return response
      .status(422)
      .json({ error: "Student email must be a valid email address." });
  }
  if (
    graduationYear !== null &&
    (graduationYear < 1900 || graduationYear > 2100)
  ) {
    return response
      .status(422)
      .json({ error: "Graduation year must be between 1900 and 2100." });
  }
  if (
    (linkedinUrl && !isValidUrl(linkedinUrl)) ||
    (portfolioUrl && !isValidUrl(portfolioUrl))
  ) {
    return response
      .status(422)
      .json({ error: "Profile URLs must start with http:// or https://." });
  }

  const bio = [
    // The current schema has one free-text bio field, so form metadata is kept
    // as labeled lines until dedicated profile columns are introduced.
    body.experience && `Experience: ${body.experience}`,
    body.projects && `Projects: ${body.projects}`,
    body.phone && `Phone: ${body.phone}`,
    body.location && `Location: ${body.location}`,
    body.jobType && `Preferred job type: ${body.jobType}`,
    body.level && `Career level: ${body.level}`,
    body.industry && `Preferred industry: ${body.industry}`,
    body.qualification && `Qualification: ${body.qualification}`,
    body.institution && `Institution: ${body.institution}`,
    body.field && `Field of study: ${body.field}`,
    body.graduation && `Graduation year: ${body.graduation}`,
    body.availability && `Availability: ${body.availability}`,
    body.language && `Language: ${body.language}`,
    asArray(body.preferences).length &&
      `Preferences: ${asArray(body.preferences).join(", ")}`,
  ]
    .filter(Boolean)
    .join("\n");

  const { data, error } = await supabaseServer
    .from("students")
    .insert({
      full_name:
        `${String(body.firstName).trim()} ${String(body.lastName).trim()}`.trim(),
      email: email.toLowerCase(),
      skills: normalizeSkills(body.skills),
      bio: bio || null,
      location: coerceText(body.location, null),
      qualification: coerceText(body.qualification, null),
      graduation_year: graduationYear,
      availability: coerceText(body.availability, null),
      linkedin_url: linkedinUrl,
      portfolio_url: portfolioUrl,
      work_experience_summary: coerceText(body.experience, null),
      certifications: normalizeSkills(body.certifications),
      projects: normalizeSkills(body.projects),
      preferred_opportunity_type: coerceText(
        body.jobType ?? body.preferredOpportunityType,
        null,
      ),
      preferred_industry: coerceText(
        body.industry ?? body.preferredIndustry,
        null,
      ),
      preferred_location: coerceText(
        body.location ?? body.preferredLocation,
        null,
      ),
      remote_work_preference: coerceText(
        body.remoteWorkPreference ??
          body.remote_work_preference ??
          body.workMode,
        null,
      ),
    })
    .select()
    .single();

  if (error)
    return errorResponse(response, error, "Could not create graduate profile");
  response.status(201).json({
    student: data,
    profile_completeness: computeProfileCompleteness(data, "student"),
  });
});

app.post("/api/employers", async (request, response) => {
  const body = request.body;
  if (!body.email || !body.companyName || !body.firstName || !body.lastName) {
    return response
      .status(422)
      .json({ error: "Company name, contact name and email are required." });
  }
  const email = coerceText(body.email, null);
  const website = coerceText(body.website, null);
  const contactEmail = coerceText(body.contactEmail ?? body.email, null);
  if (!isValidEmail(email) || !isValidEmail(contactEmail)) {
    return response.status(422).json({
      error: "Employer and contact email must be valid email addresses.",
    });
  }
  if (website && !isValidUrl(website)) {
    return response
      .status(422)
      .json({ error: "Website must start with http:// or https://." });
  }

  const bio = [
    // Employer-specific form fields use the same compatibility approach as
    // student metadata because the initial schema is intentionally compact.
    body.description,
    body.industry && `Industry: ${body.industry}`,
    body.companySize && `Company size: ${body.companySize}`,
    `Contact: ${body.firstName.trim()} ${body.lastName.trim()}`,
    body.position && `Position: ${body.position}`,
    body.phone && `Phone: ${body.phone}`,
    body.location && `Location: ${body.location}`,
    body.talentLevel && `Candidate level: ${body.talentLevel}`,
    body.jobType && `Typical job type: ${body.jobType}`,
    body.skills && `Common skills: ${asArray(body.skills).join(", ")}`,
  ]
    .filter(Boolean)
    .join("\n");

  const { data, error } = await supabaseServer
    .from("employers")
    .insert({
      company_name: String(body.companyName).trim(),
      email: email.toLowerCase(),
      website,
      bio: bio || null,
      industry: coerceText(body.industry, null),
      location: coerceText(body.location, null),
      contact_person_name:
        `${String(body.firstName).trim()} ${String(body.lastName).trim()}`.trim(),
      contact_email: contactEmail,
      contact_phone: coerceText(body.phone, null),
      company_size: coerceText(body.companySize, null),
      company_description: coerceText(body.description, null),
      benefits: normalizeSkills(body.benefits),
      verification_status: "unverified",
    })
    .select()
    .single();

  if (error)
    return errorResponse(response, error, "Could not create employer profile");
  response.status(201).json({
    employer: data,
    profile_completeness: computeProfileCompleteness(data, "employer"),
  });
});

app.get("/api/opportunities", async (request, response) => {
  try {
    const { data, error } = await supabaseServer
      .from("opportunities")
      .select("*, employers(company_name, website)")
      .order("created_at", { ascending: false });
    if (error) throw error;

    const keyword = String(request.query.keyword || "")
      .trim()
      .toLowerCase();
    const skills = normalizeSkills(
      request.query.skills || request.query.skill || "",
    );
    const location = coerceText(request.query.location, null);
    const industry = coerceText(request.query.industry, null);
    const opportunityType = coerceText(
      request.query.type ?? request.query.opportunityType,
      null,
    );
    const workArrangement = coerceText(
      request.query.workArrangement ?? request.query.work_arrangement,
      null,
    );
    const deadline = coerceText(request.query.deadline, null);
    const requestedPage = Number(request.query.page || 1);
    const requestedLimit = Number(request.query.limit || 20);
    const page = Number.isInteger(requestedPage)
      ? Math.max(1, requestedPage)
      : 1;
    const limit = Number.isInteger(requestedLimit)
      ? Math.max(1, Math.min(100, requestedLimit))
      : 20;
    const sort = String(request.query.sort || "updated_at").toLowerCase();

    let filtered = data.filter((opportunity) => {
      if (!isPublicOpportunity(opportunity)) return false;
      if (keyword) {
        const haystack = [
          opportunity.title,
          opportunity.description,
          opportunity.location,
          opportunity.type,
          opportunity.industry,
          opportunity.opportunity_type,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(keyword)) return false;
      }
      if (skills.length) {
        const values = normalizeSkills(
          opportunity.required_skills || opportunity.preferred_skills || [],
        );
        const hasMatch = skills.some((skill) => values.includes(skill));
        if (!hasMatch) return false;
      }
      if (
        location &&
        String(opportunity.location || "").toLowerCase() !==
          String(location).toLowerCase()
      )
        return false;
      if (
        industry &&
        String(opportunity.industry || "").toLowerCase() !==
          String(industry).toLowerCase()
      )
        return false;
      if (
        opportunityType &&
        String(
          opportunity.opportunity_type || opportunity.type || "",
        ).toLowerCase() !== String(opportunityType).toLowerCase()
      )
        return false;
      if (
        workArrangement &&
        String(opportunity.work_arrangement || "").toLowerCase() !==
          String(workArrangement).toLowerCase()
      )
        return false;
      if (
        deadline &&
        opportunity.application_deadline &&
        opportunity.application_deadline > deadline
      )
        return false;
      return true;
    });

    filtered.sort((left, right) => {
      const leftValue = left[sort] ?? left.created_at ?? "";
      const rightValue = right[sort] ?? right.created_at ?? "";
      if (sort === "match_score")
        return Number(right.match_score || 0) - Number(left.match_score || 0);
      return String(rightValue).localeCompare(String(leftValue));
    });

    const start = (page - 1) * limit;
    const results = filtered.slice(start, start + limit);

    response.json({
      opportunities: results,
      pagination: {
        page,
        limit,
        total: filtered.length,
        pages: Math.max(1, Math.ceil(filtered.length / limit)),
      },
    });
  } catch (error) {
    errorResponse(response, error, "Could not load opportunities");
  }
});

app.get("/api/opportunities/:opportunityId", async (request, response) => {
  try {
    const { data, error } = await supabaseServer
      .from("opportunities")
      .select("*, employers(company_name, website)")
      .eq("id", request.params.opportunityId)
      .single();
    if (error) throw error;
    if (!isPublicOpportunity(data)) {
      return response.status(404).json({ error: "Opportunity not found." });
    }
    response.json({ opportunity: data });
  } catch (error) {
    errorResponse(response, error, "Could not load opportunity");
  }
});

app.patch("/api/opportunities/:opportunityId", async (request, response) => {
  try {
    const updates = buildOpportunityUpdate(request.body || {});
    const { data, error } = await supabaseServer
      .from("opportunities")
      .update(updates)
      .eq("id", request.params.opportunityId)
      .select()
      .single();
    if (error) throw error;
    response.json({ opportunity: data });
  } catch (error) {
    errorResponse(response, error, "Could not update opportunity");
  }
});

app.post(
  "/api/opportunities/:opportunityId/close",
  async (request, response) => {
    try {
      const { data, error } = await supabaseServer
        .from("opportunities")
        .update({
          status: "closed",
          closing_reason: coerceText(
            request.body?.closingReason ?? request.body?.closing_reason,
            "Closed by employer.",
          ),
          updated_at: new Date().toISOString(),
        })
        .eq("id", request.params.opportunityId)
        .select()
        .single();
      if (error) throw error;
      response.json({ opportunity: data, status: "closed" });
    } catch (error) {
      errorResponse(response, error, "Could not close opportunity");
    }
  },
);

app.post(
  "/api/opportunities/:opportunityId/archive",
  async (request, response) => {
    try {
      const { data, error } = await supabaseServer
        .from("opportunities")
        .update({
          status: "archived",
          archived_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", request.params.opportunityId)
        .select()
        .single();
      if (error) throw error;
      response.json({ opportunity: data, status: "archived" });
    } catch (error) {
      errorResponse(response, error, "Could not archive opportunity");
    }
  },
);

app.post(
  "/api/opportunities/:opportunityId/reopen",
  async (request, response) => {
    try {
      const { data: current, error: lookupError } = await supabaseServer
        .from("opportunities")
        .select("application_deadline")
        .eq("id", request.params.opportunityId)
        .single();
      if (lookupError) throw lookupError;
      if (
        current.application_deadline &&
        !isPublicOpportunity({
          ...current,
          status: "published",
          archived_at: null,
        })
      ) {
        return response
          .status(422)
          .json({ error: "Expired opportunities cannot be reopened." });
      }
      const { data, error } = await supabaseServer
        .from("opportunities")
        .update({
          archived_at: null,
          status: "published",
          updated_at: new Date().toISOString(),
        })
        .eq("id", request.params.opportunityId)
        .select()
        .single();
      if (error) throw error;
      response.json({ opportunity: data, status: "published" });
    } catch (error) {
      errorResponse(response, error, "Could not reopen opportunity");
    }
  },
);

app.post("/api/matches/refresh", async (request, response) => {
  try {
    const studentId = request.body?.student_id || request.body?.studentId;
    const opportunityId =
      request.body?.opportunity_id || request.body?.opportunityId;
    if (!studentId || !opportunityId) {
      return response.status(422).json({
        error:
          "student_id and opportunity_id are required for a manual score refresh.",
      });
    }

    const [student, opportunityResponse] = await Promise.all([
      getStudent(studentId),
      supabaseServer
        .from("opportunities")
        .select("*, employers(company_name, website)")
        .eq("id", opportunityId)
        .single(),
    ]);
    if (opportunityResponse.error) throw opportunityResponse.error;

    const match = await getMatch(student, opportunityResponse.data);
    response.json({ match });
  } catch (error) {
    errorResponse(response, error, "Could not refresh match score");
  }
});

app.get("/api/students/:studentId/dashboard", async (request, response) => {
  try {
    // Load the profile and public opportunities concurrently; neither query
    // depends on the other, which reduces dashboard response time.
    const [student, opportunitiesResponse] = await Promise.all([
      getStudent(request.params.studentId),
      supabaseServer
        .from("opportunities")
        .select("*, employers(company_name, website)")
        .order("created_at", { ascending: false }),
    ]);
    if (opportunitiesResponse.error) throw opportunitiesResponse.error;

    // Groq is called for each student/opportunity pair, then the completed
    // scores are sorted before they are returned to the browser.
    const opportunities = (
      await Promise.all(
        opportunitiesResponse.data
          .filter(isPublicOpportunity)
          .map((opportunity) => getMatch(student, opportunity)),
      )
    ).sort((left, right) => right.match_score - left.match_score);

    response.json({
      student,
      opportunities,
      stats: {
        matches: opportunities.filter(
          (opportunity) => opportunity.match_score >= 50,
        ).length,
        opportunities: opportunities.length,
      },
    });
  } catch (error) {
    errorResponse(response, error, "Could not load graduate dashboard");
  }
});

app.get("/api/employers/:employerId/dashboard", async (request, response) => {
  try {
    // Employer dashboards only use that employer's jobs, while candidate
    // profiles are compared against those jobs to produce ranked matches.
    const [employer, opportunitiesResponse, studentsResponse] =
      await Promise.all([
        getEmployer(request.params.employerId),
        supabaseServer
          .from("opportunities")
          .select("*")
          .eq("employer_id", request.params.employerId)
          .order("created_at", { ascending: false }),
        supabaseServer.from("students").select("*"),
      ]);
    if (opportunitiesResponse.error) throw opportunitiesResponse.error;
    if (studentsResponse.error) throw studentsResponse.error;

    const dashboardOpportunities =
      opportunitiesResponse.data.filter(isPublicOpportunity);
    const candidates = (
      await Promise.all(
        studentsResponse.data.map(async (student) => {
          const matches = dashboardOpportunities.map((opportunity) =>
            getMatch(student, opportunity),
          );
          const resolvedMatches = await Promise.all(matches);
          const bestMatch = resolvedMatches.sort(
            (left, right) => right.match_score - left.match_score,
          )[0];
          return {
            ...student,
            match_score: bestMatch?.match_score || 0,
            matching_skills: bestMatch?.matching_skills || [],
            missing_skills: bestMatch?.missing_skills || [],
            reasoning: bestMatch?.reasoning || "",
          };
        }),
      )
    ).sort((left, right) => right.match_score - left.match_score);

    response.json({
      employer,
      opportunities: opportunitiesResponse.data,
      candidates,
      stats: {
        active_jobs: opportunitiesResponse.data.length,
        candidates: candidates.filter(
          (candidate) => candidate.match_score >= 50,
        ).length,
      },
    });
  } catch (error) {
    errorResponse(response, error, "Could not load employer dashboard");
  }
});

app.post("/api/opportunities", async (request, response) => {
  const body = request.body || {};
  if (!body.jobTitle && !body.title) {
    return response.status(422).json({ error: "Job title is required." });
  }
  if (!body.description) {
    return response
      .status(422)
      .json({ error: "Opportunity description is required." });
  }
  if (!body.employer_id) {
    return response.status(422).json({
      error: "An employer profile is required to publish an opportunity.",
    });
  }

  const applicationUrl = coerceText(
    body.externalApplicationUrl ?? body.external_application_url,
    null,
  );
  if (applicationUrl && !isValidUrl(applicationUrl)) {
    return response.status(422).json({
      error: "External application URL must start with http:// or https://.",
    });
  }

  const salaryMin = body.salaryMin ?? body.salary_min;
  const salaryMax = body.salaryMax ?? body.salary_max;
  const parsedSalaryMin = parseOptionalNumber(salaryMin);
  const parsedSalaryMax = parseOptionalNumber(salaryMax);
  if (
    (salaryMin !== undefined &&
      salaryMin !== null &&
      salaryMin !== "" &&
      parsedSalaryMin === null) ||
    (salaryMax !== undefined &&
      salaryMax !== null &&
      salaryMax !== "" &&
      parsedSalaryMax === null)
  ) {
    return response
      .status(422)
      .json({ error: "Salary values must be valid numbers." });
  }
  if (
    (parsedSalaryMin !== null && parsedSalaryMin < 0) ||
    (parsedSalaryMax !== null && parsedSalaryMax < 0)
  ) {
    return response
      .status(422)
      .json({ error: "Salary values cannot be negative." });
  }
  if (
    parsedSalaryMin !== null &&
    parsedSalaryMax !== null &&
    parsedSalaryMin > parsedSalaryMax
  ) {
    return response.status(422).json({
      error: "Minimum salary must be less than or equal to maximum salary.",
    });
  }

  const status = coerceText(body.status, "draft");
  if (
    status &&
    !["draft", "published", "closed", "archived"].includes(status.toLowerCase())
  ) {
    return response.status(422).json({
      error:
        "Opportunity status must be draft, published, closed, or archived.",
    });
  }
  const applicationDeadline = parseOptionalDate(
    body.deadline ?? body.applicationDeadline ?? body.application_deadline,
  );
  if (
    (body.deadline ?? body.applicationDeadline ?? body.application_deadline) &&
    !applicationDeadline
  ) {
    return response
      .status(422)
      .json({ error: "Application deadline must be a valid date." });
  }
  const contactEmail = coerceText(
    body.applicationEmail ?? body.contact_email,
    null,
  );
  if (contactEmail && !isValidEmail(contactEmail)) {
    return response.status(422).json({
      error: "Opportunity contact email must be a valid email address.",
    });
  }
  const workArrangement =
    coerceText(body.workMode ?? body.work_arrangement, null)?.toLowerCase() ||
    null;
  if (
    workArrangement &&
    !["onsite", "hybrid", "remote", "flexible"].includes(workArrangement)
  ) {
    return response.status(422).json({
      error: "Work arrangement must be onsite, hybrid, remote, or flexible.",
    });
  }
  const publishedAt = body.publishedAt
    ? parseOptionalDate(body.publishedAt)
    : null;
  if (body.publishedAt && !publishedAt) {
    return response
      .status(422)
      .json({ error: "Published date must be valid." });
  }

  const description = [
    body.description,
    body.responsibilities && `Responsibilities: ${body.responsibilities}`,
    body.department && `Department: ${body.department}`,
    body.location && `Location: ${body.location}`,
    body.workMode && `Work arrangement: ${body.workMode}`,
    body.industry && `Industry: ${body.industry}`,
    body.level && `Experience level: ${body.level}`,
    body.qualifications && `Qualifications: ${body.qualifications}`,
    body.experience && `Experience: ${body.experience}`,
    body.education && `Education: ${body.education}`,
    body.availability && `Availability: ${body.availability}`,
    body.language && `Language: ${body.language}`,
    asArray(body.preferences).length &&
      `Preferences: ${asArray(body.preferences).join(", ")}`,
    body.salary && `Salary: ${body.salary} ${body.salaryPeriod || ""}`.trim(),
    body.deadline && `Deadline: ${body.deadline}`,
    body.applicationEmail && `Apply at: ${body.applicationEmail}`,
  ]
    .filter(Boolean)
    .join("\n");

  const payload = {
    title: String(body.jobTitle ?? body.title).trim(),
    employer_id: body.employer_id,
    description,
    required_skills: normalizeSkills(
      body.required_skills ?? body.skills ?? body.requiredSkills,
    ),
    preferred_skills: normalizeSkills(
      body.preferred_skills ?? body.preferredSkills,
    ),
    type: coerceText(body.jobType ?? body.type ?? body.opportunity_type, null),
    opportunity_type: coerceText(
      body.jobType ?? body.type ?? body.opportunity_type,
      null,
    ),
    status: status.toLowerCase(),
    location: coerceText(body.location, null),
    industry: coerceText(body.industry, null),
    work_arrangement: workArrangement,
    qualification_requirement: coerceText(body.qualifications, null),
    duration: coerceText(body.duration, null),
    salary_min: parsedSalaryMin,
    salary_max: parsedSalaryMax,
    salary_currency:
      coerceText(
        body.salaryCurrency ?? body.salary_currency,
        null,
      )?.toUpperCase() || null,
    vacancies: parseOptionalInt(body.vacancies),
    contact_email: contactEmail,
    external_application_url: applicationUrl,
    application_deadline: applicationDeadline
      ? applicationDeadline.slice(0, 10)
      : null,
    featured: parseBoolean(body.featured),
    published_at: publishedAt,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabaseServer
    .from("opportunities")
    .insert(payload)
    .select()
    .single();
  if (error) return errorResponse(response, error, "Could not publish job");
  response.status(201).json({
    opportunity: data,
    profile_completeness: computeProfileCompleteness(data, "employer"),
  });
});

app.use((_request, response) =>
  // Unknown browser paths return the landing page; API paths are declared above
  // and therefore never get mistaken for frontend navigation.
  response.sendFile(path.join(__dirname, "../GraduRat/home.html")),
);

app.listen(port, () =>
  console.log(`GraduRat running at http://localhost:${port}`),
);
