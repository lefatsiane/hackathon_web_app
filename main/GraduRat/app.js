// This shared browser module keeps form submission and dashboard rendering in
// one dependency-free layer. Plain JavaScript suits the static Express-hosted
// pages and avoids a client build step for this prototype.
const formEndpoints = {
  student: "/api/students",
  employer: "/api/employers",
  opportunity: "/api/opportunities",
};

// API responses are inserted into dashboard markup, so escape dynamic values
// before placing them in innerHTML to prevent stored profile data becoming HTML.
const escapeHtml = (value) =>
  String(value || "").replace(
    /[&<>'"]/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "'": "&#39;",
        '"': "&quot;",
      })[character],
  );

const showMessage = (form, message, isError = false) => {
  let element = form.querySelector("[data-form-message]");
  if (!element) {
    element = document.createElement("p");
    element.dataset.formMessage = "";
    element.setAttribute("role", "status");
    form.querySelector("button[type=submit]").parentElement.before(element);
  }
  element.textContent = message;
  element.style.color = isError ? "#b42318" : "#087443";
};

const submitForm = async (form) => {
  const formType = form.dataset.apiForm;
  const formData = new FormData(form);
  // The current backend accepts JSON. Reject selected files explicitly because
  // converting FormData to JSON cannot transmit binary file contents.
  const file = [...formData.values()].find(
    (value) => value instanceof File && value.name,
  );
  if (file) {
    throw new Error(
      "File uploads are not available yet. Remove the selected file and try again.",
    );
  }
  const payload = Object.fromEntries(formData.entries());
  // Checkboxes can have multiple values, so preserve all selected preferences
  // instead of keeping only the last value returned by Object.fromEntries.
  payload.preferences = formData.getAll("preferences");

  if (formType === "opportunity") {
    // Job creation is linked to the employer created during registration. The
    // browser sends only this public identifier; the service key stays server-side.
    payload.employer_id = localStorage.getItem("graduRatEmployerId");
    if (!payload.employer_id) {
      throw new Error("Register an employer profile before publishing a job.");
    }
  }

  // Send one consistent JSON contract to all three backend form endpoints.
  const response = await graduratAuth.apiFetch(formEndpoints[formType], {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const result = await graduratAuth.readJson(
    response,
    "The server returned an invalid form response.",
  );
  if (!response.ok)
    throw new Error(result.error || "The request could not be completed.");
  return result;
};

document.querySelectorAll("form[data-api-form]").forEach((form) => {
  // Attach behavior only to forms that opt into the API contract; static pages
  // can continue to use ordinary links and markup without extra JavaScript.
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = form.querySelector("button[type=submit]");
    button.disabled = true;
    showMessage(form, "Saving your details...");

    try {
      const result = await submitForm(form);
      // The returned database IDs identify the newly created profile on the next
      // dashboard request and allow employers to publish jobs later.
      if (result.employer)
        localStorage.setItem("graduRatEmployerId", result.employer.id);
      if (result.student)
        localStorage.setItem("graduRatStudentId", result.student.id);
      showMessage(form, "Saved. Redirecting...");
      window.location.href = form.action;
    } catch (error) {
      showMessage(form, error.message, true);
      button.disabled = false;
    }
  });
});

const apiJson = async (url) => {
  // Keep response parsing and HTTP error handling in one place for dashboards.
  const response = await graduratAuth.apiFetch(url);
  const result = await graduratAuth.readJson(
    response,
    "The dashboard response was not valid JSON.",
  );
  if (!response.ok) throw new Error(result.error || "Could not load data.");
  return result;
};

const initials = (name, fallback = "GR") =>
  String(name || fallback)
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

const renderJobCard = (opportunity) => {
  // Build cards from API data instead of trusting the page's placeholder jobs.
  const card = document.createElement("article");
  card.className = "job-card";
  const employerName = opportunity.employers?.company_name || "Employer";
  const score = opportunity.match_score ?? null;
  card.innerHTML = `<div class="company-logo">${escapeHtml(initials(employerName))}</div>
    <div class="job-info"><div class="job-top"><div><h3>${escapeHtml(opportunity.title)}</h3>
    <p>${escapeHtml(employerName)} · ${escapeHtml(opportunity.type || "Opportunity")}</p></div><button class="save" type="button" aria-label="Save job">♡</button></div>
    <div class="tags">${(opportunity.required_skills || []).map((skill) => `<span>${escapeHtml(skill)}</span>`).join("")}</div>
    <p class="match-reasoning">${escapeHtml(opportunity.reasoning || "")}</p>
    <div class="job-bottom"><span>${escapeHtml(opportunity.type || "Opportunity")}</span><span>${escapeHtml(
      opportunity.description
        ?.split("\n")
        .find((line) => line.startsWith("Location:"))
        ?.replace("Location: ", "") || "Location flexible",
    )}</span><strong>${score === null ? "New" : `${score}% Match`}</strong><button class="apply-opportunity" type="button" data-opportunity-id="${escapeHtml(opportunity.id)}">Apply</button></div></div>`;
  return card;
};

