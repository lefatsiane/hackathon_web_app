const graduratAuth = (() => {
  const SESSION_KEY = "graduRatSession";
  const USER_KEY = "graduratUser";
  const PENDING_PROFILE_KEY = "graduRatPendingProfile";
  let configPromise;

  const readJson = async (response, fallback) => {
    const contentType = response.headers.get("content-type") || "";
    const text = await response.text();
    if (!contentType.includes("application/json")) {
      throw new Error(
        response.ok
          ? "The server returned an unexpected page instead of JSON. Restart the app from the main folder."
          : `Server request failed with status ${response.status}. Restart the app from the main folder.`,
      );
    }
    try {
      return JSON.parse(text);
    } catch {
      throw new Error(fallback);
    }
  };

  const getConfig = async () => {
    configPromise ||= fetch("/api/config").then(async (response) => {
      const config = await readJson(
        response,
        "Supabase configuration was not valid JSON.",
      );
      if (!response.ok)
        throw new Error(config.error || "Supabase is not configured.");
      return config;
    });
    return configPromise;
  };

  const saveSession = (session) => {
    if (session) sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
    else sessionStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(SESSION_KEY);
  };

  const getSession = () => {
    try {
      return JSON.parse(sessionStorage.getItem(SESSION_KEY) || "null");
    } catch {
      return null;
    }
  };

  const saveUser = (user) => {
    if (user) sessionStorage.setItem(USER_KEY, JSON.stringify(user));
    else sessionStorage.removeItem(USER_KEY);
    localStorage.removeItem(USER_KEY);
  };

  const getUser = () => {
    try {
      return JSON.parse(sessionStorage.getItem(USER_KEY) || "null");
    } catch {
      return null;
    }
  };

  const clearAuth = () => {
    saveSession(null);
    saveUser(null);
    sessionStorage.removeItem("graduRatLoggedIn");
    localStorage.removeItem("graduRatLoggedIn");
    sessionStorage.removeItem("graduRatStudentId");
    sessionStorage.removeItem("graduRatEmployerId");
    localStorage.removeItem("graduRatStudentId");
    localStorage.removeItem("graduRatEmployerId");
  };

  const authRequest = async (path, body) => {
    const config = await getConfig();
    const response = await fetch(`${config.supabaseUrl}/auth/v1/${path}`, {
      method: "POST",
      headers: {
        apikey: config.supabasePublishableKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const result = await readJson(
      response,
      "Supabase returned an invalid authentication response.",
    );
    if (path === "signup" && result.user && !result.user.identities?.length) {
      throw new Error(
        "An account with this email already exists. Sign in instead.",
      );
    }
    if (!response.ok)
      throw new Error(
        result.msg ||
          result.error_description ||
          result.message ||
          "Authentication failed.",
      );
    return result;
  };

  const signUp = (email, password) =>
    authRequest("signup", { email, password });
  const signIn = (email, password) =>
    authRequest("token?grant_type=password", { email, password });
  const requestPasswordReset = (email) => authRequest("recover", { email });

  const logoutAllDevices = async () => {
    const session = getSession();
    const config = await getConfig();
    if (session?.access_token) {
      const response = await fetch(
        `${config.supabaseUrl}/auth/v1/logout?scope=global`,
        {
          method: "POST",
          headers: {
            apikey: config.supabasePublishableKey,
            Authorization: `Bearer ${session.access_token}`,
          },
        },
      );
      if (!response.ok) throw new Error("Could not log out of all devices.");
    }
    saveSession(null);
  };

  const updateEmail = async (newEmail) => {
    const session = getSession();
    if (!session?.access_token)
      throw new Error("You must be signed in to change your email.");
    const config = await getConfig();
    const response = await fetch(`${config.supabaseUrl}/auth/v1/user`, {
      method: "PUT",
      headers: {
        apikey: config.supabasePublishableKey,
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email: newEmail }),
    });
    const result = await readJson(
      response,
      "Supabase returned an invalid email-change response.",
    );
    if (!response.ok)
      throw new Error(
        result.msg ||
          result.error_description ||
          result.message ||
          "Could not start the email change.",
      );
    return result;
  };

  const apiFetch = async (url, options = {}) => {
    const session = getSession();
    const headers = new Headers(options.headers || {});
    if (session?.access_token)
      headers.set("Authorization", `Bearer ${session.access_token}`);
    if (options.body && !headers.has("Content-Type"))
      headers.set("Content-Type", "application/json");
    const response = await fetch(url, { ...options, headers });
    if (response.status === 401) saveSession(null);
    return response;
  };

  const setPendingProfile = (profile) =>
    sessionStorage.setItem(PENDING_PROFILE_KEY, JSON.stringify(profile));
  const getPendingProfile = () => {
    try {
      return JSON.parse(sessionStorage.getItem(PENDING_PROFILE_KEY) || "null");
    } catch {
      return null;
    }
  };

  const completePendingProfile = async () => {
    const pending = getPendingProfile();
    if (!pending) return null;
    const response = await apiFetch(pending.endpoint, {
      method: "POST",
      body: JSON.stringify(pending.payload),
    });
    const result = await readJson(
      response,
      "The profile response was not valid JSON.",
    );
    if (!response.ok)
      throw new Error(result.error || "Could not create your profile.");
    sessionStorage.removeItem(PENDING_PROFILE_KEY);
    if (result.student)
      sessionStorage.setItem("graduRatStudentId", result.student.id);
    if (result.employer)
      sessionStorage.setItem("graduRatEmployerId", result.employer.id);
    if (result.lecturer) {
      sessionStorage.setItem("graduRatLecturerId", result.lecturer.id);
      localStorage.setItem("graduRatLecturerId", result.lecturer.id);
    }
    return result;
  };

  return {
    getSession,
    saveSession,
    getUser,
    saveUser,
    clearAuth,
    signUp,
    signIn,
    apiFetch,
    setPendingProfile,
    completePendingProfile,
    readJson,
    requestPasswordReset,
    logoutAllDevices,
    updateEmail,
  };
})();
