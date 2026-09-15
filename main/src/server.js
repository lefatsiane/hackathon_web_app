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
import {
  assessFitWithGroq,
  createConnectionAdviceWithGroq,
  createPeerConnectionAdviceWithGroq,
  scoreSkillsWithGroq,
} from "./lib/groq.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const port = Number(process.env.PORT) || 3000;

// Requests flow through body parsing first, then static file serving, API routes,
// and finally the home page fallback for browser navigation.
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "../GraduRat")));

const publicSupabaseKey =
  process.env.SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const avatarBucket = "avatars";
const avatarUrlExpiresIn = 60 * 60;
const avatarExtensions = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
const cvBucket = "cvs";
const cvUrlExpiresIn = 60 * 60;
const cvExtensions = {
  "application/pdf": "pdf",
};

const requireAuth = async (request, response, next) => {
  const authorization = request.headers.authorization || "";
  const token = authorization.startsWith("Bearer ")
    ? authorization.slice(7).trim()
    : null;
  if (!token)
    return response.status(401).json({ error: "Authentication required." });

  const { data, error } = await supabaseServer.auth.getUser(token);
  if (error || !data.user)
    return response.status(401).json({ error: "Invalid or expired session." });

  request.authUser = data.user;
  next();
};

app.get("/api/config", (_request, response) => {
  if (!publicSupabaseKey || publicSupabaseKey.startsWith("sb_secret_")) {
    return response
      .status(503)
      .json({ error: "Supabase publishable key is not configured." });
  }
  response.json({
    supabaseUrl: (process.env.SUPABASE_URL || "").replace(/\/rest\/v1\/?$/, ""),
    supabasePublishableKey: publicSupabaseKey,
  });
});

app.get("/api/me", requireAuth, async (request, response) => {
  const [studentResult, employerResult] = await Promise.all([
    supabaseServer
      .from("students")
      .select("id, full_name, email")
      .eq("auth_user_id", request.authUser.id)
      .maybeSingle(),
    supabaseServer
      .from("employers")
      .select("id, company_name, email")
      .eq("auth_user_id", request.authUser.id)
      .maybeSingle(),
  ]);
  if (studentResult.error)
    return errorResponse(
      response,
      studentResult.error,
      "Could not load account",
    );
  if (employerResult.error)
    return errorResponse(
      response,
      employerResult.error,
      "Could not load account",
    );
  response.json({
    user: request.authUser,
    student: studentResult.data,
    employer: employerResult.data,
  });
});

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
  // ---------------------------------------------------------
// STUDENT UNIVERSITY EMAIL VERIFICATION
// ---------------------------------------------------------

const VERIFICATION_CODE_EXPIRY_MINUTES = 10;
const VERIFICATION_MAX_ATTEMPTS = 5;
const VERIFICATION_RESEND_COOLDOWN_SECONDS = 60;

const hashVerificationCode = (code) => {
  return createHash("sha256")
    .update(String(code))
    .digest("hex");
};

const generateVerificationCode = () => {
  return String(randomInt(100000, 1000000));
};

const codesMatch = (code, storedHash) => {
  const incomingHash = Buffer.from(hashVerificationCode(code), "utf8");
  const databaseHash = Buffer.from(storedHash, "utf8");

  if (incomingHash.length !== databaseHash.length) {
    return false;
  }

  return timingSafeEqual(incomingHash, databaseHash);
};

const isUniversityEmail = (email) => {
  const domains = String(process.env.UNIVERSITY_EMAIL_DOMAINS || "")
    .split(",")
    .map((domain) => domain.trim().toLowerCase())
    .filter(Boolean);

  // If no domain list has been configured,
  // allow the email and rely on mailbox verification.
  if (domains.length === 0) {
    return true;
  }

  const emailDomain = email.split("@")[1]?.toLowerCase();

  return domains.some((domain) => {
    return emailDomain === domain || emailDomain.endsWith(`.${domain}`);
  });
};
};
const sendVerificationEmail = async (email, code, studentName) => {
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail =
    process.env.RESEND_FROM_EMAIL || "Gradurat <onboarding@resend.dev>";

  if (!apiKey) {
    throw new Error("RESEND_API_KEY is not configured.");
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: fromEmail,
      to: [email],
      subject: "Gradurat University Email Verification",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto;">
          <h2>Verify your university email</h2>

          <p>Hi ${studentName || "Student"},</p>

          <p>
            You requested to verify your university email address
            for your Gradurat account.
          </p>

          <p>Your verification code is:</p>

          <div style="
            font-size: 32px;
            font-weight: bold;
            letter-spacing: 8px;
            padding: 20px;
            text-align: center;
            background: #f3f4f6;
            border-radius: 10px;
          ">
            ${code}
          </div>

          <p>
            This code expires in
            <strong>${VERIFICATION_CODE_EXPIRY_MINUTES} minutes</strong>.
          </p>

          <p>
            If you did not request this verification, you can ignore this email.
          </p>

          <p>— The Gradurat Team</p>
        </div>
      `,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Email provider error: ${errorText}`);
  }

  return response.json();
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

const getAvatarExtension = (contentType) => {
  const normalized = String(contentType || "")
    .split(";", 1)[0]
    .trim()
    .toLowerCase();
  const extension = avatarExtensions[normalized];
  if (!extension) {
    const error = new Error(
      "Profile photos must be JPEG, PNG, or WebP images.",
    );
    error.statusCode = 422;
    throw error;
  }
  return { contentType: normalized, extension };
};

const buildAvatarPath = (authUserId, profileId, extension) =>
  `${authUserId}/${profileId}/avatar.${extension}`;

const withProfilePictureUrl = async (profile) => {
  if (!profile) return profile;
  const { avatar_path: avatarPath, ...publicProfile } = profile;
  if (!avatarPath) return { ...publicProfile, profile_picture_url: null };

  const { data, error } = await supabaseServer.storage
    .from(avatarBucket)
    .createSignedUrl(avatarPath, avatarUrlExpiresIn);
  if (error) {
    console.warn("Profile avatar is unavailable:", avatarPath, error.message);
    return { ...publicProfile, profile_picture_url: null };
  }
  return { ...publicProfile, profile_picture_url: data?.signedUrl || null };
};

const createAvatarUpload = async (
  table,
  profileId,
  authUserId,
  contentType,
) => {
  const profile =
    table === "students"
      ? await getOwnedStudent(profileId, authUserId)
      : await getOwnedEmployer(profileId, authUserId);
  const { contentType: normalizedContentType, extension } =
    getAvatarExtension(contentType);
  const path = buildAvatarPath(authUserId, profile.id, extension);
  const { data, error } = await supabaseServer.storage
    .from(avatarBucket)
    .createSignedUploadUrl(path, { upsert: true });
  if (error) throw error;
  return {
    upload_url: data.signedUrl,
    avatar_path: path,
    content_type: normalizedContentType,
  };
};

const commitAvatarUpload = async (table, profileId, authUserId, avatarPath) => {
  const profile =
    table === "students"
      ? await getOwnedStudent(profileId, authUserId)
      : await getOwnedEmployer(profileId, authUserId);
  const extension = String(avatarPath || "").match(/\.([a-z]+)$/i)?.[1];
  const expectedPath = extension
    ? buildAvatarPath(authUserId, profile.id, extension)
    : null;
  if (!expectedPath || avatarPath !== expectedPath) {
    const error = new Error("The avatar upload path is invalid.");
    error.statusCode = 422;
    throw error;
  }

  const { data, error } = await supabaseServer
    .from(table)
    .update({ avatar_path: avatarPath })
    .eq("id", profileId)
    .select()
    .single();
  if (error) throw error;

  if (profile.avatar_path && profile.avatar_path !== avatarPath) {
    const { error: removeError } = await supabaseServer.storage
      .from(avatarBucket)
      .remove([profile.avatar_path]);
    if (removeError) throw removeError;
  }
  return withProfilePictureUrl(data);
};

const removeAvatar = async (table, profileId, authUserId) => {
  const profile =
    table === "students"
      ? await getOwnedStudent(profileId, authUserId)
      : await getOwnedEmployer(profileId, authUserId);
  if (profile.avatar_path) {
    const { error } = await supabaseServer.storage
      .from(avatarBucket)
      .remove([profile.avatar_path]);
    if (error) throw error;
  }
  const { data, error } = await supabaseServer
    .from(table)
    .update({ avatar_path: null })
    .eq("id", profileId)
    .select()
    .single();
  if (error) throw error;
  return withProfilePictureUrl(data);
};

const getCvExtension = (contentType) => {
  const normalized = String(contentType || "")
    .split(";", 1)[0]
    .trim()
    .toLowerCase();
  const extension = cvExtensions[normalized];
  if (!extension) {
    const error = new Error("CVs must be uploaded as PDF files.");
    error.statusCode = 422;
    throw error;
  }
  return { contentType: normalized, extension };
};

const buildCvPath = (authUserId, profileId, extension) =>
  `${authUserId}/${profileId}/cv.${extension}`;

