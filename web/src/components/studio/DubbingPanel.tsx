"use client";

import { useEffect, useState } from "react";
import {
  api,
  getApiBaseUrl,
  getStoredToken,
  type DubbingSession,
  type Job,
  type MediaAsset,
  type SubtitleSet,
  type VoiceCharacter,
} from "@/lib/api";

export function DubbingPanel({
  projectId,
  media,
}: {
  projectId: string;
  media: MediaAsset[];
}) {
  const [session, setSession] = useState<DubbingSession | null>(null);
  const [voices, setVoices] = useState<VoiceCharacter[]>([]);
  const [sets, setSets] = useState<SubtitleSet[]>([]);
  const [mediaId, setMediaId] = useState("");
  const [subtitleSetId, setSubtitleSetId] = useState("");
  const [sourceLanguage, setSourceLanguage] = useState("auto");
  const [targetLanguage, setTargetLanguage] = useState("en");
  const [ttsProvider, setTtsProvider] = useState<
    "" | "openai-tts" | "mock" | "sotaka-tts"
  >("");
  const [openaiConfigured, setOpenaiConfigured] = useState(false);
  const [sotakaConfigured, setSotakaConfigured] = useState(false);
  const [providerNote, setProviderNote] = useState("");
  const [khmerClaimed, setKhmerClaimed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mixJob, setMixJob] = useState<Job | null>(null);
  const videos = media.filter((m) => m.kind === "VIDEO");
  const audios = media.filter((m) => m.kind === "AUDIO");

  async function refreshSession(id?: string) {
    const sid = id ?? session?.id;
    if (!sid) return;
    const next = await api.getDubbingSession(projectId, sid);
    setSession(next);
  }

  useEffect(() => {
    void (async () => {
      try {
        const [prov, voiceList, subList, sessions] = await Promise.all([
          api.dubbingProviders(projectId),
          api.dubbingVoices(projectId),
          api.listSubtitles(projectId),
          api.listDubbingSessions(projectId),
        ]);
        setVoices(voiceList);
        setSets(subList);
        setOpenaiConfigured(Boolean(prov.tts.openaiConfigured));
        setSotakaConfigured(Boolean(prov.tts.sotakaConfigured));
        setKhmerClaimed(Boolean(prov.tts.policy?.khmerClaimed));
        const states = (prov.tts.providers ?? [])
          .map((p) => `${p.provider}:${p.state ?? (p.available ? "ok" : "off")}`)
          .join(" · ");
        setProviderNote(
          `TTS ${states || prov.tts.active || "unset"}` +
            (prov.tts.sotakaConfigured ? " · SOTAKA configured" : " · SOTAKA off") +
            (prov.tts.openaiConfigured ? " · OpenAI key configured" : " · OpenAI not configured") +
            ` · Separation: ${prov.separation.active}` +
            (prov.separation.trueIsolation ? " (true isolation)" : " (no true isolation)") +
            ` · Diarization: ${prov.diarization.active}`,
        );
        if (prov.tts.suggestedProvider === "sotaka-tts") {
          setTtsProvider("sotaka-tts");
        } else if (prov.tts.suggestedProvider === "openai-tts") {
          setTtsProvider("openai-tts");
        }
        if (sessions[0]) {
          setSession(sessions[0]);
          const p = sessions[0].ttsProvider;
          if (p === "mock" || p === "openai-tts" || p === "sotaka-tts") {
            setTtsProvider(p);
          }
        }
        if (!mediaId && videos[0]) setMediaId(videos[0].id);
        if (!subtitleSetId && subList[0]) setSubtitleSetId(subList[0].id);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load dubbing");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, media.length]);

  async function onCreate() {
    if (!mediaId) {
      setError("Select a video first.");
      return;
    }
    if (!ttsProvider) {
      setError(
        "Select a TTS provider explicitly (SOTAKA, OpenAI, or Mock). Mock is never used silently.",
      );
      return;
    }
    if (ttsProvider === "openai-tts" && !openaiConfigured) {
      setError(
        "OpenAI TTS is not configured (no API key on server). Choose SOTAKA or Mock.",
      );
      return;
    }
    if (ttsProvider === "sotaka-tts" && !sotakaConfigured) {
      setError(
        "SOTAKA is not configured (set SOTAKA_VOICE_URL on the API). Choose OpenAI or Mock.",
      );
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const created = await api.createDubbingSession(projectId, {
        mediaAssetId: mediaId,
        subtitleSetId: subtitleSetId || undefined,
        targetLanguage,
        sourceLanguage: sourceLanguage === "auto" ? "und" : sourceLanguage,
        ttsProvider,
      });
      setSession(created);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    } finally {
      setBusy(false);
    }
  }

  async function run(action: () => Promise<unknown>) {
    if (!session) return;
    setBusy(true);
    setError(null);
    try {
      await action();
      await refreshSession();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }

  async function onExport() {
    if (!session) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.exportDubbing(projectId, session.id);
      setMixJob(res.job);
      for (let i = 0; i < 90; i++) {
        await new Promise((r) => setTimeout(r, 400));
        const job = await api.getJob(res.jobId);
        setMixJob(job);
        if (job.status === "SUCCEEDED" || job.status === "FAILED") break;
      }
      await refreshSession();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed");
    } finally {
      setBusy(false);
    }
  }

  async function downloadMix() {
    if (!session || !mixJob || mixJob.status !== "SUCCEEDED") return;
    const token = getStoredToken();
    const url = `${getApiBaseUrl()}/projects/${projectId}/dubbing/sessions/${session.id}/export/jobs/${mixJob.id}/download`;
    const res = await fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) {
      setError(`Download failed (${res.status})`);
      return;
    }
    const blob = await res.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `sarupak-dub-${mixJob.id}.mp4`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function previewUrl(mediaAssetId: string) {
    const token = getStoredToken();
    return `${getApiBaseUrl()}/projects/${projectId}/media/${mediaAssetId}/content?token=${encodeURIComponent(token ?? "")}`;
  }

  const activeProvider = (session?.ttsProvider || ttsProvider || "") as
    | ""
    | "openai-tts"
    | "mock"
    | "sotaka-tts";
  const enabledVoices = voices.filter((v) => {
    if (!v.enabled || v.provider === "unavailable") return false;
    const voiceLangOk =
      v.provider === "mock" ||
      v.provider === "sotaka-tts" ||
      v.language === targetLanguage ||
      (targetLanguage === "km" && v.language === "en");
    if (!voiceLangOk) return false;
    if (!activeProvider) return false;
    if (activeProvider === "mock") return v.provider === "mock";
    if (activeProvider === "openai-tts") return v.provider === "openai-tts";
    if (activeProvider === "sotaka-tts") return v.provider === "sotaka-tts";
    return false;
  });

  const speakers =
    session?.speakers?.length
      ? session.speakers
      : [
          { speakerId: "speaker_male", displayName: "Male (manual)" },
          { speakerId: "speaker_female", displayName: "Female (manual)" },
        ];

  return (
    <aside className="editor-subtitles editor-dubbing">
      <h2>Dubbing</h2>
      <p className="studio-empty">{providerNote || "Loading providers…"}</p>

      {!session ? (
        <>
          <label>
            Video
            <select
              value={mediaId}
              onChange={(e) => setMediaId(e.target.value)}
              disabled={busy}
            >
              <option value="">Select…</option>
              {videos.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.originalName}
                </option>
              ))}
            </select>
          </label>
          <label>
            Subtitle set
            <select
              value={subtitleSetId}
              onChange={(e) => setSubtitleSetId(e.target.value)}
              disabled={busy}
            >
              <option value="">None (empty segments)</option>
              {sets.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.language} · {s.segments.length} cues
                </option>
              ))}
            </select>
          </label>
          <label>
            Source spoken language
            <select
              value={sourceLanguage}
              onChange={(e) => setSourceLanguage(e.target.value)}
              disabled={busy}
            >
              <option value="auto">Auto / from subtitles</option>
              <option value="en">English</option>
              <option value="zh">Chinese</option>
              <option value="ja">Japanese</option>
              <option value="km">Khmer</option>
            </select>
          </label>
          <label>
            Target language
            <select
              value={targetLanguage}
              onChange={(e) => setTargetLanguage(e.target.value)}
              disabled={busy}
            >
              <option value="en">English</option>
              <option value="km">
                Khmer{khmerClaimed ? " (SOTAKA)" : " (needs SOTAKA)"}
              </option>
            </select>
          </label>
          <label>
            TTS provider (required)
            <select
              value={ttsProvider}
              onChange={(e) =>
                setTtsProvider(
                  e.target.value as "" | "openai-tts" | "mock" | "sotaka-tts",
                )
              }
              disabled={busy}
            >
              <option value="">Select…</option>
              <option value="sotaka-tts" disabled={!sotakaConfigured}>
                SOTAKA (Khmer clone)
                {sotakaConfigured ? "" : " (not configured)"}
              </option>
              <option value="openai-tts" disabled={!openaiConfigured}>
                OpenAI TTS{openaiConfigured ? "" : " (not configured)"}
              </option>
              <option value="mock">Mock tones (explicit test only)</option>
            </select>
          </label>
          <div className="editor-sub-actions">
            <button
              type="button"
              disabled={busy || !mediaId || !ttsProvider}
              onClick={() => void onCreate()}
            >
              Create dubbing session
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="studio-empty">
            Session {session.status} · mix {session.mixMode} · TTS{" "}
            {session.ttsProvider ?? "unset"}
            {session.extractedAudioMediaId ? " · audio extracted" : ""}
          </p>

          <label>
            TTS provider
            <select
              value={session.ttsProvider ?? ""}
              disabled={busy}
              onChange={(e) => {
                const next = e.target.value as
                  | "openai-tts"
                  | "mock"
                  | "sotaka-tts";
                setTtsProvider(next);
                void run(async () => {
                  await api.updateDubbingSession(projectId, session.id, {
                    ttsProvider: next,
                  });
                });
              }}
            >
              <option value="" disabled>
                Select…
              </option>
              <option value="sotaka-tts" disabled={!sotakaConfigured}>
                SOTAKA (Khmer clone)
                {sotakaConfigured ? "" : " (not configured)"}
              </option>
              <option value="openai-tts" disabled={!openaiConfigured}>
                OpenAI TTS{openaiConfigured ? "" : " (not configured)"}
              </option>
              <option value="mock">Mock tones (explicit)</option>
            </select>
          </label>

          <div className="editor-sub-actions">
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await api.extractDubbingAudio(projectId, session.id);
                })
              }
            >
              Extract audio
            </button>
            <button
              type="button"
              disabled={busy || !session.extractedAudioMediaId}
              onClick={() =>
                void run(async () => {
                  await api.separateDubbingAudio(projectId, session.id);
                })
              }
            >
              Separate
              {session.separation?.available ? " ✓" : " (BGM isolate)"}
            </button>
            <button
              type="button"
              disabled={busy || !session.extractedAudioMediaId}
              onClick={() =>
                void run(async () => {
                  await api.diarizeDubbing(projectId, session.id);
                })
              }
            >
              Diarize
            </button>
            <button
              type="button"
              disabled={busy || enabledVoices.length === 0}
              onClick={() =>
                void run(async () => {
                  const male =
                    enabledVoices.find((v) => v.genderLabel === "male") ??
                    enabledVoices[0]!;
                  const female =
                    enabledVoices.find((v) => v.genderLabel === "female") ??
                    enabledVoices[1] ??
                    male;
                  await api.assignDubbingVoice(projectId, session.id, {
                    speakerId: "speaker_male",
                    voiceCharacterId: male.id,
                  });
                  await api.assignDubbingVoice(projectId, session.id, {
                    speakerId: "speaker_female",
                    voiceCharacterId: female.id,
                  });
                })
              }
            >
              Assign M/F voices
            </button>
            <button
              type="button"
              disabled={busy || !session.ttsProvider}
              onClick={() =>
                void run(async () => {
                  await api.generateDubbingTts(projectId, session.id, {
                    ttsProvider: session.ttsProvider as
                      | "openai-tts"
                      | "mock"
                      | "sotaka-tts",
                  });
                })
              }
            >
              Generate speech
            </button>
            <button type="button" disabled={busy} onClick={() => void onExport()}>
              Mix &amp; export
            </button>
            {mixJob?.status === "SUCCEEDED" ? (
              <button type="button" onClick={() => void downloadMix()}>
                Download
              </button>
            ) : null}
          </div>

          <label>
            Mix mode
            <select
              value={session.mixMode}
              disabled={busy}
              onChange={(e) =>
                void run(async () => {
                  await api.updateDubbingSession(projectId, session.id, {
                    mixMode: e.target.value as DubbingSession["mixMode"],
                  });
                })
              }
            >
              <option value="mix">Mix dubbed + original</option>
              <option value="replace_dialogue">
                Replace dialogue (needs separation)
              </option>
              <option value="dialogue_only">Dialogue only</option>
              <option value="original_only">Original only</option>
            </select>
          </label>

          <label>
            Dialogue volume {session.dialogueVolume.toFixed(2)}
            <input
              type="range"
              min={0}
              max={2}
              step={0.05}
              value={session.dialogueVolume}
              disabled={busy}
              onChange={(e) =>
                void run(async () => {
                  await api.updateDubbingSession(projectId, session.id, {
                    dialogueVolume: Number(e.target.value),
                  });
                })
              }
            />
          </label>
          <label>
            Background volume {session.backgroundVolume.toFixed(2)}
            <input
              type="range"
              min={0}
              max={2}
              step={0.05}
              value={session.backgroundVolume}
              disabled={busy}
              onChange={(e) =>
                void run(async () => {
                  await api.updateDubbingSession(projectId, session.id, {
                    backgroundVolume: Number(e.target.value),
                  });
                })
              }
            />
          </label>

          {speakers.map((sp) => {
            const assignment = session.voiceAssignments.find(
              (a) => a.speakerId === sp.speakerId,
            );
            return (
              <div key={sp.speakerId} className="studio-voice-slot">
                <label>
                  Voice · {sp.displayName}
                  <select
                    disabled={busy || enabledVoices.length === 0}
                    value={assignment?.voiceCharacterId ?? sp.voiceCharacterId ?? ""}
                    onChange={(e) =>
                      void run(async () => {
                        await api.assignDubbingVoice(projectId, session.id, {
                          speakerId: sp.speakerId,
                          voiceCharacterId: e.target.value,
                          referenceMediaAssetId: assignment?.referenceMediaAssetId,
                          referenceText: assignment?.referenceText,
                        });
                      })
                    }
                  >
                    <option value="">Select…</option>
                    {enabledVoices.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name}
                        {v.genderLabel ? ` · ${v.genderLabel}` : ""} ({v.provider})
                      </option>
                    ))}
                  </select>
                </label>
                {activeProvider === "sotaka-tts" ? (
                  <>
                    <label>
                      Clone ref ≤12s ({sp.displayName})
                      <select
                        disabled={busy || !assignment?.voiceCharacterId}
                        value={assignment?.referenceMediaAssetId ?? ""}
                        onChange={(e) =>
                          void run(async () => {
                            if (!assignment?.voiceCharacterId) return;
                            await api.assignDubbingVoice(projectId, session.id, {
                              speakerId: sp.speakerId,
                              voiceCharacterId: assignment.voiceCharacterId,
                              referenceMediaAssetId: e.target.value || undefined,
                              referenceText: assignment.referenceText,
                            });
                          })
                        }
                      >
                        <option value="">Voice design only (no clone)</option>
                        {audios.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.originalName}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Upload clone clip
                      <input
                        type="file"
                        accept="audio/*,.wav,.mp3,.m4a"
                        disabled={busy || !assignment?.voiceCharacterId}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          e.target.value = "";
                          if (!file || !assignment?.voiceCharacterId) return;
                          void run(async () => {
                            const uploaded = await api.uploadMedia(
                              projectId,
                              file,
                            );
                            await api.assignDubbingVoice(projectId, session.id, {
                              speakerId: sp.speakerId,
                              voiceCharacterId: assignment.voiceCharacterId,
                              referenceMediaAssetId: uploaded.id,
                              referenceText: assignment.referenceText,
                            });
                          });
                        }}
                      />
                    </label>
                  </>
                ) : null}
              </div>
            );
          })}

          <p className="studio-note">
            {activeProvider === "sotaka-tts"
              ? "SOTAKA: translate → KM, assign M/F + optional ≤12s clone, Separate (keep BGM), Generate, Mix."
              : "Foley/SFX stay in background when separation is passthrough. Use SOTAKA for Khmer clone + BGM isolate."}
          </p>

          {session.warnings.length > 0 ? (
            <ul className="editor-sub-warnings">
              {session.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          ) : null}

          {session.separation?.warning ? (
            <p className="studio-note">{session.separation.warning}</p>
          ) : null}

          {mixJob ? (
            <p className="studio-note">
              Mix {mixJob.status} · {Math.round(mixJob.progress * 100)}%
              {mixJob.error ? ` — ${mixJob.error}` : ""}
            </p>
          ) : null}

          <ul className="editor-cue-list">
            {session.segments.map((seg) => (
              <li key={seg.id}>
                <p className="studio-empty">
                  {(seg.startMs / 1000).toFixed(2)}s–{(seg.endMs / 1000).toFixed(2)}s ·{" "}
                  {seg.status}
                  {seg.speakerId ? ` · ${seg.speakerId}` : ""}
                </p>
                <label>
                  Speaker (male / female)
                  <select
                    value={seg.speakerId ?? "speaker_male"}
                    disabled={busy}
                    onChange={(e) => {
                      const speakerId = e.target.value;
                      void run(async () => {
                        await api.updateDubbingSession(projectId, session.id, {
                          segments: [{ id: seg.id, speakerId }],
                        });
                      });
                    }}
                  >
                    {speakers.map((sp) => (
                      <option key={sp.speakerId} value={sp.speakerId}>
                        {sp.displayName}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Original
                  <textarea value={seg.sourceText} readOnly rows={2} />
                </label>
                <label>
                  Translated / dub text
                  <textarea
                    value={seg.translatedText}
                    rows={2}
                    disabled={busy}
                    onBlur={(e) => {
                      const text = e.target.value;
                      if (text === seg.translatedText) return;
                      void run(async () => {
                        await api.updateDubbingSession(projectId, session.id, {
                          segments: [{ id: seg.id, translatedText: text }],
                        });
                      });
                    }}
                    onChange={(e) => {
                      setSession({
                        ...session,
                        segments: session.segments.map((s) =>
                          s.id === seg.id
                            ? { ...s, translatedText: e.target.value }
                            : s,
                        ),
                      });
                    }}
                  />
                </label>
                {seg.generatedAudioMediaId ? (
                  <audio
                    controls
                    src={previewUrl(seg.generatedAudioMediaId)}
                    preload="none"
                  />
                ) : null}
                {seg.errorMessage ? (
                  <p className="studio-error">{seg.errorMessage}</p>
                ) : null}
                {seg.warnings?.length ? (
                  <ul className="editor-sub-warnings">
                    {seg.warnings.map((w) => (
                      <li key={w}>{w}</li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ul>

          {session.segments.length === 0 ? (
            <p className="studio-empty">
              No dialogue segments. Generate subtitles first, then create a session
              with that subtitle set.
            </p>
          ) : null}

          <button
            type="button"
            className="studio-back"
            disabled={busy}
            onClick={() => setSession(null)}
          >
            New session…
          </button>
        </>
      )}

      {error ? (
        <p className="studio-error" role="alert">
          {error}
        </p>
      ) : null}
    </aside>
  );
}
