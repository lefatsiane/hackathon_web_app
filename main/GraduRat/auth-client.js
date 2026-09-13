const graduratAuth = (() => {
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
    if (session)
      localStorage.setItem("graduRatSession", JSON.stringify(session));
    else localStorage.removeItem("graduRatSession");
  };

  const getSession = () => {
    try {
      return JSON.parse(localStorage.getItem("graduRatSession") || "null");
    } catch {
      return null;
    }
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
    localStorage.setItem("graduRatPendingProfile", JSON.stringify(profile));
  const getPendingProfile = () => {
    try {
      return JSON.parse(
        localStorage.getItem("graduRatPendingProfile") || "null",
      );
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
    localStorage.removeItem("graduRatPendingProfile");
    if (result.student)
      localStorage.setItem("graduRatStudentId", result.student.id);
    if (result.employer)
      localStorage.setItem("graduRatEmployerId", result.employer.id);
    return result;
  };

  return {
    getSession,
    saveSession,
    signUp,
    signIn,
    apiFetch,
    setPendingProfile,
    completePendingProfile,
    readJson,
  };
})();
