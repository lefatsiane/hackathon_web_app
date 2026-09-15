(() => {
  const state = { matches: [], role: null };
  const container = document.getElementById("matchesContainer");
  const errorElement = document.getElementById("errorMessage");
  const typeFilter = document.getElementById("matchTypeFilter");
  const searchInput = document.getElementById("matchSearch");

  const escapeHtml = (value) =>
    String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");

  const showError = (message) => {
    errorElement.textContent = message;
    errorElement.style.display = "block";
  };

  const updateStats = (count) => {
    document.getElementById("totalMatches").textContent = count;
    document.getElementById("activeConnections").textContent = count;
    document.getElementById("cvAccess").textContent = "0";
  };

  const formatDate = (value) => {
    if (!value) return "";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString();
  };

  const visibleMatches = () => {
    const type = typeFilter.value;
    const query = searchInput.value.trim().toLowerCase();
    return state.matches.filter((match) => {
      const counterpart = match.counterpart || {};
      const searchable = [
        counterpart.name,
        counterpart.field,
        match.opportunity?.title,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return (
        (type === "all" || counterpart.type === type) &&
        searchable.includes(query)
      );
    });
  };

  const renderEmpty = (message = "No matches yet") => {
    container.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><div class="empty-icon">💙</div><h3>${escapeHtml(message)}</h3><p>Keep exploring Gradurat and connecting with people and opportunities that align with your goals.</p></div>`;
  };

  const render = () => {
    const matches = visibleMatches();
    updateStats(matches.length);
    if (!matches.length) {
      renderEmpty(
        state.matches.length
          ? "No matches fit these filters"
          : "No matches yet",
      );
      return;
    }
    container.replaceChildren();
    matches.forEach((match) => {
      const counterpart = match.counterpart || {};
      const card = document.createElement("article");
      card.className = "match-card";
      card.dataset.matchId = match.id;
      const score =
        match.match_score == null ? "--" : `${escapeHtml(match.match_score)}%`;
      const photo = counterpart.photo
        ? `<img src="${escapeHtml(counterpart.photo)}" alt="${escapeHtml(counterpart.name)}" class="profile-image">`
        : '<div class="profile-placeholder" aria-hidden="true"></div>';
      const advice = match.connection_advice;
      const adviceMarkup = advice
        ? `<div class="connection-advice"><h3>Networking ideas</h3><ul>${(advice.benefits || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>${(advice.prompts || []).length ? `<h3>Conversation starters</h3><ul>${advice.prompts.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : ""}</div>`
        : "";
      card.innerHTML = `
        <div class="profile-top">
          ${photo}
          <div><h3>${escapeHtml(counterpart.name || "Connection")}</h3><div class="profile-type">${escapeHtml(counterpart.type || "Professional connection")}</div></div>
        </div>
        <div class="match-score"><span>Gradurat Match</span><strong>${score}</strong></div>
        <div class="profile-info">
          <p><strong>Opportunity:</strong> ${escapeHtml(match.opportunity?.title || "Connection")}</p>
          ${counterpart.qualification ? `<p><strong>Qualification:</strong> ${escapeHtml(counterpart.qualification)}</p>` : ""}
          ${counterpart.field ? `<p><strong>Field:</strong> ${escapeHtml(counterpart.field)}</p>` : ""}
          <p><strong>Connected:</strong> ${escapeHtml(formatDate(match.matched_at))}</p>
        </div>
        ${adviceMarkup}
        <div class="card-actions">
          <button class="primary-btn view-match" type="button">View Connection</button>
          <button class="secondary-btn disabled-btn" type="button" disabled title="Messaging is reserved for a future release">Message</button>
          <button class="danger-btn delete-match" type="button">Delete</button>
        </div>`;
      container.append(card);
    });
  };

  const loadMatches = async () => {
    try {
      const response = await graduratAuth.apiFetch("/api/matches");
      const payload = await graduratAuth.readJson(
        response,
        "The matches response was not valid JSON.",
      );
      if (!response.ok)
        throw new Error(payload.error || "Unable to load matches.");
      state.matches = payload.matches || [];
      errorElement.style.display = "none";
      render();
    } catch (error) {
      container.innerHTML = "";
      renderEmpty("Matches are unavailable");
      showError(error.message);
    }
  };

  container.addEventListener("click", async (event) => {
    const card = event.target.closest(".match-card");
    if (!card) return;
    const match = state.matches.find(
      (item) => item.id === card.dataset.matchId,
    );
    if (!match) return;

    if (event.target.closest(".view-match")) {
      const counterpart = match.counterpart || {};
      const target =
        counterpart.type === "student"
          ? `candidate.html?id=${encodeURIComponent(counterpart.id)}`
          : `opportunity.html?id=${encodeURIComponent(match.opportunity_id)}`;
      window.location.href = target;
      return;
    }

    const deleteButton = event.target.closest(".delete-match");
    if (!deleteButton) return;
    const name = match.counterpart?.name || "this connection";
    if (
      !window.confirm(
        `Delete your match with ${name}? This will remove it from your matches list.`,
      )
    )
      return;
    deleteButton.disabled = true;
    try {
      const response = await graduratAuth.apiFetch(
        `/api/matches/${encodeURIComponent(match.id)}`,
        { method: "DELETE" },
      );
      const payload = await graduratAuth.readJson(
        response,
        "The delete response was not valid JSON.",
      );
      if (!response.ok)
        throw new Error(payload.error || "Could not delete this match.");
      state.matches = state.matches.filter((item) => item.id !== match.id);
      render();
    } catch (error) {
      deleteButton.disabled = false;
      showError(error.message);
    }
  });

  typeFilter.addEventListener("change", render);
  searchInput.addEventListener("input", render);
  state.role = graduratAuth.getUser()?.role || null;
  loadMatches();
})();