const createCvUpload = async (studentId, authUserId, contentType) => {
  const student = await getOwnedStudent(studentId, authUserId);
  const { contentType: normalizedContentType, extension } =
    getCvExtension(contentType);
  const path = buildCvPath(authUserId, student.id, extension);
  const { data, error } = await supabaseServer.storage
    .from(cvBucket)
    .createSignedUploadUrl(path, { upsert: true });
  if (error) throw error;
  return {
    upload_url: data.signedUrl,
    cv_path: path,
    content_type: normalizedContentType,
  };
};

const commitCvUpload = async (studentId, authUserId, cvPath) => {
  const student = await getOwnedStudent(studentId, authUserId);
  const extension = String(cvPath || "").match(/\.([a-z]+)$/i)?.[1];
  const expectedPath = extension
    ? buildCvPath(authUserId, student.id, extension)
    : null;
  if (!expectedPath || cvPath !== expectedPath) {
    const error = new Error("The CV upload path is invalid.");
    error.statusCode = 422;
    throw error;
  }

  const { data, error } = await supabaseServer
    .from("students")
    .update({ cv_path: cvPath })
    .eq("id", studentId)
    .select()
    .single();
  if (error) throw error;

  if (student.cv_path && student.cv_path !== cvPath) {
    const { error: removeError } = await supabaseServer.storage
      .from(cvBucket)
      .remove([student.cv_path]);
    if (removeError) throw removeError;
  }
  return data;
};

