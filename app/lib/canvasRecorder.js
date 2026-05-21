/** Record canvas + optional audio stream via MediaRecorder (WebM). */

export function pickRecorderMimeType() {
  const types = [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
  ];
  for (let i = 0; i < types.length; i++) {
    if (
      typeof MediaRecorder !== "undefined" &&
      MediaRecorder.isTypeSupported(types[i])
    ) {
      return types[i];
    }
  }
  return "video/webm";
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(function () {
    URL.revokeObjectURL(url);
  }, 8000);
}

/**
 * @param {HTMLCanvasElement} canvas
 * @param {MediaStream | null} audioStream
 * @param {number} fps
 */
export function createCanvasRecorder(canvas, audioStream, fps) {
  if (typeof MediaRecorder === "undefined") {
    throw new Error("MediaRecorder is not supported in this browser.");
  }

  const mimeType = pickRecorderMimeType();
  const videoStream = canvas.captureStream(fps);
  const tracks = [];
  let i;
  const videoTracks = videoStream.getVideoTracks();
  for (i = 0; i < videoTracks.length; i++) {
    tracks.push(videoTracks[i]);
  }
  if (audioStream) {
    const audioTracks = audioStream.getAudioTracks();
    for (i = 0; i < audioTracks.length; i++) {
      tracks.push(audioTracks[i]);
    }
  }

  const stream = new MediaStream(tracks);
  const chunks = [];
  const recorder = new MediaRecorder(stream, {
    mimeType: mimeType,
    videoBitsPerSecond: 8000000,
  });

  return {
    mimeType: mimeType,
    start: function () {
      recorder.ondataavailable = function (e) {
        if (e.data && e.data.size > 0) chunks.push(e.data);
      };
      recorder.start(250);
    },
    stop: function () {
      return new Promise(function (resolve, reject) {
        if (recorder.state === "inactive") {
          resolve(
            new Blob(chunks, {
              type: mimeType.split(";")[0] || "video/webm",
            })
          );
          return;
        }
        recorder.onstop = function () {
          resolve(
            new Blob(chunks, {
              type: mimeType.split(";")[0] || "video/webm",
            })
          );
        };
        recorder.onerror = function () {
          reject(new Error("Recording failed."));
        };
        recorder.stop();
      });
    },
  };
}
