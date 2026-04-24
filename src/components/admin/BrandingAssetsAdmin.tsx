"use client";

import { useEffect, useState, type FormEvent } from "react";
import {
  HOMEPAGE_CAROUSEL_DURATION_DEFAULT_SECONDS,
  HOMEPAGE_CAROUSEL_DURATION_MAX_SECONDS,
  HOMEPAGE_CAROUSEL_DURATION_MIN_SECONDS,
} from "@/lib/media/homepage-carousel-constants";

type ImageDimensions = { width: number; height: number } | null;

type BrandingAsset = {
  id: string;
  title: string | null;
  altText: string | null;
  publicUrl: string;
  displayOrder: number;
  isActive: boolean;
  createdAt: string;
};

export function BrandingAssetsAdmin() {
  const [assets, setAssets] = useState<BrandingAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [title, setTitle] = useState("");
  const [altText, setAltText] = useState("");
  const [displayOrder, setDisplayOrder] = useState("0");
  const [file, setFile] = useState<File | null>(null);
  const [imageDimensions, setImageDimensions] = useState<ImageDimensions>(null);
  const [previewAsset, setPreviewAsset] = useState<BrandingAsset | null>(null);
  const [carouselDurationSecondsInput, setCarouselDurationSecondsInput] = useState(String(HOMEPAGE_CAROUSEL_DURATION_DEFAULT_SECONDS));
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [settingsSuccess, setSettingsSuccess] = useState<string | null>(null);

  async function resolveImageDimensions(selected: File): Promise<ImageDimensions> {
    const objectUrl = URL.createObjectURL(selected);
    try {
      const dimensions = await new Promise<ImageDimensions>((resolve) => {
        const image = new Image();
        image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
        image.onerror = () => resolve(null);
        image.src = objectUrl;
      });
      return dimensions;
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }

  async function loadAssets(): Promise<void> {
    setLoading(true);
    setError(null);
    const response = await fetch("/api/admin/media/branding", { cache: "no-store" });
    const payload = (await response.json().catch(() => ({}))) as { assets?: BrandingAsset[]; error?: string };
    if (!response.ok) {
      setError(payload.error ?? "Failed to load branding assets.");
      setAssets([]);
      setLoading(false);
      return;
    }

    setAssets(payload.assets ?? []);
    setLoading(false);
  }

  async function loadCarouselSettings(): Promise<void> {
    setLoadingSettings(true);
    setSettingsError(null);
    const response = await fetch("/api/admin/media/branding/settings", { cache: "no-store" });
    const payload = (await response.json().catch(() => ({}))) as { seconds?: number; error?: string };
    if (!response.ok) {
      setSettingsError(payload.error ?? "Failed to load homepage carousel settings.");
      setLoadingSettings(false);
      return;
    }
    setCarouselDurationSecondsInput(String(payload.seconds ?? HOMEPAGE_CAROUSEL_DURATION_DEFAULT_SECONDS));
    setLoadingSettings(false);
  }

  useEffect(() => {
    void Promise.all([loadAssets(), loadCarouselSettings()]);
  }, []);

  async function onUpload(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!file) {
      setError("Choose an image file before uploading.");
      return;
    }

    setUploading(true);
    setError(null);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("title", title);
    formData.append("altText", altText);
    formData.append("displayOrder", displayOrder);
    if (imageDimensions?.width && imageDimensions?.height) {
      formData.append("width", String(imageDimensions.width));
      formData.append("height", String(imageDimensions.height));
    }

    const response = await fetch("/api/admin/media/branding", {
      method: "POST",
      body: formData
    });
    const payload = (await response.json().catch(() => ({}))) as { error?: string };

    if (!response.ok) {
      setError(payload.error ?? "Failed to upload branding image.");
      setUploading(false);
      return;
    }

    setFile(null);
    setTitle("");
    setAltText("");
    setDisplayOrder("0");
    setImageDimensions(null);
    const fileInput = document.getElementById("branding-upload-file") as HTMLInputElement | null;
    if (fileInput) fileInput.value = "";
    setUploading(false);
    await loadAssets();
  }

  async function onSaveCarouselSettings(): Promise<void> {
    setSettingsError(null);
    setSettingsSuccess(null);
    const parsed = Number.parseFloat(carouselDurationSecondsInput);
    if (!Number.isFinite(parsed)) {
      setSettingsError("Enter a valid number of seconds.");
      return;
    }
    const rounded = Math.round(parsed);
    if (rounded < HOMEPAGE_CAROUSEL_DURATION_MIN_SECONDS || rounded > HOMEPAGE_CAROUSEL_DURATION_MAX_SECONDS) {
      setSettingsError(`Duration must be between ${HOMEPAGE_CAROUSEL_DURATION_MIN_SECONDS} and ${HOMEPAGE_CAROUSEL_DURATION_MAX_SECONDS} seconds.`);
      return;
    }

    setSavingSettings(true);
    const response = await fetch("/api/admin/media/branding/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ seconds: rounded })
    });
    const payload = (await response.json().catch(() => ({}))) as { seconds?: number; error?: string };
    setSavingSettings(false);

    if (!response.ok) {
      setSettingsError(payload.error ?? "Failed to save homepage carousel settings.");
      return;
    }

    const savedSeconds = payload.seconds ?? rounded;
    setCarouselDurationSecondsInput(String(savedSeconds));
    setSettingsSuccess("Homepage carousel duration saved.");
  }

  async function onSaveAsset(asset: BrandingAsset): Promise<void> {
    const response = await fetch(`/api/admin/media/branding/${encodeURIComponent(asset.id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: asset.title,
        altText: asset.altText,
        displayOrder: asset.displayOrder,
        isActive: asset.isActive
      })
    });

    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    if (!response.ok) {
      setError(payload.error ?? "Failed to update branding image.");
      return;
    }

    await loadAssets();
  }

  async function onDeleteAsset(assetId: string): Promise<void> {
    const confirmed = window.confirm("Delete this branding image?");
    if (!confirmed) return;

    const response = await fetch(`/api/admin/media/branding/${encodeURIComponent(assetId)}`, {
      method: "DELETE"
    });
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    if (!response.ok) {
      setError(payload.error ?? "Failed to delete branding image.");
      return;
    }

    await loadAssets();
  }

  return (
    <section className="card" style={{ display: "grid", gap: "0.85rem" }}>
      <header>
        <h2 style={{ margin: 0, fontSize: "1.1rem" }}>Homepage branding images</h2>
        <p className="muted" style={{ margin: "0.35rem 0 0" }}>
          Upload, reorder, and manage Supabase-backed homepage carousel images.
        </p>
      </header>

      <section style={statusPanelStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: "0.6rem", flexWrap: "wrap", alignItems: "center" }}>
          <strong style={{ fontSize: "0.95rem" }}>Homepage Carousel Settings</strong>
          {loadingSettings ? <span className="muted">Loading settings…</span> : null}
        </div>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
          <label style={{ display: "grid", gap: "0.25rem", minWidth: "210px" }}>
            <span className="muted" style={{ fontSize: "0.82rem" }}>Auto-advance duration (seconds)</span>
            <input
              value={carouselDurationSecondsInput}
              onChange={(event) => setCarouselDurationSecondsInput(event.target.value)}
              inputMode="numeric"
              style={inputStyle}
              disabled={loadingSettings || savingSettings}
            />
          </label>
          <button type="button" className="pill" disabled={loadingSettings || savingSettings} onClick={() => void onSaveCarouselSettings()}>
            {savingSettings ? "Saving…" : "Save"}
          </button>
        </div>
        <p className="muted" style={{ margin: 0, fontSize: "0.82rem" }}>
          Allowed range: {HOMEPAGE_CAROUSEL_DURATION_MIN_SECONDS} to {HOMEPAGE_CAROUSEL_DURATION_MAX_SECONDS} seconds.
        </p>
        {settingsError ? <p role="alert" style={{ margin: 0, color: "#f3b8b8" }}>{settingsError}</p> : null}
        {settingsSuccess ? <p style={{ margin: 0, color: "#b9e7c8" }}>{settingsSuccess}</p> : null}
      </section>

      <form onSubmit={onUpload} style={{ display: "grid", gap: "0.55rem", padding: "0.75rem", border: "1px solid var(--border)", borderRadius: "0.8rem" }}>
        <strong style={{ fontSize: "0.95rem" }}>Upload new branding image</strong>
        <div style={{ display: "grid", gap: "0.5rem", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
          <input
            id="branding-upload-file"
            type="file"
            accept="image/*"
            onChange={(event) => {
              const selected = event.target.files?.[0] ?? null;
              setFile(selected);
              if (!selected) {
                setImageDimensions(null);
                return;
              }
              void resolveImageDimensions(selected).then((dimensions) => setImageDimensions(dimensions));
            }}
            style={inputStyle}
            disabled={uploading}
          />
          <input placeholder="Title (optional)" value={title} onChange={(event) => setTitle(event.target.value)} style={inputStyle} />
          <input placeholder="Alt text (optional)" value={altText} onChange={(event) => setAltText(event.target.value)} style={inputStyle} />
          <input
            placeholder="Sort order"
            value={displayOrder}
            onChange={(event) => setDisplayOrder(event.target.value)}
            inputMode="numeric"
            style={inputStyle}
          />
        </div>
        {imageDimensions ? (
          <p className="muted" style={{ margin: 0 }}>
            Detected image size: {imageDimensions.width} × {imageDimensions.height}
          </p>
        ) : null}
        <div style={{ display: "flex", gap: "0.45rem", flexWrap: "wrap" }}>
          <button type="submit" className="pill" disabled={uploading}>{uploading ? "Uploading…" : "Upload branding image"}</button>
          <button type="button" className="pill" onClick={() => void loadAssets()} disabled={loading}>Refresh</button>
        </div>
      </form>

      {error ? <p role="alert" style={{ margin: 0, color: "#f3b8b8" }}>{error}</p> : null}
      {loading ? (
        <div style={statusPanelStyle}>
          <p className="muted" style={{ margin: 0 }}>Loading branding assets…</p>
        </div>
      ) : null}

      {!loading && assets.length === 0 ? (
        <div style={statusPanelStyle}>
          <p className="muted" style={{ margin: 0 }}>No branding images uploaded yet.</p>
          <p className="muted" style={{ margin: 0, fontSize: "0.9rem" }}>Upload an image above to add it to the homepage carousel list.</p>
        </div>
      ) : null}

      {!loading && assets.length > 0 ? (
        <h3 style={{ margin: "0.15rem 0 0", fontSize: "1rem" }}>Homepage Branding Images</h3>
      ) : null}

      <div style={{ display: "grid", gap: "0.55rem" }}>
        {assets.map((asset) => (
          <article
            key={asset.id}
            className="card"
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "0.65rem",
              alignItems: "flex-start"
            }}
          >
            <div style={{ display: "grid", gap: "0.45rem", flex: "0 1 140px", minWidth: "120px" }}>
              <button
                type="button"
                onClick={() => setPreviewAsset(asset)}
                style={{
                  display: "block",
                  padding: 0,
                  border: "1px solid var(--border)",
                  borderRadius: "0.65rem",
                  overflow: "hidden",
                  background: "transparent",
                  cursor: "pointer"
                }}
                aria-label={`Preview ${asset.title ?? "branding image"}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={asset.publicUrl}
                  alt={asset.altText ?? asset.title ?? "Branding image"}
                  style={{ width: "100%", height: "120px", objectFit: "contain", background: "#06080f" }}
                />
              </button>
              <button type="button" className="pill" onClick={() => setPreviewAsset(asset)}>Preview</button>
            </div>

            <div style={{ display: "grid", gap: "0.5rem", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", flex: "1 1 320px", minWidth: "220px" }}>
              <label style={{ display: "grid", gap: "0.25rem" }}>
                <span className="muted" style={{ fontSize: "0.8rem" }}>Title</span>
                <input
                  value={asset.title ?? ""}
                  onChange={(event) => setAssets((current) => current.map((row) => (row.id === asset.id ? { ...row, title: event.target.value } : row)))}
                  placeholder="Title"
                  style={inputStyle}
                />
              </label>
              <label style={{ display: "grid", gap: "0.25rem" }}>
                <span className="muted" style={{ fontSize: "0.8rem" }}>Alt text</span>
                <input
                  value={asset.altText ?? ""}
                  onChange={(event) => setAssets((current) => current.map((row) => (row.id === asset.id ? { ...row, altText: event.target.value } : row)))}
                  placeholder="Alt text"
                  style={inputStyle}
                />
              </label>
              <label style={{ display: "grid", gap: "0.25rem" }}>
                <span className="muted" style={{ fontSize: "0.8rem" }}>Sort order</span>
                <input
                  value={String(asset.displayOrder)}
                  onChange={(event) => {
                    const parsed = Number.parseInt(event.target.value, 10);
                    setAssets((current) => current.map((row) => (row.id === asset.id ? { ...row, displayOrder: Number.isFinite(parsed) ? parsed : 0 } : row)));
                  }}
                  inputMode="numeric"
                  style={inputStyle}
                />
              </label>
            </div>

            <div style={{ display: "grid", gap: "0.45rem", justifyItems: "start", flex: "1 1 180px", minWidth: "160px" }}>
              <label className="muted" style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}>
                <input
                  type="checkbox"
                  checked={asset.isActive}
                  onChange={(event) => setAssets((current) => current.map((row) => (row.id === asset.id ? { ...row, isActive: event.target.checked } : row)))}
                />
                Active on homepage
              </label>
              <button type="button" className="pill" onClick={() => void onSaveAsset(asset)}>Save</button>
              <button type="button" className="pill" onClick={() => void onDeleteAsset(asset.id)}>Delete</button>
            </div>
          </article>
        ))}
      </div>

      {previewAsset ? (
        <div
          role="presentation"
          onClick={() => setPreviewAsset(null)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 90,
            background: "rgba(2, 5, 12, 0.84)",
            display: "grid",
            placeItems: "center",
            padding: "1rem"
          }}
        >
          <dialog
            open
            aria-label="Branding image preview"
            onClick={(event) => event.stopPropagation()}
            style={{
              margin: 0,
              border: "1px solid var(--border)",
              borderRadius: "0.9rem",
              background: "var(--panel)",
              color: "var(--text)",
              width: "min(92vw, 920px)",
              maxHeight: "90vh",
              padding: "0.9rem",
              display: "grid",
              gap: "0.65rem"
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: "0.65rem", alignItems: "center" }}>
              <strong style={{ fontSize: "1rem", overflowWrap: "anywhere" }}>{previewAsset.title?.trim() || "Branding image preview"}</strong>
              <button type="button" className="pill" onClick={() => setPreviewAsset(null)}>Close</button>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewAsset.publicUrl}
              alt={previewAsset.altText ?? previewAsset.title ?? "Branding image"}
              style={{ width: "100%", maxHeight: "72vh", objectFit: "contain", background: "#06080f", borderRadius: "0.55rem" }}
            />
          </dialog>
        </div>
      ) : null}
    </section>
  );
}

const inputStyle = {
  border: "1px solid var(--border)",
  borderRadius: "0.65rem",
  background: "var(--panel)",
  color: "var(--text)",
  padding: "0.5rem 0.65rem"
} as const;

const statusPanelStyle = {
  padding: "0.7rem 0.8rem",
  borderRadius: "0.7rem",
  border: "1px dashed var(--border)",
  background: "rgba(10, 15, 26, 0.55)",
  display: "grid",
  gap: "0.3rem"
} as const;
