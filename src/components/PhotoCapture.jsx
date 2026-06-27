import { useCallback, useEffect, useRef, useState } from 'react';
import { extractDescriptor } from '../hooks/useFaceMatch';

const CAPTURE_SIZE = 480;

/**
 * PhotoCapture
 * Props:
 *   onDescriptorReady(descriptor, photoDataUrl) – called when a face is detected in the image.
 *   onPhotoSelected(photoDataUrl)               – called whenever a photo is selected, even without a face.
 *   modelsReady                                 – boolean, passed from the parent hook.
 */
export default function PhotoCapture({ onDescriptorReady, onPhotoSelected, modelsReady }) {
  const [mode, setMode] = useState(null); // null | 'upload' | 'camera'
  const [photoDataUrl, setPhotoDataUrl] = useState(null);
  const [faceStatus, setFaceStatus] = useState(null); // null | 'detecting' | 'found' | 'not_found'
  const [cameraError, setCameraError] = useState(null);
  const [isCameraActive, setIsCameraActive] = useState(false);

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const imgRef = useRef(null);

  // Stop camera stream when mode changes
  useEffect(() => {
    if (mode !== 'camera' && streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      setIsCameraActive(false);
    }
  }, [mode]);

  // Start camera stream
  const startCamera = useCallback(async () => {
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: CAPTURE_SIZE }, height: { ideal: CAPTURE_SIZE } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setIsCameraActive(true);
      }
    } catch {
      setCameraError('Could not access camera. Please allow camera permissions or use upload instead.');
    }
  }, []);

  useEffect(() => {
    if (mode === 'camera') {
      setPhotoDataUrl(null);
      setFaceStatus(null);
      startCamera();
    }
  }, [mode, startCamera]);

  // Run face detection on the image element once a photo is chosen
  const runDetection = useCallback(
    async (imgElement) => {
      if (!modelsReady) return;
      setFaceStatus('detecting');
      const descriptor = await extractDescriptor(imgElement);
      if (descriptor) {
        setFaceStatus('found');
        onDescriptorReady?.(descriptor, imgElement.src || imgElement.currentSrc);
      } else {
        setFaceStatus('not_found');
        onDescriptorReady?.(null, imgElement.src || imgElement.currentSrc);
      }
    },
    [modelsReady, onDescriptorReady],
  );

  // Handle file upload
  const handleFileChange = useCallback(
    (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (event) => {
        const dataUrl = event.target.result;
        setPhotoDataUrl(dataUrl);
        setFaceStatus(null);
        onPhotoSelected?.(dataUrl);
      };
      reader.readAsDataURL(file);
    },
    [onPhotoSelected],
  );

  // When preview image loads, run detection
  const handleImgLoad = useCallback(() => {
    if (imgRef.current) {
      runDetection(imgRef.current);
    }
  }, [runDetection]);

  // Capture frame from camera
  const captureFrame = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth || CAPTURE_SIZE;
    canvas.height = video.videoHeight || CAPTURE_SIZE;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
    setPhotoDataUrl(dataUrl);
    setFaceStatus(null);
    onPhotoSelected?.(dataUrl);
    // Stop camera after capture
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      setIsCameraActive(false);
    }
  }, [onPhotoSelected]);

  const reset = useCallback(() => {
    setPhotoDataUrl(null);
    setFaceStatus(null);
    setMode(null);
    onDescriptorReady?.(null, null);
    onPhotoSelected?.(null);
  }, [onDescriptorReady, onPhotoSelected]);

  return (
    <div className="space-y-3">
      {!photoDataUrl && mode === null && (
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setMode('upload')}
            className="flex flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-600 transition hover:border-saffron hover:bg-saffron/5 hover:text-slate-900"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
            </svg>
            Upload photo
          </button>
          <button
            type="button"
            onClick={() => setMode('camera')}
            className="flex flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-600 transition hover:border-saffron hover:bg-saffron/5 hover:text-slate-900"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z" />
            </svg>
            Use camera
          </button>
        </div>
      )}

      {mode === 'upload' && !photoDataUrl && (
        <label className="flex cursor-pointer flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-saffron/40 bg-saffron/5 px-4 py-8 text-sm text-slate-600 transition hover:bg-saffron/10">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-saffron" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
          </svg>
          <span>Click to choose a photo</span>
          <input type="file" accept="image/*" className="sr-only" onChange={handleFileChange} />
        </label>
      )}

      {mode === 'camera' && !photoDataUrl && (
        <div className="space-y-3">
          {cameraError ? (
            <p className="rounded-xl bg-rose-50 px-3 py-2.5 text-xs text-rose-700">{cameraError}</p>
          ) : (
            <div className="relative overflow-hidden rounded-2xl bg-slate-900">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full rounded-2xl"
              />
              {isCameraActive && (
                <button
                  type="button"
                  onClick={captureFrame}
                  className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full border-4 border-white bg-white/20 p-3 backdrop-blur-sm transition hover:bg-white/40"
                  aria-label="Capture photo"
                >
                  <div className="h-8 w-8 rounded-full bg-white" />
                </button>
              )}
            </div>
          )}
          <canvas ref={canvasRef} className="sr-only" />
        </div>
      )}

      {photoDataUrl && (
        <div className="space-y-3">
          <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
            <img
              ref={imgRef}
              src={photoDataUrl}
              alt="Captured"
              className="w-full object-cover"
              onLoad={handleImgLoad}
            />

            {/* Face detection badge */}
            <div className="absolute right-2 top-2">
              {faceStatus === 'detecting' && (
                <span className="flex items-center gap-1.5 rounded-full bg-blue-600/90 px-3 py-1 text-xs font-medium text-white backdrop-blur-sm">
                  <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                  Detecting...
                </span>
              )}
              {faceStatus === 'found' && (
                <span className="flex items-center gap-1.5 rounded-full bg-emerald-600/90 px-3 py-1 text-xs font-medium text-white backdrop-blur-sm">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                  Face detected
                </span>
              )}
              {faceStatus === 'not_found' && (
                <span className="flex items-center gap-1.5 rounded-full bg-amber-500/90 px-3 py-1 text-xs font-medium text-white backdrop-blur-sm">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                  No face found
                </span>
              )}
            </div>
          </div>

          {faceStatus === 'not_found' && (
            <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-700">
              No face was detected. You can still submit — matching won't be available for this report.
            </p>
          )}

          <button
            type="button"
            onClick={reset}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 py-2 text-xs font-medium text-slate-600 transition hover:bg-slate-100"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
            </svg>
            Retake / Change photo
          </button>
        </div>
      )}
    </div>
  );
}
