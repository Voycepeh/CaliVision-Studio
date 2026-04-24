"use client";

import { useEffect, useState, type FormEvent } from "react";

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

  useEffect(() => {
    void loadAssets();
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
              display: "grid",
              gap: "0.65rem",
              alignItems: "start",
              gridTemplateColumns: "minmax(120px, 140px) minmax(220px, 1fr) auto"
            }}
          >
            <div style={{ display: "grid", gap: "0.45rem" }}>
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

            <div style={{ display: "grid", gap: "0.5rem", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
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

            <div style={{ display: "grid", gap: "0.45rem", justifyItems: "start", minWidth: "130px" }}>
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
