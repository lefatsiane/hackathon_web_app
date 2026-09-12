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
  const response = await fetch(formEndpoints[formType], {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const result = await response.json();
  if (!response.ok)
    throw new Error(result.error || "The request could not be completed.");
  return result;
};

document.querySelectorAll("form[data-api-form]").forEach((form) => {
  // Attach behavior only to forms that opt into the API contract; static pages
  can continue to use ordinary links and markup without extra JavaScript.
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
  const response = await fetch(url);
  const result = await response.json();
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
    )}</span><strong>${score === null ? "New" : `${score}% Match`}</strong></div></div>`;
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
  if (!matches) return;
  const studentId = localStorage.getItem("graduRatStudentId");
  // A dashboard without a registered profile has no server identity to query.
  if (!studentId) return;
  const { student, opportunities, stats } = await apiJson(
    `/api/students/${encodeURIComponent(studentId)}/dashboard`,
  );
  matches.querySelectorAll(".job-card").forEach((card) => card.remove());
  // The backend returns opportunities ranked by deterministic skill overlap.
  opportunities.forEach((opportunity) =>
    matches.append(renderJobCard(opportunity)),
  );
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

const renderEmployerDashboard = async () => {
  const candidatesSection = document.querySelector(".candidates");
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

const renderNotificationItem = (notification) => {
  const item = document.createElement("div");
  item.className = `notification-item${notification.is_read ? "" : " unread"}`;
  const jobTitle = notification.opportunities?.title || "";
  item.innerHTML = `<div class="notification-icon match">✦</div>
    <div class="notification-text">
      <p>${escapeHtml(notification.message)}</p>
      <small>${new Date(notification.created_at).toLocaleDateString()}</small>
    </div>`;
  return item;
};

const renderNotifications = async () => {
  const list = document.querySelector("#notificationList");
  if (!list) return;
  const studentId = localStorage.getItem("graduRatStudentId");
  if (!studentId) return;
  const { notifications } = await apiJson(
    `/api/students/${encodeURIComponent(studentId)}/notifications`,
  );
  list.innerHTML = "";
  notifications.forEach((notification) =>
    list.append(renderNotificationItem(notification)),
  );
  const unreadCount = notifications.filter((n) => !n.is_read).length;
  const dot = document.querySelector("#notificationDot");
  if (dot) dot.style.display = unreadCount > 0 ? "block" : "none";
};
// Both functions safely no-op on pages where their dashboard markup is absent;
// running them together lets the shared script load on every frontend page.

//i have commented the following out 
// Promise.all([renderGraduateDashboard(), renderEmployerDashboard()])
//   .catch((error) => console.error(error))
//   .finally(setupSearch);



Promise.all([renderGraduateDashboard(), renderEmployerDashboard(), renderNotifications()])
  .catch((error) => console.error(error))
  .finally(setupSearch);

// Toggle the notification panel open/closed
const notificationBtn = document.getElementById("notificationBtn");
const notificationPanel = document.getElementById("notificationPanel");

notificationBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  notificationPanel.classList.toggle("show");
});

const markAllRead = document.getElementById("markAllRead");
if (markAllRead) {
  markAllRead.addEventListener("click", async (e) => {
    e.preventDefault();
    const studentId = localStorage.getItem("graduRatStudentId");
    if (!studentId) return;
    await fetch(`/api/students/${encodeURIComponent(studentId)}/notifications/mark-read`, {
      method: "POST",
    });
    renderNotifications();
  });
}

// Close it when clicking anywhere else on the page
document.addEventListener("click", (e) => {
  if (!notificationPanel.contains(e.target) && e.target !== notificationBtn) {
    notificationPanel.classList.remove("show");
  }
});



