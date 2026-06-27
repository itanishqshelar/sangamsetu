import * as faceapi from 'face-api.js';
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

const MODEL_URL = '/models';
const MATCH_THRESHOLD = 0.5;

let modelsLoaded = false;
let modelsLoading = false;

async function ensureModelsLoaded() {
  if (modelsLoaded) return;
  if (modelsLoading) {
    // Wait for the already-in-progress load
    await new Promise((resolve) => {
      const id = setInterval(() => {
        if (modelsLoaded) {
          clearInterval(id);
          resolve();
        }
      }, 100);
    });
    return;
  }

  modelsLoading = true;
  await Promise.all([
    faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
    faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
    faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
  ]);
  modelsLoaded = true;
  modelsLoading = false;
}

/**
 * Given an HTMLImageElement or HTMLVideoElement, returns a 128-float32 descriptor or null.
 */
export async function extractDescriptor(mediaElement) {
  await ensureModelsLoaded();
  const detection = await faceapi
    .detectSingleFace(mediaElement, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 }))
    .withFaceLandmarks()
    .withFaceDescriptor();
  return detection ? detection.descriptor : null;
}

/**
 * Compare a new descriptor against all existing reports that have a face_embedding stored.
 * Returns an array of matched report objects sorted by similarity (closest first).
 */
async function findMatchingReports(descriptor) {
  const { data, error } = await supabase
    .from('reports')
    .select('report_id, name, report_type, status, reporting_center, reported_at, face_embedding')
    .not('face_embedding', 'is', null)
    .neq('status', 'Reunited');

  if (error || !data?.length) return [];

  const queryVec = Array.from(descriptor);

  const matches = [];

  for (const row of data) {
    let stored;
    try {
      stored = typeof row.face_embedding === 'string'
        ? JSON.parse(row.face_embedding)
        : row.face_embedding;
    } catch {
      continue;
    }

    if (!Array.isArray(stored) || stored.length !== queryVec.length) continue;

    // Euclidean distance
    let sum = 0;
    for (let i = 0; i < queryVec.length; i++) {
      const diff = queryVec[i] - stored[i];
      sum += diff * diff;
    }
    const dist = Math.sqrt(sum);

    if (dist < MATCH_THRESHOLD) {
      matches.push({ ...row, distance: dist });
    }
  }

  matches.sort((a, b) => a.distance - b.distance);
  return matches;
}

/**
 * Hook that manages model loading state and exposes a `matchFace` function.
 */
export function useFaceMatch() {
  const [modelsReady, setModelsReady] = useState(modelsLoaded);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (modelsLoaded) return;
    setIsLoadingModels(true);
    ensureModelsLoaded().then(() => {
      if (mountedRef.current) {
        setModelsReady(true);
        setIsLoadingModels(false);
      }
    });
  }, []);

  const matchFace = useCallback(async (mediaElement) => {
    const descriptor = await extractDescriptor(mediaElement);
    if (!descriptor) return { descriptor: null, matches: [] };
    const matches = await findMatchingReports(descriptor);
    return { descriptor, matches };
  }, []);

  return { modelsReady, isLoadingModels, matchFace };
}
