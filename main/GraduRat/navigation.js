(() => {
  const getIdentity = () => {
    const user = graduratAuth.getUser();
    const role = user?.role;
    const isEmployer = role === "employer";
    const isLecturer = role === "lecturer";
    const profileKey = isEmployer
      ? "graduRatEmployerId"
      : isLecturer
        ? "graduRatLecturerId"
        : "graduRatStudentId";
    const profileId =
      sessionStorage.getItem(profileKey) || localStorage.getItem(profileKey);
    return {
      user,
      role,
      profileId,
      endpoint: isEmployer
        ? "/api/employers/"
        : isLecturer
          ? "/api/lecturers/"
          : "/api/students/",
      dashboard: isEmployer
        ? "employer-dashboard.html"
        : isLecturer
          ? "lecturer-dashboard.html"
          : "dashboard.html",
    };
  };

  const getNavigationLinks = (identity) => {
    const common = [
      ["events.html", "Events"],
      ["messaging.html", "Messages"],
      ["settings.html", "Settings"],
    ];
    if (identity.isEmployer || identity.role === "lecturer") {
      return [["fyp.html", "Find Your People"], ["matches.html", "Matches"], ...common];
    }
    return [
      ["careers.html", "Career Explorer"],
      ["fyp.html", "Find Your People"],
      ["matches.html", "Matches"],
      ...common,
    ];
  };

  const getInitials = (name) =>
    String(name || "Graduate")
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase() || "GR";

  const addStyles = () => {
    if (document.getElementById("gradurat-navigation-styles")) return;
    const style = document.createElement("style");
    style.id = "gradurat-navigation-styles";
    style.textContent = `
      .gradurat-nav-tools{display:flex;align-items:center;gap:16px;margin-left:auto}
      .gradurat-dashboard-link{color:var(--text,inherit);font-weight:700;text-decoration:none;white-space:nowrap}
      .gradurat-dashboard-link:hover{color:var(--blue,#258cff)}
      .gradurat-sign-in-button{display:inline-flex;align-items:center;justify-content:center;padding:10px 18px;border-radius:7px;background:var(--blue,#258cff);color:#fff;font-weight:700;text-decoration:none;white-space:nowrap}
      .gradurat-sign-in-button:hover{background:var(--blue-hover,#1478e8)}
      .gradurat-nav-avatar{width:42px;height:42px;border-radius:50%;display:grid;place-items:center;overflow:hidden;background:var(--blue,#258cff);color:#fff;font-size:12px;font-weight:800;text-decoration:none;border:2px solid var(--blue-border,#258cff)}
      .gradurat-nav-avatar img{width:100%;height:100%;object-fit:cover}
      @media(max-width:700px){.gradurat-nav-tools{gap:10px}.gradurat-dashboard-link{font-size:13px}.gradurat-nav-avatar{width:36px;height:36px}}
    `;
    document.head.append(style);
  };

  const renderAvatar = async (avatar, identity) => {
    const fallbackName = identity.user?.fullName || "Graduate";
    avatar.textContent = getInitials(fallbackName);
    if (!identity.profileId || !graduratAuth.getSession()?.access_token) return;

    try {
      const response = await graduratAuth.apiFetch(
        `${identity.endpoint}${encodeURIComponent(identity.profileId)}`,
      );
      const result = await graduratAuth.readJson(
        response,
        "The profile response was not valid JSON.",
      );
      if (!response.ok) return;
      const profile = result.student || result.employer || result.lecturer;
      const name = profile?.full_name || profile?.company_name || fallbackName;
      avatar.textContent = getInitials(name);
      if (!profile?.profile_picture_url) return;
      const image = document.createElement("img");
      image.src = profile.profile_picture_url;
      image.alt = `${name} profile picture`;
      image.addEventListener("error", () => {
        image.remove();
        avatar.textContent = getInitials(name);
      });
      avatar.replaceChildren(image);
    } catch {
      // Initials remain visible when the profile request is unavailable.
    }
  };

  const setupNotifications = (nav, tools) => {
    const bell = document.createElement("button");
    bell.type = "button";
    bell.className = "gradurat-bell";
    bell.setAttribute("aria-label", "Notifications");
    bell.textContent = "🔔";
    bell.style.cssText =
      "position:relative;background:none;border:none;font-size:18px;cursor:pointer;color:inherit";

    const badge = document.createElement("span");
    badge.style.cssText =
      "position:absolute;top:-4px;right:-6px;background:#e53e3e;color:#fff;border-radius:10px;font-size:10px;font-weight:800;min-width:16px;height:16px;display:none;place-items:center;padding:0 4px";
    bell.append(badge);

    const panel = document.createElement("div");
    panel.style.cssText =
      "position:absolute;right:0;top:56px;width:300px;max-width:80vw;background:var(--card,#0b0f1a);border:1px solid var(--border,#1b2435);border-radius:12px;box-shadow:0 20px 50px rgba(0,0,0,.4);display:none;z-index:1000;overflow:hidden;color:var(--text,inherit)";
    panel.innerHTML = `
      <div style="padding:12px 14px;font-weight:800;border-bottom:1px solid var(--border,#1b2435);display:flex;justify-content:space-between;align-items:center">
        <span>Notifications</span>
        <button type="button" id="markAllRead" style="background:none;border:none;color:var(--blue,#258cff);cursor:pointer;font-size:12px">Mark all read</button>
      </div>
      <div id="notificationList" style="max-height:340px;overflow-y:auto"></div>`;
    nav.style.position = "relative";
    nav.append(panel);
    tools.append(bell);

    const loadNotifications = async () => {
      try {
        const result = await graduratAuth.readJson(
          await graduratAuth.apiFetch("/api/notifications"),
          "Invalid notifications response.",
        );
        const items = result.notifications || [];
        const unread = result.unread || 0;
        badge.textContent = unread || "";
        badge.style.display = unread ? "grid" : "none";
        panel.querySelector("#notificationList").innerHTML = items.length
          ? items
              .map(
                (item) => `
                  <a href="${item.link || "javascript:void(0)"}" style="display:block;padding:12px 14px;border-bottom:1px solid var(--border,#1b2435);text-decoration:none;color:inherit">
                    <div style="font-weight:${item.read ? "400" : "800"};font-size:13px">${String(item.title).replace(/</g, "&lt;")}</div>
                    ${item.body ? `<div style="color:var(--muted-text,#7f899d);font-size:12px;margin-top:3px">${String(item.body).replace(/</g, "&lt;").slice(0, 80)}</div>` : ""}
                    <div style="color:var(--muted-text,#7f899d);font-size:10px;margin-top:4px">${new Date(item.created_at).toLocaleString()}</div>
                  </a>`,
              )
              .join("")
          : '<div style="padding:20px;text-align:center;color:var(--muted-text,#7f899d);font-size:13px">You\'re all caught up!</div>';
      } catch {
        /* server unreachable */
      }
    };

    bell.addEventListener("click", (event) => {
      event.stopPropagation();
      panel.style.display = panel.style.display === "block" ? "none" : "block";
      if (panel.style.display === "block") loadNotifications();
    });
    document.addEventListener("click", (event) => {
      if (!panel.contains(event.target) && !bell.contains(event.target)) {
        panel.style.display = "none";
      }
    });
    panel.querySelector("#markAllRead").addEventListener("click", async () => {
      await graduratAuth.apiFetch("/api/notifications/read-all", { method: "POST" });
      badge.style.display = "none";
      loadNotifications();
    });

    loadNotifications();
    setInterval(loadNotifications, 30000);
  };

  const setupNavigation = () => {
    addStyles();
    document
      .querySelectorAll("nav .logo, nav .brand, footer .brand")
      .forEach((logo) => {
        logo.href = "index.html";
      });

    const nav = document.querySelector("body > nav, body > .navbar");
    if (!nav) return;
    const identity = getIdentity();
    if (
      identity.isEmployer &&
      window.location.pathname.endsWith("/careers.html")
    ) {
      window.location.replace("employer-dashboard.html");
      return;
    }

    let tools = nav.querySelector(".gradurat-nav-tools");
    if (!tools) {
      tools = document.createElement("div");
      tools.className = "gradurat-nav-tools";
      nav.append(tools);
    }
    const isAuthenticated =
      identity.user?.role && graduratAuth.getSession()?.access_token;
    if (!isAuthenticated) {
      const signIn = document.createElement("a");
      signIn.href = "login.html";
      signIn.className = "gradurat-sign-in-button";
      signIn.textContent = "Sign In";
      tools.append(signIn);
      return;
    }

    const navLinks = nav.querySelector(".nav-links");
    if (navLinks) {
      navLinks.replaceChildren();
      const currentPage =
        window.location.pathname.split("/").pop() || "index.html";
      getNavigationLinks(identity).forEach(([href, label]) => {
        const link = document.createElement("a");
        link.href = href;
        link.textContent = label;
        if (href === currentPage) link.className = "active";
        navLinks.append(link);
      });
    }

    let dashboardLink = navLinks?.querySelector(
      'a[href$="dashboard.html"], a[href="employer-dashboard.html"]',
    );
    if (dashboardLink) dashboardLink.remove();

    if (!dashboardLink) dashboardLink = document.createElement("a");
    dashboardLink.href = identity.dashboard;
    dashboardLink.textContent = "Dashboard";
    dashboardLink.className = "gradurat-dashboard-link";
    tools.prepend(dashboardLink);

    const avatar = document.createElement("a");
    avatar.className = "gradurat-nav-avatar";
    avatar.href = "profile.html";
    avatar.setAttribute("aria-label", "Open your profile");
    tools.append(avatar);
    renderAvatar(avatar, identity);

    setupNotifications(nav, tools);
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", setupNavigation);
  } else {
    setupNavigation();
  }
})();