const removeCv = async (studentId, authUserId) => {
  const student = await getOwnedStudent(studentId, authUserId);
  if (student.cv_path) {
    const { error } = await supabaseServer.storage
      .from(cvBucket)
      .remove([student.cv_path]);
    if (error) throw error;
  }
  const { data, error } = await supabaseServer
    .from("students")
    .update({ cv_path: null })
    .eq("id", studentId)
    .select()
    .single();
  if (error) throw error;
  return data;
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
      "institution",
      "field_of_study",
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
  if (body.institution !== undefined)
    updates.institution = coerceText(body.institution, null);
  if (body.fieldOfStudy !== undefined || body.field_of_study !== undefined) {
    updates.field_of_study = coerceText(
      body.fieldOfStudy ?? body.field_of_study,
      null,
    );
  }
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

const getOpportunity = async (opportunityId) => {
  const { data, error } = await supabaseServer
    .from("opportunities")
    .select("*, employers(company_name, website)")
    .eq("id", opportunityId)
    .single();
  if (error) throw error;
  return data;
};

const requireOwnedProfile = async (table, profileId, authUserId) => {
  const { data, error } = await supabaseServer
    .from(table)
    .select("id")
    .eq("id", profileId)
    .eq("auth_user_id", authUserId)
    .single();
  if (error || !data) {
    const ownershipError = new Error("You do not own this profile.");
    ownershipError.statusCode = 403;
    throw ownershipError;
  }
};

const getOwnedStudent = async (studentId, authUserId) => {
  await requireOwnedProfile("students", studentId, authUserId);
  return getStudent(studentId);
};

const getOwnedEmployer = async (employerId, authUserId) => {
  await requireOwnedProfile("employers", employerId, authUserId);
  return getEmployer(employerId);
};

const getAuthenticatedProfiles = async (authUserId) => {
  const [studentResult, employerResult] = await Promise.all([
    supabaseServer
      .from("students")
      .select("*")
      .eq("auth_user_id", authUserId)
      .maybeSingle(),
    supabaseServer
      .from("employers")
      .select("*")
      .eq("auth_user_id", authUserId)
      .maybeSingle(),
  ]);
  if (studentResult.error) throw studentResult.error;
  if (employerResult.error) throw employerResult.error;
  return { student: studentResult.data, employer: employerResult.data };
};

const getSwipeLimit = (value) => {
  const requested = Number(value || 15);
  return Number.isInteger(requested)
    ? Math.max(1, Math.min(30, requested))
    : 15;
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

app.get("/api/fyp/queue", requireAuth, async (request, response) => {
  try {
    const mode = String(request.query.mode || "student").toLowerCase();
    const limit = getSwipeLimit(request.query.limit);
    const page = Math.max(1, Number(request.query.page || 1));
    if (!Number.isInteger(page)) {
      return response.status(422).json({ error: "Page must be an integer." });
    }

    const profiles = await getAuthenticatedProfiles(request.authUser.id);
    if (mode === "peer") {
      if (!profiles.student) {
        return response
          .status(403)
          .json({ error: "A student profile is required." });
      }
      const { data: swipes, error: swipesError } = await supabaseServer
        .from("peer_swipes")
        .select("target_student_id")
        .eq("swiper_student_id", profiles.student.id);
      if (swipesError) throw swipesError;
      const swipedIds = new Set(
        (swipes || []).map((row) => row.target_student_id),
      );
      const { data: students, error: studentsError } = await supabaseServer
        .from("students")
        .select("*")
        .neq("id", profiles.student.id);
      if (studentsError) throw studentsError;
      const ownSkills = new Set(normalizeSkills(profiles.student.skills || []));
      const ranked = (
        await Promise.all(
          (students || [])
            .filter(
              (student) => !student.archived_at && !swipedIds.has(student.id),
            )
            .map(async (student) => {
              const sharedSkills = normalizeSkills(student.skills || []).filter(
                (skill) => ownSkills.has(skill),
              );
              const visibleStudent = await getDiscoverableStudent(student);
              if (!visibleStudent) return null;
              return {
                ...visibleStudent,
                peer_match_score: sharedSkills.length
                  ? Math.min(100, sharedSkills.length * 20)
                  : 0,
                shared_skills: sharedSkills,
              };
            }),
        )
      )
        .filter(Boolean)
        .sort((left, right) => right.peer_match_score - left.peer_match_score);
      const start = (page - 1) * limit;
      return response.json({
        mode,
        cards: ranked.slice(start, start + limit),
        page,
        limit,
        has_more: start + limit < ranked.length,
      });
    }
    if (mode === "student") {
      if (!profiles.student) {
        return response
          .status(403)
          .json({ error: "A student profile is required." });
      }
      const [swipesResult, opportunitiesResult, matchesResult] =
        await Promise.all([
          supabaseServer
            .from("swipes")
            .select("opportunity_id")
            .eq("student_id", profiles.student.id)
            .eq("swiper_role", "student"),
          supabaseServer
            .from("opportunities")
            .select("*, employers(*)")
            .order("created_at", { ascending: false }),
          supabaseServer
            .from("matches")
            .select("opportunity_id, match_score, reasoning")
            .eq("student_id", profiles.student.id),
        ]);
      if (swipesResult.error) throw swipesResult.error;
      if (opportunitiesResult.error) throw opportunitiesResult.error;
      if (matchesResult.error) throw matchesResult.error;

      const swiped = new Set(
        (swipesResult.data || []).map((row) => row.opportunity_id),
      );
      const scores = new Map(
        (matchesResult.data || []).map((row) => [row.opportunity_id, row]),
      );
      const ranked = opportunitiesResult.data
        .filter(
          (opportunity) =>
            isPublicOpportunity(opportunity) && !swiped.has(opportunity.id),
        )
        .map((opportunity) => ({
          ...opportunity,
          match_score: scores.get(opportunity.id)?.match_score ?? null,
          reasoning: scores.get(opportunity.id)?.reasoning || null,
        }))
        .sort((left, right) => {
          const scoreDifference =
            Number(right.match_score ?? -1) - Number(left.match_score ?? -1);
          return (
            scoreDifference ||
            String(right.created_at).localeCompare(String(left.created_at))
          );
        });
      const start = (page - 1) * limit;
      const cards = ranked.slice(start, start + limit);
      return response.json({
        mode,
        cards,
        page,
        limit,
        has_more: start + limit < ranked.length,
      });
    }

    if (mode !== "employer") {
      return response
        .status(422)
        .json({ error: "Mode must be student or employer." });
    }
    const opportunityId =
      request.query.opportunity_id || request.query.opportunityId;
    if (!opportunityId) {
      return response
        .status(422)
        .json({ error: "An opportunity is required for employer matching." });
    }
    const opportunity = await getOpportunity(opportunityId);
    await requireOwnedProfile(
      "employers",
      opportunity.employer_id,
      request.authUser.id,
    );

    const [swipesResult, studentsResult, matchesResult] = await Promise.all([
      supabaseServer
        .from("swipes")
        .select("student_id")
        .eq("opportunity_id", opportunity.id)
        .eq("swiper_role", "employer"),
      supabaseServer.from("students").select("*"),
      supabaseServer
        .from("matches")
        .select("student_id, match_score, reasoning")
        .eq("opportunity_id", opportunity.id),
    ]);
    if (swipesResult.error) throw swipesResult.error;
    if (studentsResult.error) throw studentsResult.error;
    if (matchesResult.error) throw matchesResult.error;

    const swiped = new Set(
      (swipesResult.data || []).map((row) => row.student_id),
    );
    const scores = new Map(
      (matchesResult.data || []).map((row) => [row.student_id, row]),
    );
    const ranked = (
      await Promise.all(
        studentsResult.data
          .filter((student) => !student.archived_at && !swiped.has(student.id))
          .map(async (student) => {
            const visibleStudent = await getDiscoverableStudent(student);
            if (!visibleStudent) return null;
            return {
              ...visibleStudent,
              opportunity_id: opportunity.id,
              match_score: scores.get(student.id)?.match_score ?? null,
              reasoning: scores.get(student.id)?.reasoning || null,
            };
          }),
      )
    )
      .filter(Boolean)
      .sort(
        (left, right) =>
          Number(right.match_score ?? -1) - Number(left.match_score ?? -1),
      );
    const start = (page - 1) * limit;
    return response.json({
      mode,
      opportunity: { id: opportunity.id, title: opportunity.title },
      cards: ranked.slice(start, start + limit),
      page,
      limit,
      has_more: start + limit < ranked.length,
    });
  } catch (error) {
    errorResponse(response, error, "Could not load swipe queue");
  }
});

app.post("/api/fyp/swipes", requireAuth, async (request, response) => {
  try {
    const decision = String(request.body?.decision || "").toLowerCase();
    const opportunityId =
      request.body?.opportunity_id || request.body?.opportunityId;
    const requestedStudentId =
      request.body?.student_id || request.body?.studentId;
    const mode = String(request.body?.mode || "opportunity").toLowerCase();
    if (
      (mode !== "peer" && !opportunityId) ||
      !["like", "pass"].includes(decision)
    ) {
      return response.status(422).json({
        error:
          mode === "peer"
            ? "target_student_id and a like/pass decision are required."
            : "opportunity_id and a like/pass decision are required.",
      });
    }

    const profiles = await getAuthenticatedProfiles(request.authUser.id);
    if (mode === "peer") {
      if (!profiles.student)
        return response
          .status(403)
          .json({ error: "A student profile is required." });
      const targetStudentId =
        requestedStudentId ||
        request.body?.target_student_id ||
        request.body?.targetStudentId;
      if (!targetStudentId || targetStudentId === profiles.student.id)
        return response
          .status(422)
          .json({ error: "A different target student is required." });
      const targetStudent = await getStudent(targetStudentId);
      const { data: swipe, error: swipeError } = await supabaseServer
        .from("peer_swipes")
        .upsert(
          {
            swiper_student_id: profiles.student.id,
            target_student_id: targetStudentId,
            decision,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "swiper_student_id,target_student_id" },
        )
        .select(
          "id, swiper_student_id, target_student_id, decision, updated_at",
        )
        .single();
      if (swipeError) throw swipeError;
      let matched = false;
      let match = null;
      if (decision === "like") {
        const { data: reciprocal, error: reciprocalError } =
          await supabaseServer
            .from("peer_swipes")
            .select("id")
            .eq("swiper_student_id", targetStudentId)
            .eq("target_student_id", profiles.student.id)
            .eq("decision", "like")
            .maybeSingle();
        if (reciprocalError) throw reciprocalError;
        if (reciprocal) {
          const [studentAId, studentBId] = [
            profiles.student.id,
            targetStudentId,
          ].sort();
          const advice = await createPeerConnectionAdviceWithGroq({
            firstStudent: {
              name: profiles.student.full_name,
              skills: profiles.student.skills,
              qualification: profiles.student.qualification,
              goals: profiles.student.preferred_opportunity_type,
            },
            secondStudent: {
              name: targetStudent.full_name,
              skills: targetStudent.skills,
              qualification: targetStudent.qualification,
              goals: targetStudent.preferred_opportunity_type,
            },
          });
          const { data: connection, error: connectionError } =
            await supabaseServer
              .from("student_matches")
              .upsert(
                {
                  student_a_id: studentAId,
                  student_b_id: studentBId,
                  connection_advice: advice,
                },
                { onConflict: "student_a_id,student_b_id" },
              )
              .select(
                "id, student_a_id, student_b_id, matched_at, connection_advice",
              )
              .single();
          if (connectionError) throw connectionError;
          matched = true;
          match = connection;
        }
      }
      return response
        .status(201)
        .json({ swipe, matched, match, match_type: "peer" });
    }
    let studentId = requestedStudentId;
    let swiperRole;
    const opportunity = await getOpportunity(opportunityId);
    if (profiles.student) {
      swiperRole = "student";
      studentId = profiles.student.id;
      if (!isPublicOpportunity(opportunity)) {
        return response
          .status(404)
          .json({ error: "Opportunity is not available." });
      }
    } else if (profiles.employer) {
      swiperRole = "employer";
      await requireOwnedProfile(
        "employers",
        opportunity.employer_id,
        request.authUser.id,
      );
      if (!studentId) {
        return response
          .status(422)
          .json({ error: "A student is required for an employer swipe." });
      }
      await getStudent(studentId);
    } else {
      return response
        .status(403)
        .json({ error: "A registered profile is required." });
    }

    const { data: swipe, error: swipeError } = await supabaseServer
      .from("swipes")
      .upsert(
        {
          student_id: studentId,
          opportunity_id: opportunity.id,
          swiper_role: swiperRole,
          decision,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "student_id,opportunity_id,swiper_role" },
      )
      .select(
        "id, student_id, opportunity_id, swiper_role, decision, updated_at",
      )
      .single();
    if (swipeError) throw swipeError;

    let matched = false;
    let match = null;
    if (decision === "like") {
      const counterpartRole = swiperRole === "student" ? "employer" : "student";
      const { data: counterpart, error: counterpartError } =
        await supabaseServer
          .from("swipes")
          .select("id")
          .eq("student_id", studentId)
          .eq("opportunity_id", opportunity.id)
          .eq("swiper_role", counterpartRole)
          .eq("decision", "like")
          .maybeSingle();
      if (counterpartError) throw counterpartError;
      if (counterpart) {
        const matchedStudent = await getStudent(studentId);
        const connectionAdvice = await createConnectionAdviceWithGroq({
          student: {
            name: matchedStudent.full_name,
            skills: matchedStudent.skills,
            qualification: matchedStudent.qualification,
            experience: matchedStudent.work_experience_summary,
            goals: matchedStudent.preferred_opportunity_type,
          },
          employer: {
            name: opportunity.employers?.company_name,
            industry: opportunity.industry,
            description: opportunity.employers?.company_description,
          },
          opportunity: {
            title: opportunity.title,
            description: opportunity.description,
            skills: opportunity.required_skills || opportunity.preferred_skills,
          },
        });
        const { data: connection, error: connectionError } =
          await supabaseServer
            .from("swipe_matches")
            .upsert(
              {
                student_id: studentId,
                opportunity_id: opportunity.id,
                connection_advice: connectionAdvice,
              },
              { onConflict: "student_id,opportunity_id" },
            )
            .select(
              "id, student_id, opportunity_id, matched_at, connection_advice",
            )
            .single();
        if (connectionError) throw connectionError;
        matched = true;
        match = connection;
      }
    }
    response.status(201).json({ swipe, matched, match });
  } catch (error) {
    errorResponse(response, error, "Could not record swipe");
  }
});

const buildMatchResponse = async (connection, currentRole, profileMap) => {
  const [opportunityResult, scoreResult] = await Promise.all([
    supabaseServer
      .from("opportunities")
      .select("id, title, employer_id, employers(*)")
      .eq("id", connection.opportunity_id)
      .single(),
    supabaseServer
      .from("matches")
      .select("match_score, reasoning")
      .eq("student_id", connection.student_id)
      .eq("opportunity_id", connection.opportunity_id)
      .maybeSingle(),
  ]);
  if (opportunityResult.error) throw opportunityResult.error;
  if (scoreResult.error) throw scoreResult.error;
  const opportunity = opportunityResult.data;
  let counterpart;
  if (currentRole === "student") {
    const employer = opportunity.employers;
    counterpart = {
      id: employer.id,
      type: "employer",
      name: employer.company_name || "Employer",
      photo: null,
      field: employer.industry || employer.location || "Employer",
    };
  } else {
    const student = profileMap.get(connection.student_id);
    counterpart = {
      id: student.id,
      type: "student",
      name: student.full_name || "Graduate",
      photo: student.profile_picture_url || null,
      qualification: student.qualification || null,
      field: student.preferred_industry || student.location || null,
    };
  }
  return {
    id: connection.id,
    student_id: connection.student_id,
    opportunity_id: connection.opportunity_id,
    matched_at: connection.matched_at,
    opportunity: { id: opportunity.id, title: opportunity.title },
    counterpart,
    match_score: scoreResult.data?.match_score ?? null,
    reasoning: scoreResult.data?.reasoning || null,
    connection_advice: connection.connection_advice || null,
    messaging: { enabled: false, conversation_id: null },
  };
};

const buildPeerMatchResponse = (connection, currentStudentId, studentMap) => {
  const counterpartId =
    connection.student_a_id === currentStudentId
      ? connection.student_b_id
      : connection.student_a_id;
  const counterpart = studentMap.get(counterpartId);
  return {
    id: connection.id,
    match_type: "peer",
    student_id: counterpartId,
    opportunity_id: null,
    matched_at: connection.matched_at,
    opportunity: { id: null, title: "Student networking connection" },
    counterpart: {
      id: counterpart.id,
      type: "student",
      name: counterpart.full_name || "Student",
      photo: counterpart.profile_picture_url || null,
      qualification: counterpart.qualification || null,
      field: counterpart.preferred_industry || counterpart.location || null,
    },
    match_score: null,
    reasoning: null,
    connection_advice: connection.connection_advice || null,
    messaging: { enabled: false, conversation_id: null },
  };
};

app.get("/api/matches", requireAuth, async (request, response) => {
  try {
    const profiles = await getAuthenticatedProfiles(request.authUser.id);
    const currentRole = profiles.student
      ? "student"
      : profiles.employer
        ? "employer"
        : null;
    if (!currentRole)
      return response
        .status(403)
        .json({ error: "A registered profile is required." });
    let query = supabaseServer
      .from("swipe_matches")
      .select("*")
      .order("matched_at", { ascending: false });
    if (currentRole === "student")
      query = query
        .eq("student_id", profiles.student.id)
        .is("student_deleted_at", null);
    else {
      const { data: opportunities, error: opportunitiesError } =
        await supabaseServer
          .from("opportunities")
          .select("id")
          .eq("employer_id", profiles.employer.id);
      if (opportunitiesError) throw opportunitiesError;
      const opportunityIds = opportunities.map((item) => item.id);
      if (!opportunityIds.length)
        return response.json({
          matches: [],
          totalMatches: 0,
          activeConnections: 0,
          cvAccess: 0,
        });
      query = query
        .in("opportunity_id", opportunityIds)
        .is("employer_deleted_at", null);
    }
    const { data: connections, error } = await query;
    if (error) throw error;
    const studentIds = [
      ...new Set(connections.map((connection) => connection.student_id)),
    ];
    const studentsResult = studentIds.length
      ? await supabaseServer.from("students").select("*").in("id", studentIds)
      : { data: [], error: null };
    if (studentsResult.error) throw studentsResult.error;
    const studentMap = new Map(
      (studentsResult.data || []).map((student) => [student.id, student]),
    );
    const matches = await Promise.all(
      connections.map((connection) =>
        buildMatchResponse(connection, currentRole, studentMap),
      ),
    );
    if (currentRole === "student") {
      const { data: peerConnections, error: peerError } = await supabaseServer
        .from("student_matches")
        .select("*")
        .or(
          `student_a_id.eq.${profiles.student.id},student_b_id.eq.${profiles.student.id}`,
        );
      if (peerError) throw peerError;
      const peerIds = [
        ...new Set(
          (peerConnections || []).flatMap((item) => [
            item.student_a_id,
            item.student_b_id,
          ]),
        ),
      ];
      const { data: peerStudents, error: peerStudentsError } =
        await supabaseServer
          .from("students")
          .select("*")
          .in("id", peerIds.length ? peerIds : [profiles.student.id]);
      if (peerStudentsError) throw peerStudentsError;
      const peerMap = new Map(
        (peerStudents || []).map((student) => [student.id, student]),
      );
      matches.push(
        ...(peerConnections || [])
          .filter((connection) => {
            return connection.student_a_id === profiles.student.id
              ? !connection.student_a_deleted_at
              : !connection.student_b_deleted_at;
          })
          .map((connection) =>
            buildPeerMatchResponse(connection, profiles.student.id, peerMap),
          ),
      );
    }
    response.json({
      matches,
      totalMatches: matches.length,
      activeConnections: matches.length,
      cvAccess: 0,
    });
  } catch (error) {
    errorResponse(response, error, "Could not load matches");
  }
});

app.delete("/api/matches/:matchId", requireAuth, async (request, response) => {
  try {
    const { data: opportunityConnection, error: opportunityLookupError } =
      await supabaseServer
        .from("swipe_matches")
        .select("*")
        .eq("id", request.params.matchId)
        .maybeSingle();
    const profiles = await getAuthenticatedProfiles(request.authUser.id);
    if (!opportunityLookupError && opportunityConnection) {
      const connection = opportunityConnection;
      if (profiles.student?.id === connection.student_id) {
        const { error } = await supabaseServer
          .from("swipe_matches")
          .update({ student_deleted_at: new Date().toISOString() })
          .eq("id", connection.id);
        if (error) throw error;
      } else {
        const opportunity = await getOpportunity(connection.opportunity_id);
        await requireOwnedProfile(
          "employers",
          opportunity.employer_id,
          request.authUser.id,
        );
        const { error } = await supabaseServer
          .from("swipe_matches")
          .update({ employer_deleted_at: new Date().toISOString() })
          .eq("id", connection.id);
        if (error) throw error;
      }
      return response.json({ deleted: true, match_id: connection.id });
    }
    const { data: peerConnection, error: peerLookupError } =
      await supabaseServer
        .from("student_matches")
        .select("*")
        .eq("id", request.params.matchId)
        .single();
    if (peerLookupError) throw peerLookupError;
    if (
      !profiles.student ||
      ![peerConnection.student_a_id, peerConnection.student_b_id].includes(
        profiles.student.id,
      )
    ) {
      return response
        .status(403)
        .json({ error: "You do not participate in this match." });
    }
    const deletedField =
      peerConnection.student_a_id === profiles.student.id
        ? "student_a_deleted_at"
        : "student_b_deleted_at";
    const { error: peerDeleteError } = await supabaseServer
      .from("student_matches")
      .update({ [deletedField]: new Date().toISOString() })
      .eq("id", peerConnection.id);
    if (peerDeleteError) throw peerDeleteError;
    return response.json({ deleted: true, match_id: peerConnection.id });
  } catch (error) {
    errorResponse(response, error, "Could not delete match");
  }
});

app.get("/api/students/:studentId", requireAuth, async (request, response) => {
  try {
    const student = await getOwnedStudent(
      request.params.studentId,
      request.authUser.id,
    );
    response.json({
      student: await withProfilePictureUrl(student),
      profile_completeness: computeProfileCompleteness(student, "student"),
    });
  } catch (error) {
    errorResponse(response, error, "Could not load student profile");
  }
});

app.get(
  "/api/candidates/:candidateId",
  requireAuth,
  async (request, response) => {
    try {
      const { data, error } = await supabaseServer
        .from("students")
        .select(
          "id, full_name, bio, skills, location, qualification, graduation_year, work_experience_summary, certifications, projects, avatar_path",
        )
        .eq("id", request.params.candidateId)
        .is("archived_at", null)
        .maybeSingle();
      if (error) throw error;
      if (!data)
        return response.status(404).json({ error: "Candidate not found." });

      response.json({ candidate: await withProfilePictureUrl(data) });
    } catch (error) {
      errorResponse(response, error, "Could not load candidate profile");
    }
  },
);

app.get("/api/candidates", requireAuth, async (request, response) => {
  try {
    const { data: employer, error: employerError } = await supabaseServer
      .from("employers")
      .select("id")
      .eq("auth_user_id", request.authUser.id)
      .maybeSingle();
    if (employerError) throw employerError;
    if (!employer) {
      return response
        .status(403)
        .json({ error: "Only employers can search candidates." });
    }

    const industry = String(request.query.industry || "")
      .trim()
      .toLowerCase();
    const opportunityType = String(
      request.query.opportunity_type || request.query.opportunityType || "",
    )
      .trim()
      .toLowerCase();
    const keyword = String(request.query.keyword || "")
      .trim()
      .toLowerCase();
    const { data: students, error } = await supabaseServer
      .from("students")
      .select(
        "id, full_name, bio, skills, location, qualification, preferred_industry, preferred_opportunity_type, work_experience_summary, avatar_path",
      )
      .is("archived_at", null)
      .order("updated_at", { ascending: false });
    if (error) throw error;

    const filtered = (students || []).filter((student) => {
      const searchable = [
        student.full_name,
        student.bio,
        student.qualification,
        student.location,
        ...(student.skills || []),
      ]
        .join(" ")
        .toLowerCase();
      return (
        (!industry ||
          String(student.preferred_industry || "").toLowerCase() ===
            industry) &&
        (!opportunityType ||
          String(student.preferred_opportunity_type || "").toLowerCase() ===
            opportunityType) &&
        (!keyword || searchable.includes(keyword))
      );
    });
    response.json({
      candidates: (
        await Promise.all(filtered.map(getDiscoverableStudent))
      ).filter(Boolean),
    });
  } catch (error) {
    errorResponse(response, error, "Could not search candidates");
  }
});

app.get(
  "/api/candidates/:candidateId/employer-review",
  requireAuth,
  async (request, response) => {
    try {
      const { data: employer, error: employerError } = await supabaseServer
        .from("employers")
        .select("id")
        .eq("auth_user_id", request.authUser.id)
        .maybeSingle();
      if (employerError) throw employerError;
      if (!employer) {
        return response
          .status(403)
          .json({ error: "Only employers can access candidate reviews." });
      }

      const student = await getStudent(request.params.candidateId);
      const [matchResult, applicationResult] = await Promise.all([
        supabaseServer
          .from("swipe_matches")
          .select("id, opportunity_id, opportunities!inner(employer_id)")
          .eq("student_id", student.id)
          .eq("opportunities.employer_id", employer.id)
          .is("employer_deleted_at", null),
        supabaseServer
          .from("applications")
          .select(
            "id, opportunity_id, opportunities!inner(id, title, employer_id)",
          )
          .eq("student_id", student.id)
          .neq("status", "withdrawn")
          .eq("opportunities.employer_id", employer.id),
      ]);
      if (matchResult.error) throw matchResult.error;
      if (applicationResult.error) throw applicationResult.error;

      const matchedOpportunityIds = new Set();
      const matchedConnection = (matchResult.data || []).find((match) => {
        matchedOpportunityIds.add(match.opportunity_id);
        return true;
      });
      const employerApplication = applicationResult.data?.[0] || null;
      if (!matchedConnection && !employerApplication) {
        return response.status(403).json({
          error:
            "You can only review candidates connected to your opportunities.",
        });
      }

      const opportunityId =
        matchedConnection?.opportunity_id ||
        employerApplication?.opportunity_id ||
        [...matchedOpportunityIds][0];
      const opportunity = opportunityId
        ? await getOpportunity(opportunityId)
        : null;
      const settings = await getOrCreateUserSettings(student.auth_user_id);
      let cvUrl = null;
      if (student.cv_path && settings.preferences?.allowCVDownload) {
        const { data, error } = await supabaseServer.storage
          .from(cvBucket)
          .createSignedUrl(student.cv_path, cvUrlExpiresIn);
        if (error) {
          console.warn(
            "Candidate CV is unavailable:",
            student.cv_path,
            error.message,
          );
        } else {
          cvUrl = data?.signedUrl || null;
        }
      }

      let assessment = null;
      try {
        const aiDescription = String(student.bio || "")
          .split("\n")
          .filter((line) => !/^(phone|email|contact)\s*:/i.test(line.trim()))
          .join("\n");
        assessment = await assessFitWithGroq({
          subjectType: "candidate",
          subject: {
            name: student.full_name,
            qualification: student.qualification,
            location: student.location,
            skills: student.skills,
            experience: student.work_experience_summary,
            goals: student.preferred_opportunity_type,
            description: aiDescription,
          },
          targetType: "opportunity",
          target: opportunity
            ? {
                name: opportunity.title,
                title: opportunity.title,
                industry: opportunity.industry,
                location: opportunity.location,
                skills:
                  opportunity.required_skills || opportunity.preferred_skills,
                description: opportunity.description,
              }
            : null,
        });
      } catch (assessmentError) {
        console.error("Candidate Groq review unavailable:", assessmentError);
      }

      response.json({
        contact: {
          email: student.email || null,
          phone: student.phone || null,
          linkedin_url: student.linkedin_url || null,
          portfolio_url: student.portfolio_url || null,
        },
        cv: {
          available: Boolean(student.cv_path),
          downloadable: Boolean(cvUrl),
          url: cvUrl,
        },
        opportunity: opportunity
          ? { id: opportunity.id, title: opportunity.title }
          : null,
        assessment,
      });
    } catch (error) {
      errorResponse(
        response,
        error,
        "Could not load employer candidate review",
      );
    }
  },
);

app.patch(
  "/api/students/:studentId",
  requireAuth,
  async (request, response) => {
    try {
      await requireOwnedProfile(
        "students",
        request.params.studentId,
        request.authUser.id,
      );
      const updates = buildStudentUpdate(request.body || {});
      const { data, error } = await supabaseServer
        .from("students")
        .update(updates)
        .eq("id", request.params.studentId)
        .select()
        .single();
      if (error) throw error;
      response.json({
        student: await withProfilePictureUrl(data),
        profile_completeness: computeProfileCompleteness(data, "student"),
      });
    } catch (error) {
      errorResponse(response, error, "Could not update student profile");
    }
  },
);

app.get(
  "/api/employers/:employerId",
  requireAuth,
  async (request, response) => {
    try {
      const employer = await getOwnedEmployer(
        request.params.employerId,
        request.authUser.id,
      );
      response.json({
        employer: await withProfilePictureUrl(employer),
        profile_completeness: computeProfileCompleteness(employer, "employer"),
      });
    } catch (error) {
      errorResponse(response, error, "Could not load employer profile");
    }
  },
);

app.patch(
  "/api/employers/:employerId",
  requireAuth,
  async (request, response) => {
    try {
      await requireOwnedProfile(
        "employers",
        request.params.employerId,
        request.authUser.id,
      );
      const updates = buildEmployerUpdate(request.body || {});
      const { data, error } = await supabaseServer
        .from("employers")
        .update(updates)
        .eq("id", request.params.employerId)
        .select()
        .single();
      if (error) throw error;
      response.json({
        employer: await withProfilePictureUrl(data),
        profile_completeness: computeProfileCompleteness(data, "employer"),
      });
    } catch (error) {
      errorResponse(response, error, "Could not update employer profile");
    }
  },
);

const addAvatarRoutes = (profileType, table, idParam, resultKey) => {
  const basePath = `/api/${profileType}/:${idParam}/avatar`;

  app.post(`${basePath}/upload-url`, requireAuth, async (request, response) => {
    try {
      const upload = await createAvatarUpload(
        table,
        request.params[idParam],
        request.authUser.id,
        request.body?.content_type ?? request.body?.contentType,
      );
      response.json(upload);
    } catch (error) {
      errorResponse(response, error, "Could not prepare profile photo upload");
    }
  });

  app.post(basePath, requireAuth, async (request, response) => {
    try {
      const profile = await commitAvatarUpload(
        table,
        request.params[idParam],
        request.authUser.id,
        request.body?.avatar_path ?? request.body?.avatarPath,
      );
      response.json({ [resultKey]: profile });
    } catch (error) {
      errorResponse(response, error, "Could not save profile photo");
    }
  });

  app.delete(basePath, requireAuth, async (request, response) => {
    try {
      const profile = await removeAvatar(
        table,
        request.params[idParam],
        request.authUser.id,
      );
      response.json({ [resultKey]: profile });
    } catch (error) {
      errorResponse(response, error, "Could not remove profile photo");
    }
  });
};

addAvatarRoutes("students", "students", "studentId", "student");
addAvatarRoutes("employers", "employers", "employerId", "employer");

app.post(
  "/api/students/:studentId/cv/upload-url",
  requireAuth,
  async (request, response) => {
    try {
      const upload = await createCvUpload(
        request.params.studentId,
        request.authUser.id,
        request.body?.content_type ?? request.body?.contentType,
      );
      response.json(upload);
    } catch (error) {
      errorResponse(response, error, "Could not prepare CV upload");
    }
  },
);

app.post(
  "/api/students/:studentId/cv",
  requireAuth,
  async (request, response) => {
    try {
      const student = await commitCvUpload(
        request.params.studentId,
        request.authUser.id,
        request.body?.cv_path ?? request.body?.cvPath,
      );
      response.json({ student });
    } catch (error) {
      errorResponse(response, error, "Could not save CV");
    }
  },
);

app.delete(
  "/api/students/:studentId/cv",
  requireAuth,
  async (request, response) => {
    try {
      const student = await removeCv(
        request.params.studentId,
        request.authUser.id,
      );
      response.json({ student });
    } catch (error) {
      errorResponse(response, error, "Could not remove CV");
    }
  },
);

app.get(
  "/api/students/:studentId/cv",
  requireAuth,
  async (request, response) => {
    try {
      const student = await getStudent(request.params.studentId);
      const isOwner = student.auth_user_id === request.authUser.id;
      if (!isOwner) {
        // Only an authenticated employer profile can request another
        // student's CV; the candidate's own setting is the only gate.
        const { data: employer, error: employerError } = await supabaseServer
          .from("employers")
          .select("id")
          .eq("auth_user_id", request.authUser.id)
          .maybeSingle();
        if (employerError) throw employerError;
        if (!employer) {
          const error = new Error("You do not have access to this CV.");
          error.statusCode = 403;
          throw error;
        }
        const [matchResult, applicationResult] = await Promise.all([
          supabaseServer
            .from("swipe_matches")
            .select("id, opportunities!inner(employer_id)")
            .eq("student_id", student.id)
            .eq("opportunities.employer_id", employer.id)
            .is("employer_deleted_at", null)
            .limit(1),
          supabaseServer
            .from("applications")
            .select("id, opportunities!inner(employer_id)")
            .eq("student_id", student.id)
            .eq("opportunities.employer_id", employer.id)
            .neq("status", "withdrawn")
            .limit(1),
        ]);
        if (matchResult.error) throw matchResult.error;
        if (applicationResult.error) throw applicationResult.error;
        if (!matchResult.data?.length && !applicationResult.data?.length) {
          const error = new Error("You do not have access to this CV.");
          error.statusCode = 403;
          throw error;
        }
        const settings = await getOrCreateUserSettings(student.auth_user_id);
        if (!settings.preferences?.allowCVDownload) {
          const error = new Error(
            "This candidate has not enabled CV downloads.",
          );
          error.statusCode = 403;
          throw error;
        }
      }
      if (!student.cv_path) {
        return response
          .status(404)
          .json({ error: "This candidate has not uploaded a CV yet." });
      }
      const { data, error } = await supabaseServer.storage
        .from(cvBucket)
        .createSignedUrl(student.cv_path, cvUrlExpiresIn);
      if (error) throw error;
      response.json({ cv_url: data.signedUrl });
    } catch (error) {
      errorResponse(response, error, "Could not load CV");
    }
  },
);

const getOrCreateUserSettings = async (authUserId) => {
  const { data, error } = await supabaseServer
    .from("user_settings")
    .select("*")
    .eq("auth_user_id", authUserId)
    .maybeSingle();
  if (error) throw error;
  if (data) return data;

  const { data: created, error: createError } = await supabaseServer
    .from("user_settings")
    .insert({ auth_user_id: authUserId })
    .select()
    .single();
  if (createError) throw createError;
  return created;
};

const getDiscoverableStudent = async (student) => {
  const settings = await getOrCreateUserSettings(student.auth_user_id);
  const preferences = settings.preferences || {};
  if (
    preferences.profileDiscoverable === false &&
    Object.prototype.hasOwnProperty.call(preferences, "profileDiscoverable")
  )
    return null;
  const visible = { ...student };
  if (
    preferences.showPhoto === false &&
    Object.prototype.hasOwnProperty.call(preferences, "showPhoto")
  )
    visible.avatar_path = null;
  if (
    preferences.showInterests === false &&
    Object.prototype.hasOwnProperty.call(preferences, "showInterests")
  ) {
    delete visible.preferred_industry;
    delete visible.preferred_opportunity_type;
    delete visible.preferred_location;
  }
  return withProfilePictureUrl(visible);
};

const withoutPrivateProfilePaths = (profile) => {
  if (!profile) return null;
  const { avatar_path, cv_path, ...publicProfile } = profile;
  return publicProfile;
};

app.get("/api/settings", requireAuth, async (request, response) => {
  try {
    const [settings, studentResult, employerResult] = await Promise.all([
      getOrCreateUserSettings(request.authUser.id),
      supabaseServer
        .from("students")
        .select("*")
        .eq("auth_user_id", request.authUser.id)
        .maybeSingle(),
      supabaseServer
        .from("employers")
        .select("*")
        .eq("auth_user_id", request.authUser.id)
        .maybeSingle(),
    ]);
    if (studentResult.error) throw studentResult.error;
    if (employerResult.error) throw employerResult.error;
    response.json({
      theme: settings.theme,
      preferences: settings.preferences,
      student: withoutPrivateProfilePaths(studentResult.data),
      employer: withoutPrivateProfilePaths(employerResult.data),
    });
  } catch (error) {
    errorResponse(response, error, "Could not load settings");
  }
});

app.put("/api/settings", requireAuth, async (request, response) => {
  try {
    const body = request.body || {};
    const existing = await getOrCreateUserSettings(request.authUser.id);
    const theme = coerceText(body.theme, existing.theme);
    if (theme && !["dark", "light", "system"].includes(theme)) {
      return response
        .status(422)
        .json({ error: "Theme must be dark, light, or system." });
    }
    const preferenceKeys = [
      "profileDiscoverable",
      "showPhoto",
      "showInterests",
      "cvVisibility",
      "allowCVDownload",
      "workEnvironment",
      "employmentPreference",
      "appearInFYP",
      "personalizedMatching",
      "notifyMatches",
      "notifyOpportunities",
      "notifyConnections",
      "aiMatching",
      "candidateRecommendations",
    ];
    const nextPreferences = { ...(existing.preferences || {}) };
    for (const key of preferenceKeys) {
      if (body[key] !== undefined) nextPreferences[key] = body[key];
    }

    const { data: settings, error } = await supabaseServer
      .from("user_settings")
      .update({ theme, preferences: nextPreferences })
      .eq("auth_user_id", request.authUser.id)
      .select()
      .single();
    if (error) throw error;

    let student = null;
    let employer = null;
    if (body.phone !== undefined) {
      const { data: studentRow, error: studentLookupError } =
        await supabaseServer
          .from("students")
          .select("id")
          .eq("auth_user_id", request.authUser.id)
          .maybeSingle();
      if (studentLookupError) throw studentLookupError;
      if (studentRow) {
        const { data, error: updateError } = await supabaseServer
          .from("students")
          .update({
            phone: coerceText(body.phone, null),
            updated_at: new Date().toISOString(),
          })
          .eq("id", studentRow.id)
          .select()
          .single();
        if (updateError) throw updateError;
        student = data;
      }
    }
    if (body.companyName !== undefined || body.companyIndustry !== undefined) {
      const { data: employerRow, error: employerLookupError } =
        await supabaseServer
          .from("employers")
          .select("id")
          .eq("auth_user_id", request.authUser.id)
          .maybeSingle();
      if (employerLookupError) throw employerLookupError;
      if (employerRow) {
        const employerUpdates = { updated_at: new Date().toISOString() };
        if (body.companyName !== undefined)
          employerUpdates.company_name = coerceText(
            body.companyName,
            undefined,
          );
        if (body.companyIndustry !== undefined)
          employerUpdates.industry = coerceText(body.companyIndustry, null);
        const { data, error: updateError } = await supabaseServer
          .from("employers")
          .update(employerUpdates)
          .eq("id", employerRow.id)
          .select()
          .single();
        if (updateError) throw updateError;
        employer = data;
      }
    }

    response.json({
      theme: settings.theme,
      preferences: settings.preferences,
      student: withoutPrivateProfilePaths(student),
      employer: withoutPrivateProfilePaths(employer),
    });
  } catch (error) {
    errorResponse(response, error, "Could not save settings");
  }
});

const toCsvValue = (value) => {
  const stringValue =
    value === null || value === undefined
      ? ""
      : Array.isArray(value)
        ? value.join("; ")
        : typeof value === "object"
          ? JSON.stringify(value)
          : String(value);
  return /[",\n]/.test(stringValue)
    ? `"${stringValue.replace(/"/g, '""')}"`
    : stringValue;
};

const rowsToCsvSection = (title, rows) => {
  if (!rows.length) return `${title}\n(no records)\n`;
  const headers = Object.keys(rows[0]);
  return [
    title,
    headers.join(","),
    ...rows.map((row) =>
      headers.map((header) => toCsvValue(row[header])).join(","),
    ),
  ].join("\n");
};

app.get("/api/account/export", requireAuth, async (request, response) => {
  try {
    const [settings, studentResult, employerResult] = await Promise.all([
      getOrCreateUserSettings(request.authUser.id),
      supabaseServer
        .from("students")
        .select("*")
        .eq("auth_user_id", request.authUser.id)
        .maybeSingle(),
      supabaseServer
        .from("employers")
        .select("*")
        .eq("auth_user_id", request.authUser.id)
        .maybeSingle(),
    ]);
    if (studentResult.error) throw studentResult.error;
    if (employerResult.error) throw employerResult.error;

    const sections = [
      rowsToCsvSection("ACCOUNT SETTINGS", [
        { theme: settings.theme, ...settings.preferences },
      ]),
    ];

    if (studentResult.data) {
      const { avatar_path, cv_path, ...studentRow } = studentResult.data;
      sections.push(rowsToCsvSection("STUDENT PROFILE", [studentRow]));
      const { data: applications, error: applicationsError } =
        await supabaseServer
          .from("applications")
          .select("*, opportunities(title)")
          .eq("student_id", studentResult.data.id);
      if (applicationsError) throw applicationsError;
      sections.push(rowsToCsvSection("APPLICATIONS", applications || []));
    }
    if (employerResult.data) {
      const { avatar_path, ...employerRow } = employerResult.data;
      sections.push(rowsToCsvSection("EMPLOYER PROFILE", [employerRow]));
      const { data: opportunities, error: opportunitiesError } =
        await supabaseServer
          .from("opportunities")
          .select("*")
          .eq("employer_id", employerResult.data.id);
      if (opportunitiesError) throw opportunitiesError;
      sections.push(rowsToCsvSection("OPPORTUNITIES", opportunities || []));
    }

    const csv = sections.join("\n\n");
    const filename = `gradurat-data-${new Date().toISOString().slice(0, 10)}.csv`;
    response.setHeader("Content-Type", "text/csv");
    response.setHeader(
      "Content-Disposition",
      `attachment; filename="${filename}"`,
    );
    response.send(csv);
  } catch (error) {
    errorResponse(response, error, "Could not export account data");
  }
});

app.delete("/api/account", requireAuth, async (request, response) => {
  try {
    const [studentResult, employerResult] = await Promise.all([
      supabaseServer
        .from("students")
        .select("id, avatar_path, cv_path")
        .eq("auth_user_id", request.authUser.id)
        .maybeSingle(),
      supabaseServer
        .from("employers")
        .select("id, avatar_path")
        .eq("auth_user_id", request.authUser.id)
        .maybeSingle(),
    ]);
    if (studentResult.error) throw studentResult.error;
    if (employerResult.error) throw employerResult.error;

    const filesToRemove = [];
    if (studentResult.data?.avatar_path)
      filesToRemove.push({
        bucket: avatarBucket,
        path: studentResult.data.avatar_path,
      });
    if (studentResult.data?.cv_path)
      filesToRemove.push({
        bucket: cvBucket,
        path: studentResult.data.cv_path,
      });
    if (employerResult.data?.avatar_path)
      filesToRemove.push({
        bucket: avatarBucket,
        path: employerResult.data.avatar_path,
      });

    for (const file of filesToRemove) {
      const { error } = await supabaseServer.storage
        .from(file.bucket)
        .remove([file.path]);
      if (error) throw error;
    }

    if (studentResult.data) {
      const { error } = await supabaseServer
        .from("students")
        .delete()
        .eq("id", studentResult.data.id);
      if (error) throw error;
    }
    if (employerResult.data) {
      const { error } = await supabaseServer
        .from("employers")
        .delete()
        .eq("id", employerResult.data.id);
      if (error) throw error;
    }

    const { error: settingsError } = await supabaseServer
      .from("user_settings")
      .delete()
      .eq("auth_user_id", request.authUser.id);
    if (settingsError) throw settingsError;

    const { error: authError } = await supabaseServer.auth.admin.deleteUser(
      request.authUser.id,
    );
    if (authError) throw authError;

    response.json({ success: true });
  } catch (error) {
    errorResponse(response, error, "Could not delete account");
  }
});

app.post("/api/ai/feedback", async (request, response) => {
  try {
    const body = request.body || {};
    const subjectType = coerceText(
      body.subject_type ?? body.subjectType,
      "profile",
    );
    const targetType = coerceText(
      body.target_type ?? body.targetType,
      "opportunity",
    );
    let subject = body.subject || {};
    let target = body.target || null;

    if (body.subject_id || body.subjectId) {
      const subjectId = body.subject_id || body.subjectId;
      subject =
        subjectType === "employer"
          ? await getEmployer(subjectId)
          : await getStudent(subjectId);
    }
    if (body.target_id || body.targetId) {
      const targetId = body.target_id || body.targetId;
      target =
        targetType === "opportunity"
          ? await getOpportunity(targetId)
          : targetType === "employer"
            ? await getEmployer(targetId)
            : await getStudent(targetId);
    }

    if (!subject || typeof subject !== "object") {
      return response
        .status(422)
        .json({ error: "A profile is required for feedback." });
    }

    const assessment = await assessFitWithGroq({
      subjectType,
      subject,
      targetType,
      target,
    });
    response.json({ assessment });
  } catch (error) {
    errorResponse(response, error, "Could not generate AI feedback");
  }
});

app.post("/api/students", requireAuth, async (request, response) => {
  const body = request.body;
  const { data: existingStudent, error: existingStudentError } =
    await supabaseServer
      .from("students")
      .select("*")
      .eq("auth_user_id", request.authUser.id)
      .maybeSingle();
  if (existingStudentError)
    return errorResponse(
      response,
      existingStudentError,
      "Could not load graduate profile",
    );
  if (existingStudent) {
    return response.status(200).json({
      student: existingStudent,
      profile_completeness: computeProfileCompleteness(
        existingStudent,
        "student",
      ),
    });
  }
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
      auth_user_id: request.authUser.id,
    })
    .select()
    .single();

  if (error?.code === "23505") {
    const { data: concurrentStudent, error: concurrentStudentError } =
      await supabaseServer
        .from("students")
        .select("*")
        .eq("auth_user_id", request.authUser.id)
        .maybeSingle();
    if (!concurrentStudentError && concurrentStudent) {
      return response.status(200).json({
        student: concurrentStudent,
        profile_completeness: computeProfileCompleteness(
          concurrentStudent,
          "student",
        ),
      });
    }
  }
  if (error)
    return errorResponse(response, error, "Could not create graduate profile");
  response.status(201).json({
    student: data,
    profile_completeness: computeProfileCompleteness(data, "student"),
  });
});

app.post("/api/employers", requireAuth, async (request, response) => {
  const body = request.body;
  const { data: existingEmployer, error: existingEmployerError } =
    await supabaseServer
      .from("employers")
      .select("*")
      .eq("auth_user_id", request.authUser.id)
      .maybeSingle();
  if (existingEmployerError)
    return errorResponse(
      response,
      existingEmployerError,
      "Could not load employer profile",
    );
  if (existingEmployer) {
    return response.status(200).json({
      employer: existingEmployer,
      profile_completeness: computeProfileCompleteness(
        existingEmployer,
        "employer",
      ),
    });
  }
  const contactName = coerceText(
    body.contactPersonName ?? body.contact_person_name,
  );
  const contactParts = contactName?.split(/\s+/) || [];
  const firstName =
    coerceText(body.firstName || body.first_name) || contactParts[0];
  const lastName =
    coerceText(body.lastName || body.last_name) ||
    contactParts.slice(1).join(" ");
  if (!body.email || !body.companyName || !firstName || !lastName) {
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
    body.description ?? body.companyDescription ?? body.company_description,
    body.industry && `Industry: ${body.industry}`,
    body.companySize && `Company size: ${body.companySize}`,
    `Contact: ${firstName} ${lastName}`,
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
      contact_person_name: `${firstName} ${lastName}`.trim(),
      auth_user_id: request.authUser.id,
      contact_email: contactEmail,
      contact_phone: coerceText(body.phone, null),
      company_size: coerceText(body.companySize, null),
      company_description: coerceText(
        body.description ?? body.companyDescription ?? body.company_description,
        null,
      ),
      benefits: normalizeSkills(body.benefits),
      verification_status: "unverified",
    })
    .select()
    .single();

  if (error?.code === "23505") {
    const { data: concurrentEmployer, error: concurrentEmployerError } =
      await supabaseServer
        .from("employers")
        .select("*")
        .eq("auth_user_id", request.authUser.id)
        .maybeSingle();
    if (!concurrentEmployerError && concurrentEmployer) {
      return response.status(200).json({
        employer: concurrentEmployer,
        profile_completeness: computeProfileCompleteness(
          concurrentEmployer,
          "employer",
        ),
      });
    }
  }
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
    let isOwner = false;
    const authorization = request.headers.authorization || "";
    const token = authorization.startsWith("Bearer ")
      ? authorization.slice(7).trim()
      : null;
    if (token) {
      const { data: authData } = await supabaseServer.auth.getUser(token);
      if (authData.user) {
        const { data: employer } = await supabaseServer
          .from("employers")
          .select("id")
          .eq("id", data.employer_id)
          .eq("auth_user_id", authData.user.id)
          .maybeSingle();
        isOwner = Boolean(employer);
      }
    }
    if (!isOwner && !isPublicOpportunity(data)) {
      return response.status(404).json({ error: "Opportunity not found." });
    }
    response.json({ opportunity: data, isOwner });
  } catch (error) {
    errorResponse(response, error, "Could not load opportunity");
  }
});

