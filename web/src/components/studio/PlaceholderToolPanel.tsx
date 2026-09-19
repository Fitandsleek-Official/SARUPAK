"use client";

export function PlaceholderToolPanel({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="studio-placeholder-panel" role="status">
      <h2>{title}</h2>
      <p className="studio-empty">{description}</p>
      <p className="studio-note">Not yet implemented — reserved for a future phase.</p>
    </div>
  );
}