const setStat = (label, value) => {
  // Locate stats by their visible labels so this helper works on both dashboards
  // without relying on fragile card indexes.
  const stat = [...document.querySelectorAll(".stat-card")].find((card) =>
    card.querySelector("small")?.textContent.includes(label),
  );
  if (stat) stat.querySelector("strong").textContent = value;
};

const renderGraduateDashboard = async () => {
  const matches = document.querySelector(".matches");
  const studentId = localStorage.getItem("graduRatStudentId");
  // A dashboard without a registered profile has no server identity to query.
  if (!studentId) return;
  const { student, opportunities, stats } = await apiJson(
    `/api/students/${encodeURIComponent(studentId)}/dashboard`,
  );
  matches?.querySelectorAll(".job-card").forEach((card) => card.remove());
  // The backend returns opportunities ranked by deterministic skill overlap.
  if (matches) {
    if (!opportunities.length) {
      matches.insertAdjacentHTML(
        "beforeend",
        '<p class="empty-dashboard-state">No job opportunities are available at this time. Please check back soon.</p>',
      );
    } else {
      opportunities.forEach((opportunity) =>
        matches.append(renderJobCard(opportunity)),
      );
    }
  }
  matches?.addEventListener("click", async (event) => {
    const button = event.target.closest(".apply-opportunity");
    if (!button || button.disabled) return;
    button.disabled = true;
    try {
      const result = await graduratAuth.apiFetch(
        `/api/opportunities/${encodeURIComponent(button.dataset.opportunityId)}/applications`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ student_id: studentId }),
        },
      );
      const payload = await graduratAuth.readJson(
        result,
        "The application response was not valid JSON.",
      );
      if (!result.ok)
        throw new Error(payload.error || "Could not submit application.");
      button.textContent = "Applied";
    } catch (error) {
      button.disabled = false;
      button.textContent = error.message;
    }
  });
  setStat("AI MATCHES", stats.matches);

  const fullName = student.full_name || "Graduate";
  document
    .querySelectorAll(".profile-user h3, .user strong")
    .forEach((element) => {
      element.textContent = fullName;
    });
  document.querySelectorAll(".avatar, .large-avatar").forEach((element) => {
    element.textContent = initials(fullName);
  });
  const skills = document.querySelector(".profile-skills div");
  if (skills) {
    skills.innerHTML = (student.skills || [])
      .map((skill) => `<span>${escapeHtml(skill)}</span>`)
      .join("");
  }
  renderAiFeedback({
    profile: student,
    subjectType: "student",
    target: opportunities[0] || null,
    targetType: "opportunity",
  });
};

const renderCandidateCard = (candidate) => {
  // Candidate content is escaped because names and skills originate in the DB.
  const card = document.createElement("article");
  card.className = "candidate-card";
  card.innerHTML = `<div class="candidate-avatar">${escapeHtml(initials(candidate.full_name))}</div>
    <div class="candidate-info"><div class="candidate-top"><div><h3>${escapeHtml(candidate.full_name || "Graduate")}</h3>
    <p>Graduate profile</p></div><strong class="match">${candidate.match_score}% Match</strong></div>
    <div class="candidate-skills">${(candidate.skills || []).map((skill) => `<span>${escapeHtml(skill)}</span>`).join("")}</div>
    <p class="match-reasoning">${escapeHtml(candidate.reasoning || "")}</p>
    <div class="candidate-bottom"><span>${escapeHtml(candidate.matching_skills?.join(", ") || "Skills developing")}</span><span>Open to work</span><button type="button">View Profile →</button></div></div>`;
  return card;
};

const renderAiFeedback = async ({
  profile,
  subjectType,
  target,
  targetType,
}) => {
  const main = document.querySelector("main");
  if (!main || !profile) return;

  const panel = document.createElement("section");
  panel.className = "card ai-feedback-panel";
  panel.innerHTML = `<div class="section-title"><div><h2>AI career feedback</h2><p>Personal guidance based on the information in this profile.</p></div><span class="ai-feedback-status">Reviewing...</span></div><div class="ai-feedback-content" aria-live="polite">Groq is assessing strengths, gaps, and next steps.</div>`;
  main.insertBefore(
    panel,
    main.firstElementChild?.nextElementSibling || main.firstChild,
  );

  try {
    const result = await graduratAuth.apiFetch("/api/ai/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subjectType,
        subject: profile,
        targetType,
        target,
      }),
    });
    const payload = await graduratAuth.readJson(
      result,
      "The AI feedback response was not valid JSON.",
    );
    if (!result.ok)
      throw new Error(payload.error || "Feedback is unavailable.");
    const assessment = payload.assessment;
    panel.querySelector(".ai-feedback-status").textContent = "Profile guidance";
    panel.querySelector(".ai-feedback-content").innerHTML =
      `<p>${escapeHtml(assessment.summary)}</p>
      <div class="ai-feedback-columns"><div><strong>Strengths</strong><ul>${assessment.strengths.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></div>
      <div><strong>Focus next</strong><ul>${[...assessment.gaps, ...assessment.next_steps].map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></div></div>`;
  } catch (error) {
    panel.querySelector(".ai-feedback-status").textContent = "Unavailable";
    panel.querySelector(".ai-feedback-content").textContent = error.message;
  }
};