app.get(
  "/api/opportunities/:opportunityId/candidates",
  async (request, response) => {
    try {
      const opportunity = await getOpportunity(request.params.opportunityId);
      let isOwner = false;
      const authorization = request.headers.authorization || "";
      const token = authorization.startsWith("Bearer ")
        ? authorization.slice(7).trim()
        : null;
      if (token) {
        const { data: authData } = await supabaseServer.auth.getUser(token);
        if (authData.user) {
          const { data: employer } = await supabaseServer
            .from("employers")
            .select("id")
            .eq("id", opportunity.employer_id)
            .eq("auth_user_id", authData.user.id)
            .maybeSingle();
          isOwner = Boolean(employer);
        }
      }
      if (!isOwner && !isPublicOpportunity(opportunity)) {
        return response.status(404).json({ error: "Opportunity not found." });
      }

      if (request.headers.authorization) {
        try {
          const authorization = request.headers.authorization;
          const token = authorization.startsWith("Bearer ")
            ? authorization.slice(7).trim()
            : null;
          if (token) {
            const { data } = await supabaseServer.auth.getUser(token);
            if (data.user) {
              const { data: employer } = await supabaseServer
                .from("employers")
                .select("id")
                .eq("id", opportunity.employer_id)
                .eq("auth_user_id", data.user.id)
                .maybeSingle();
              isOwner = Boolean(employer);
            }
          }
        } catch {
          // Invalid optional credentials simply receive the public applicant view.
        }
      }

      const { data, error } = await supabaseServer
        .from("applications")
        .select(
          "id, student_id, created_at, status, display_order, students(id, full_name, skills, qualification, location, bio)",
        )
        .eq("opportunity_id", opportunity.id)
        .neq("status", "withdrawn")
        .order(isOwner ? "display_order" : "created_at", {
          ascending: true,
          nullsFirst: false,
        })
        .order("created_at", { ascending: true });
      if (error) throw error;

      response.json({
        isOwner,
        candidates: (data || []).map((application) => ({
          applicationId: application.id,
          id: application.students?.id || application.student_id,
          name: application.students?.full_name || "Candidate",
          skills: application.students?.skills || [],
          qualification: application.students?.qualification,
          location: application.students?.location,
          bio: application.students?.bio,
          appliedAt: application.created_at,
          ...(isOwner ? { displayOrder: application.display_order } : {}),
        })),
      });
    } catch (error) {
      errorResponse(response, error, "Could not load opportunity candidates");
    }
  },
);

