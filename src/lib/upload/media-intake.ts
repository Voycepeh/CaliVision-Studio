export type UploadMediaSourceType = "file" | "browser-recording" | "stream";

export type UploadMediaSource = {
  sourceType: UploadMediaSourceType;
  file: File;
  sourceLabel?: string;
};

export type UploadMediaIntake = {
  sourceType: UploadMediaSourceType;
  file: File;
  fileName: string;
  fileSizeBytes: number;
  sourceLabel: string;
};

export function createUploadMediaIntake(source: UploadMediaSource): UploadMediaIntake {
  return {
    sourceType: source.sourceType,
    file: source.file,
    fileName: source.file.name,
    fileSizeBytes: source.file.size,
    sourceLabel: source.sourceLabel ?? (source.sourceType === "browser-recording" ? "Browser camera recording" : "Uploaded file")
  };
}
