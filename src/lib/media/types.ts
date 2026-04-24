export const MEDIA_SCOPES = ["branding", "drill", "benchmark", "session", "generated"] as const;
export const MEDIA_KINDS = ["image", "video", "thumbnail", "overlay"] as const;

export type MediaScope = (typeof MEDIA_SCOPES)[number];
export type MediaKind = (typeof MEDIA_KINDS)[number];

export type MediaAssetRecord = {
  id: string;
  bucket: string;
  path: string;
  kind: MediaKind;
  scope: MediaScope;
  owner_user_id: string | null;
  title: string | null;
  alt_text: string | null;
  mime_type: string | null;
  file_size_bytes: number | null;
  width: number | null;
  height: number | null;
  duration_ms: number | null;
  display_order: number;
  tags: unknown;
  is_public: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type HomepageBrandingImage = {
  id: string;
  src: string;
  alt: string;
  title: string | null;
  width: number | null;
  height: number | null;
  order: number;
};