app.patch(
  "/api/opportunities/:opportunityId/candidates/order",
  requireAuth,
  async (request, response) => {
    try {
      const opportunity = await getOpportunity(request.params.opportunityId);
      await requireOwnedProfile(
        "employers",
        opportunity.employer_id,
        request.authUser.id,
      );
      const candidateIds = request.body?.candidateIds;
      if (
        !Array.isArray(candidateIds) ||
        candidateIds.length !== new Set(candidateIds).size ||
        candidateIds.some((id) => typeof id !== "string")
      ) {
        return response
          .status(422)
          .json({ error: "A candidate order is required." });
      }

      const { data: applications, error: lookupError } = await supabaseServer
        .from("applications")
        .select("id, student_id")
        .eq("opportunity_id", opportunity.id)
        .neq("status", "withdrawn");
      if (lookupError) throw lookupError;
      const applicationByStudent = new Map(
        (applications || []).map((application) => [
          application.student_id,
          application.id,
        ]),
      );
      if (
        candidateIds.length !== applicationByStudent.size ||
        candidateIds.some((id) => !applicationByStudent.has(id))
      ) {
        return response
          .status(422)
          .json({ error: "The candidate order is out of date." });
      }

      const updates = candidateIds.map((studentId, index) =>
        supabaseServer
          .from("applications")
          .update({ display_order: index })
          .eq("id", applicationByStudent.get(studentId)),
      );
      const results = await Promise.all(updates);
      const updateError = results.find((result) => result.error)?.error;
      if (updateError) throw updateError;
      response.json({ saved: true });
    } catch (error) {
      errorResponse(response, error, "Could not save candidate order");
    }
  },
);

