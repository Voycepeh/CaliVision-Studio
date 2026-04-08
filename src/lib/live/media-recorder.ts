export type ActiveRecorder = {
  recorder: MediaRecorder;
  stop: () => Promise<{ blob: Blob; mimeType: string }>;
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
    stop: () =>
      new Promise((resolve) => {
        recorder.onstop = () => resolve({ blob: new Blob(chunks, { type: mimeType }), mimeType });
        recorder.stop();
      })
  };
}
