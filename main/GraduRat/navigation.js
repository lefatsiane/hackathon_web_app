(() => {
  const getIdentity = () => {
    const user = graduratAuth.getUser();
    const isEmployer = user?.role === "employer";
    const profileKey = isEmployer ? "graduRatEmployerId" : "graduRatStudentId";
    const profileId =
      sessionStorage.getItem(profileKey) || localStorage.getItem(profileKey);
    return {
      user,
      isEmployer,
      profileId,
      endpoint: isEmployer ? "/api/employers/" : "/api/students/",
      dashboard: isEmployer ? "employer-dashboard.html" : "dashboard.html",
    };
  };

  const getNavigationLinks = (identity) =>
    identity.isEmployer
      ? [
          ["opportunities.html", "Opportunities"],
          ["candidate-explorer.html", "Candidate Explorer"],
          ["fyp.html", "Find Your People"],
          ["applications.html", "Applicants"],
          ["matches.html", "Matches"],
          ["settings.html", "Settings"],
        ]
      : [
          ["careers.html", "Career Explorer"],
          ["fyp.html", "Find Your People"],
          ["matches.html", "Matches"],
          ["settings.html", "Settings"],
        ];

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
      const profile = result.student || result.employer;
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
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", setupNavigation);
  } else {
    setupNavigation();
  }
})();