app.post(
  "/api/opportunities/:opportunityId/applications",
  requireAuth,
  async (request, response) => {
    try {
      const studentId = request.body?.student_id || request.body?.studentId;
      if (!studentId) {
        return response
          .status(422)
          .json({ error: "A student profile is required to apply." });
      }
      const opportunity = await getOpportunity(request.params.opportunityId);
      if (!isPublicOpportunity(opportunity)) {
        return response
          .status(404)
          .json({ error: "Opportunity is not accepting applications." });
      }
      await getOwnedStudent(studentId, request.authUser.id);
      const { data, error } = await supabaseServer
        .from("applications")
        .insert({
          student_id: studentId,
          opportunity_id: request.params.opportunityId,
          cover_note: coerceText(
            request.body?.cover_note ?? request.body?.coverNote,
            null,
          ),
          status: "submitted",
          updated_at: new Date().toISOString(),
        })
        .select("*, opportunities(title, employer_id)")
        .single();
      if (error) throw error;
      response.status(201).json({ application: data });
    } catch (error) {
      errorResponse(response, error, "Could not submit application");
    }
  },
);

app.get(
  "/api/students/:studentId/applications",
  requireAuth,
  async (request, response) => {
    try {
      await requireOwnedProfile(
        "students",
        request.params.studentId,
        request.authUser.id,
      );
      const { data, error } = await supabaseServer
        .from("applications")
        .select(
          "*, opportunities(title, description, location, type, employers(company_name))",
        )
        .eq("student_id", request.params.studentId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      response.json({ applications: data });
    } catch (error) {
      errorResponse(response, error, "Could not load applications");
    }
  },
);

app.get(
  "/api/employers/:employerId/applications",
  requireAuth,
  async (request, response) => {
    try {
      await requireOwnedProfile(
        "employers",
        request.params.employerId,
        request.authUser.id,
      );
      const { data, error } = await supabaseServer
        .from("applications")
        .select(
          "*, students(id, full_name, email, skills, qualification, location), opportunities!inner(id, title, employer_id)",
        )
        .eq("opportunities.employer_id", request.params.employerId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      response.json({ applications: data });
    } catch (error) {
      errorResponse(response, error, "Could not load employer applications");
    }
  },
);

app.patch(
  "/api/applications/:applicationId",
  requireAuth,
  async (request, response) => {
    try {
      const { data: application, error: lookupError } = await supabaseServer
        .from("applications")
        .select("id, status, opportunities!inner(employer_id)")
        .eq("id", request.params.applicationId)
        .single();
      if (lookupError) throw lookupError;
      await requireOwnedProfile(
        "employers",
        application.opportunities.employer_id,
        request.authUser.id,
      );
      const status = coerceText(request.body?.status, null);
      if (
        ![
          "submitted",
          "reviewing",
          "shortlisted",
          "rejected",
          "withdrawn",
        ].includes(status)
      ) {
        return response
          .status(422)
          .json({ error: "Invalid application status." });
      }
      const { data, error } = await supabaseServer
        .from("applications")
        .update({ status, updated_at: new Date().toISOString() })
        .eq("id", request.params.applicationId)
        .select()
        .single();
      if (error) throw error;
      response.json({ application: data });
    } catch (error) {
      errorResponse(response, error, "Could not update application");
    }
  },
);

app.patch(
  "/api/opportunities/:opportunityId",
  requireAuth,
  async (request, response) => {
    try {
      const current = await getOpportunity(request.params.opportunityId);
      await requireOwnedProfile(
        "employers",
        current.employer_id,
        request.authUser.id,
      );
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
  },
);

app.post(
  "/api/opportunities/:opportunityId/close",
  requireAuth,
  async (request, response) => {
    try {
      const current = await getOpportunity(request.params.opportunityId);
      await requireOwnedProfile(
        "employers",
        current.employer_id,
        request.authUser.id,
      );
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
  requireAuth,
  async (request, response) => {
    try {
      const current = await getOpportunity(request.params.opportunityId);
      await requireOwnedProfile(
        "employers",
        current.employer_id,
        request.authUser.id,
      );
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
  requireAuth,
  async (request, response) => {
    try {
      const owner = await getOpportunity(request.params.opportunityId);
      await requireOwnedProfile(
        "employers",
        owner.employer_id,
        request.authUser.id,
      );
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

app.post("/api/matches/refresh", requireAuth, async (request, response) => {
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
      getOwnedStudent(studentId, request.authUser.id),
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

app.get(
  "/api/students/:studentId/dashboard",
  requireAuth,
  async (request, response) => {
    try {
      // Load the profile and public opportunities concurrently; neither query
      // depends on the other, which reduces dashboard response time.
      const [student, opportunitiesResponse] = await Promise.all([
        getOwnedStudent(request.params.studentId, request.authUser.id),
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
      const studentWithPicture = await withProfilePictureUrl(student);

      response.json({
        student: studentWithPicture,
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
  },
);

app.get(
  "/api/employers/:employerId/opportunities",
  requireAuth,
  async (request, response) => {
    try {
      await getOwnedEmployer(request.params.employerId, request.authUser.id);
      const { data, error } = await supabaseServer
        .from("opportunities")
        .select("*")
        .eq("employer_id", request.params.employerId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      response.json({ opportunities: data || [] });
    } catch (error) {
      errorResponse(response, error, "Could not load employer opportunities");
    }
  },
);

app.get(
  "/api/employers/:employerId/dashboard",
  requireAuth,
  async (request, response) => {
    try {
      // Employer dashboards only use that employer's jobs, while candidate
      // profiles are compared against those jobs to produce ranked matches.
      const [employer, opportunitiesResponse, studentsResponse] =
        await Promise.all([
          getOwnedEmployer(request.params.employerId, request.authUser.id),
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
      const [employerWithPicture, candidatesWithPictures] = await Promise.all([
        withProfilePictureUrl(employer),
        Promise.all(
          candidates.map((candidate) => withProfilePictureUrl(candidate)),
        ),
      ]);

      response.json({
        employer: employerWithPicture,
        opportunities: opportunitiesResponse.data,
        candidates: candidatesWithPictures,
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
  },
);

app.post("/api/opportunities", requireAuth, async (request, response) => {
  const body = request.body || {};
  if (!body.jobTitle && !body.title) {
    return response.status(422).json({ error: "Job title is required." });
  }
  if (!body.description) {
    return response
      .status(422)
      .json({ error: "Opportunity description is required." });
  }
  const employerId = body.employer_id ?? body.employerId;
  if (!employerId) {
    return response.status(422).json({
      error: "An employer profile is required to publish an opportunity.",
    });
  }
  await requireOwnedProfile("employers", employerId, request.authUser.id);

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

  const status = coerceText(body.status, "published");
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
    employer_id: employerId,
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

app.use((request, response) => {
  // Never turn an unknown API request into an HTML page. This keeps frontend
  // JSON parsing errors actionable when a route is misspelled or unavailable.
  if (request.path.startsWith("/api/")) {
    return response.status(404).json({ error: "API route not found." });
  }
  return response.sendFile(path.join(__dirname, "../GraduRat/index.html"));
});

export { app };

if (!process.env.VERCEL) {
  app.listen(port, () =>
    console.log(`GraduRat running at http://localhost:${port}`),
  );
}
