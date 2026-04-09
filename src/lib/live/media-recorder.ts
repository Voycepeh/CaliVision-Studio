export type ActiveRecorder = {
  recorder: MediaRecorder;
  stop: (options?: { discard?: boolean }) => Promise<{ blob: Blob; mimeType: string } | null>;
};

export function createMediaRecorder(stream: MediaStream): ActiveRecorder {
  const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9") ? "video/webm;codecs=vp9" : "video/webm";
  const recorder = new MediaRecorder(stream, { mimeType });
  const chunks: BlobPart[] = [];

  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) {
      chunks.push(event.data);
    }
  };

  recorder.start(200);

  return {
    recorder,
    stop: (options) =>
      new Promise((resolve) => {
        if (recorder.state === "inactive") {
          resolve(options?.discard ? null : { blob: new Blob(chunks, { type: mimeType }), mimeType });
          return;
        }

        const timeoutId = setTimeout(() => {
          resolve(options?.discard ? null : { blob: new Blob(chunks, { type: mimeType }), mimeType });
        }, 1500);

        recorder.onstop = () => {
          clearTimeout(timeoutId);
          resolve(options?.discard ? null : { blob: new Blob(chunks, { type: mimeType }), mimeType });
        };

        try {
          recorder.requestData();
        } catch {
          // noop; requestData may throw in some browser states.
        }

        recorder.stop();
      })
  };
}