const renderEmployerDashboard = async () => {
  const candidatesSection = document.querySelector(
    ".candidates, #candidateContainer",
  );
  if (!candidatesSection) return;
  const employerId = localStorage.getItem("graduRatEmployerId");
  // Employer-scoped data must use the ID saved during employer registration.
  if (!employerId) return;
  const { employer, candidates, stats } = await apiJson(
    `/api/employers/${encodeURIComponent(employerId)}/dashboard`,
  );
  candidatesSection
    .querySelectorAll(".candidate-card")
    .forEach((card) => card.remove());
  candidates
    .filter((candidate) => candidate.match_score >= 50)
    .forEach((candidate) =>
      candidatesSection.append(renderCandidateCard(candidate)),
    );
  setStat("ACTIVE JOBS", stats.active_jobs);
  setStat("AI CANDIDATE MATCHES", stats.candidates);
  const companyName = employer.company_name || "Employer";
  document
    .querySelectorAll(".company-user strong, .company-profile h3")
    .forEach((element) => {
      element.textContent = companyName;
    });
  document
    .querySelectorAll(".company-avatar, .large-company-avatar")
    .forEach((element) => {
      element.textContent = initials(companyName, "CO");
    });
  renderAiFeedback({
    profile: employer,
    subjectType: "employer",
    target: candidates[0] || null,
    targetType: "student",
  });

  const applicationsResult = await apiJson(
    `/api/employers/${encodeURIComponent(employerId)}/applications`,
  );
  const existingApplications = document.querySelector(
    ".application-review-panel",
  );
  existingApplications?.remove();
  const applicationPanel = document.createElement("section");
  applicationPanel.className = "card application-review-panel";
  applicationPanel.innerHTML = `<div class="section-title"><div><h2>Applications</h2><p>Review applicants for your opportunities.</p></div></div>`;
  const list = document.createElement("div");
  if (!applicationsResult.applications.length) {
    list.textContent = "No applications yet.";
  } else {
    applicationsResult.applications.forEach((application) => {
      const row = document.createElement("div");
      row.className = "application-row";
      row.innerHTML = `<strong>${escapeHtml(application.students?.full_name || "Applicant")}</strong><span>${escapeHtml(application.opportunities?.title || "Opportunity")}</span><select aria-label="Application status"><option value="submitted">Submitted</option><option value="reviewing">Reviewing</option><option value="shortlisted">Shortlisted</option><option value="rejected">Rejected</option></select>`;
      const select = row.querySelector("select");
      select.value = application.status;
      select.addEventListener("change", async () => {
        const response = await graduratAuth.apiFetch(
          `/api/applications/${encodeURIComponent(application.id)}`,
          {
            method: "PATCH",
            body: JSON.stringify({ status: select.value }),
          },
        );
        if (!response.ok) select.value = application.status;
        else application.status = select.value;
      });
      list.append(row);
    });
  }
  applicationPanel.append(list);
  document.querySelector("main")?.append(applicationPanel);
};

const setupSearch = () => {
  const input = document.querySelector(".search input");
  if (!input) return;
  // Filter already-rendered cards locally so searching does not issue a request
  // for every keystroke or expose an additional search API surface.
  input.addEventListener("input", () => {
    const query = input.value.trim().toLowerCase();
    document.querySelectorAll(".job-card, .candidate-card").forEach((card) => {
      card.hidden = query && !card.textContent.toLowerCase().includes(query);
    });
  });
};

// Both functions safely no-op on pages where their dashboard markup is absent;
// running them together lets the shared script load on every frontend page.
const feedbackStyles = document.createElement("style");
feedbackStyles.textContent = `.ai-feedback-panel{margin:24px 0}.ai-feedback-status{color:#8ec7ff;font-weight:700}.ai-feedback-content{color:#aeb6c7;line-height:1.6}.ai-feedback-content p{color:#fff}.ai-feedback-columns{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:24px;margin-top:16px}.ai-feedback-columns strong{color:#fff}.ai-feedback-columns ul{margin:8px 0 0;padding-left:20px}.empty-dashboard-state{padding:28px 0;color:#aeb6c7}@media(max-width:700px){.ai-feedback-columns{grid-template-columns:1fr}}`;
document.head.append(feedbackStyles);

Promise.all([renderGraduateDashboard(), renderEmployerDashboard()])
  .catch((error) => console.error(error))
  .finally(setupSearch);
