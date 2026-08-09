"use client";

interface UploadZoneProps {
  onFile: (file: File) => void;
  disabled?: boolean;
}

export function UploadZone({ onFile, disabled }: UploadZoneProps) {
  return (
    <div className="upload-zone">
      <div className="upload-mark" aria-hidden>
        <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
          <rect
            x="6"
            y="10"
            width="36"
            height="28"
            rx="3"
            stroke="currentColor"
            strokeWidth="1.5"
          />
          <circle cx="18" cy="20" r="3" stroke="currentColor" strokeWidth="1.5" />
          <path
            d="M6 32l10-8 8 6 8-10 10 12"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      <h1 className="brand">SARUPAK</h1>
      <p className="upload-lead">
        ដាក់រូប → ជ្រើស Portrait Pro / Garden Bloom → Generate
        (AI បែងចែក subject · skin · ផ្កា · background)
      </p>
      <label className={`btn-primary ${disabled ? "is-disabled" : ""}`}>
        ជ្រើសរូបភាព
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic,image/*"
          hidden
          disabled={disabled}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onFile(file);
            e.target.value = "";
          }}
        />
      </label>
      <p className="upload-hint">
        JPG/PNG — Generate ប្រើ AI segment (subject/skin/ផ្កា) ក្នុង browser
      </p>
    </div>
  );
}
