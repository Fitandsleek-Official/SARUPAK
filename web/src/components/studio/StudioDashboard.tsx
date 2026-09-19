"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import {
  ApiError,
  api,
  getApiBaseUrl,
  getStoredToken,
  setStoredToken,
  verifyExpectedApi,
  type ApiHealthInfo,
  type Project,
} from "@/lib/api";

export function StudioDashboard() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [mode, setMode] = useState<"login" | "register">("login");
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectName, setProjectName] = useState("Untitled Project");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [autosaveNote, setAutosaveNote] = useState<string | null>(null);
  const [apiHealth, setApiHealth] = useState<ApiHealthInfo | null>(null);
  const [apiLinkError, setApiLinkError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const token = getStoredToken();
    if (!token) {
      setUserEmail(null);
      setProjects([]);
      return;
    }
    try {
      const me = await api.me();
      setUserEmail(me.email);
      const list = await api.listProjects();
      setProjects(list);
      setError(null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setStoredToken(null);
        setUserEmail(null);
        setProjects([]);
        return;
      }
      setError(err instanceof Error ? err.message : "Failed to load studio");
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const health = await verifyExpectedApi();
        if (!cancelled) {
          setApiHealth(health);
          setApiLinkError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setApiHealth(null);
          setApiLinkError(
            err instanceof Error ? err.message : "API identity check failed",
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function onAuth(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res =
        mode === "login"
          ? await api.login({ email, password })
          : await api.register({ email, password, displayName });
      setStoredToken(res.accessToken);
      setUserEmail(res.user.email);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Auth failed");
    } finally {
      setBusy(false);
    }
  }

  async function onCreate() {
    setBusy(true);
    setError(null);
    try {
      const project = await api.createProject({
        name: projectName || "Untitled Project",
        width: 1920,
        height: 1080,
      });
      setAutosaveNote(`Created ${project.name}`);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(id: string) {
    if (!window.confirm("Delete this project permanently?")) return;
    setBusy(true);
    try {
      await api.deleteProject(id);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  }

  function logout() {
    setStoredToken(null);
    setUserEmail(null);
    setProjects([]);
  }

  return (
    <main className="studio-shell">
      <header className="studio-header">
        <div>
          <p className="studio-kicker">AI Video Studio · Phase 6</p>
          <h1>SARUPAK Studio</h1>
          <p className="studio-lead">
            CapCut-style editor shell with media, timeline, subtitles, and
            dubbing. Requires a running <code>sarupak-api</code> (local :4003 or
            a deployed API URL).
          </p>
          <p className="studio-lead" style={{ marginTop: "0.35rem", fontSize: "0.85rem" }}>
            API: <code>{getApiBaseUrl()}</code>
            {apiHealth
              ? ` · ${apiHealth.service} v${apiHealth.version ?? "?"}`
              : null}
            {apiLinkError ? (
              <span style={{ color: "crimson", display: "block", marginTop: "0.25rem" }}>
                {apiLinkError}
              </span>
            ) : null}
          </p>
        </div>
        {userEmail ? (
          <div className="studio-user">
            <span>{userEmail}</span>
            <button type="button" onClick={logout}>
              Sign out
            </button>
          </div>
        ) : null}
      </header>

      {error ? (
        <p className="studio-error" role="alert">
          {error}
        </p>
      ) : null}
      {autosaveNote ? <p className="studio-note">{autosaveNote}</p> : null}

      {!userEmail ? (
        <section className="studio-panel">
          <div className="studio-tabs">
            <button
              type="button"
              className={mode === "login" ? "is-active" : ""}
              onClick={() => setMode("login")}
            >
              Sign in
            </button>
            <button
              type="button"
              className={mode === "register" ? "is-active" : ""}
              onClick={() => setMode("register")}
            >
              Register
            </button>
          </div>
          <form className="studio-form" onSubmit={onAuth}>
            {mode === "register" ? (
              <label>
                Display name
                <input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  autoComplete="nickname"
                />
              </label>
            ) : null}
            <label>
              Email
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
              />
            </label>
            <label>
              Password (min 8)
              <input
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={
                  mode === "login" ? "current-password" : "new-password"
                }
              />
            </label>
            <button type="submit" disabled={busy}>
              {busy ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}
            </button>
          </form>
        </section>
      ) : (
        <>
          <section className="studio-panel">
            <h2>New project</h2>
            <div className="studio-row">
              <input
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                aria-label="Project name"
              />
              <button type="button" onClick={onCreate} disabled={busy}>
                Create
              </button>
            </div>
          </section>

          <section className="studio-panel">
            <h2>Your projects</h2>
            {projects.length === 0 ? (
              <p className="studio-empty">No projects yet. Create one above.</p>
            ) : (
              <ul className="studio-list">
                {projects.map((p) => (
                  <li key={p.id}>
                    <div>
                      <Link href={`/studio/${p.id}`}>{p.name}</Link>
                      <span>
                        {p.width}×{p.height} · {p.frameRate} fps · {p.status}
                      </span>
                    </div>
                    <button type="button" onClick={() => onDelete(p.id)}>
                      Delete
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </main>
  );
}
