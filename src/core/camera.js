// camera.js — start/stop the webcam, honoring the saved camera + mirror settings.
import { getSettings } from './storage.js';

/** Error with a code: DENIED | NOT_FOUND | IN_USE | UNSUPPORTED | UNKNOWN. */
export class CameraError extends Error {
  constructor(message, code = 'UNKNOWN') {
    super(message);
    this.name = 'CameraError';
    this.code = code;
  }
}

function friendly(err) {
  switch (err?.name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return new CameraError('Camera access was blocked. Click the camera icon in the address bar, allow access, then try again.', 'DENIED');
    case 'NotFoundError':
    case 'OverconstrainedError':
      return new CameraError('No camera was found. Plug one in or pick another in Settings.', 'NOT_FOUND');
    case 'NotReadableError':
    case 'AbortError':
      return new CameraError('The camera is busy. Close other apps or tabs using it and retry.', 'IN_USE');
    default:
      return new CameraError(`Could not start the camera (${err?.message || 'unknown error'}).`, 'UNKNOWN');
  }
}

/** Start the webcam into a <video> element. Resolves once frames are playing. */
export async function startCamera(video) {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new CameraError('Camera access needs HTTPS (or localhost) and a modern browser.', 'UNSUPPORTED');
  }
  const { cameraId } = getSettings();
  const base = { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } };

  let stream;
  try {
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { ...base, ...(cameraId ? { deviceId: { exact: cameraId } } : { facingMode: 'user' }) },
        audio: false,
      });
    } catch (err) {
      // Saved camera unplugged? Retry with the default one.
      if (cameraId && err?.name === 'OverconstrainedError') {
        stream = await navigator.mediaDevices.getUserMedia({ video: base, audio: false });
      } else throw err;
    }
  } catch (err) {
    throw friendly(err);
  }

  video.muted = true;
  video.playsInline = true;
  video.srcObject = stream;
  try {
    await video.play();
  } catch (err) {
    stopCamera(video);
    throw friendly(err);
  }
  return stream;
}

/** Stop all tracks and detach the stream. Safe to call twice. */
export function stopCamera(video) {
  const stream = video?.srcObject;
  if (stream?.getTracks) stream.getTracks().forEach((t) => t.stop());
  if (video) video.srcObject = null;
}

/** Toggle the `mirrored` class on a stage element (CSS flips video + overlay together). */
export function applyMirror(stageEl) {
  stageEl.classList.toggle('mirrored', !!getSettings().mirror);
}
