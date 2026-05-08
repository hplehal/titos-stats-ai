// Direct browser → R2 upload via PUT to a presigned URL. Uses XMLHttpRequest
// because fetch's `body` doesn't expose upload progress in any browser.

export function uploadToR2(
  file: File,
  presignedUrl: string,
  onProgress?: (pct: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", presignedUrl);
    xhr.setRequestHeader("Content-Type", file.type);
    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress((e.loaded / e.total) * 100);
      }
    });
    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`Upload failed: ${xhr.status} ${xhr.statusText}`));
    });
    xhr.addEventListener("error", () => {
      reject(new Error("Network error during upload (likely R2 CORS)."));
    });
    xhr.addEventListener("abort", () => {
      reject(new Error("Upload aborted."));
    });
    xhr.send(file);
  });
}

// Reads the duration of a local video file (in seconds) by mounting it in a
// hidden <video> element. Resolves to null if the file isn't decodable.
export function readVideoDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    const cleanup = () => URL.revokeObjectURL(url);
    video.onloadedmetadata = () => {
      cleanup();
      resolve(Number.isFinite(video.duration) ? video.duration : null);
    };
    video.onerror = () => {
      cleanup();
      resolve(null);
    };
    video.src = url;
  });
}
