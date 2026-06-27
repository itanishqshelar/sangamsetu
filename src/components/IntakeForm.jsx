import { useCallback, useEffect, useRef, useState } from 'react';
import { useCenter } from '../context/CenterContext';
import { supabase } from '../lib/supabaseClient';
import PhotoCapture from './PhotoCapture';
import { useFaceMatch } from '../hooks/useFaceMatch';

const initialFormState = {
  report_type: 'missing',
  name: '',
  gender: '',
  age_band: '',
  language: '',
  last_seen_location: '',
  reporter_mobile: '',
  physical_description: '',
  remarks: '',
};

const genders = ['Male', 'Female', 'Unknown'];
const ageBands = ['0-12', '13-17', '18-40', '41-60', '61-70', '71-80', '80+'];

function formatDate(iso) {
  if (!iso) return 'Unknown date';
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function IntakeForm() {
  const { selectedCenter } = useCenter();
  const [formData, setFormData] = useState(initialFormState);
  const [locations, setLocations] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Photo + face matching state
  const [photoDataUrl, setPhotoDataUrl] = useState(null);
  const [faceDescriptor, setFaceDescriptor] = useState(null);
  const [isFaceMatching, setIsFaceMatching] = useState(false);
  const [matchedReports, setMatchedReports] = useState(null); // null = not checked yet, [] = checked no match
  const [confirmedDuplicate, setConfirmedDuplicate] = useState(false);

  const { modelsReady, isLoadingModels, matchFace } = useFaceMatch();
  const matchImgRef = useRef(null);
  const searchTimerRef = useRef(null);

  const [missingSearchTerm, setMissingSearchTerm] = useState('');
  const [missingSearchResults, setMissingSearchResults] = useState([]);
  const [isSearchingMissing, setIsSearchingMissing] = useState(false);
  const [selectedMissingPerson, setSelectedMissingPerson] = useState(null);

  // AI Voice and auto-fill states
  const [isListening, setIsListening] = useState(false);
  const [dictationText, setDictationText] = useState('');
  const [speechLang, setSpeechLang] = useState('hi-IN');
  const [isAiProcessing, setIsAiProcessing] = useState(false);
  const [aiError, setAiError] = useState('');
  const [highlightedFields, setHighlightedFields] = useState([]);
  const recognitionRef = useRef(null);

  useEffect(() => {
    if (formData.report_type !== 'found' || missingSearchTerm.trim().length < 2) {
      setMissingSearchResults([]);
      return;
    }

    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    
    searchTimerRef.current = setTimeout(async () => {
      setIsSearchingMissing(true);
      const term = missingSearchTerm.trim();
      
      const { data } = await supabase
        .from('reports')
        .select('*')
        .eq('report_type', 'missing')
        .neq('status', 'Reunited')
        .or(`name.ilike.%${term}%,physical_description.ilike.%${term}%,remarks.ilike.%${term}%`)
        .limit(5);
        
      setMissingSearchResults(data || []);
      setIsSearchingMissing(false);
    }, 400);

    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [missingSearchTerm, formData.report_type]);

  function handleSelectMissing(person) {
    setSelectedMissingPerson(person);
    setMissingSearchTerm('');
    setMissingSearchResults([]);
  }

  useEffect(() => {
    let isMounted = true;
    async function loadLocations() {
      setIsLoading(true);
      const { data, error: fetchError } = await supabase
        .from('last_seen_location_lookup')
        .select('location_name')
        .order('location_name', { ascending: true });
      if (!isMounted) return;
      if (fetchError) {
        setError(fetchError.message);
        setLocations([]);
      } else {
        setLocations(data?.map((entry) => entry.location_name) ?? []);
      }
      setIsLoading(false);
    }
    loadLocations();
    return () => { isMounted = false; };
  }, []);

  // Cleanup speech recognition on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, []);

  const startListening = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert('Speech recognition is not supported in this browser. Try Chrome or Edge.');
      return;
    }

    const rec = new SpeechRecognition();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = speechLang;

    rec.onresult = (event) => {
      let finalTranscript = '';
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        }
      }
      if (finalTranscript) {
        setDictationText((prev) => {
          const space = prev.endsWith(' ') || prev === '' ? '' : ' ';
          return prev + space + finalTranscript;
        });
      }
    };

    rec.onerror = (event) => {
      console.error('Speech recognition error:', event);
      if (event.error !== 'no-speech') {
        setAiError(`Voice recognition: ${event.error}`);
        setIsListening(false);
      }
    };

    rec.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current = rec;
    rec.start();
    setIsListening(true);
  };

  const stopListening = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    setIsListening(false);
  };

  const toggleListening = () => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  };

  const handleAiAutoFill = async () => {
    const apiKey = import.meta.env.VITE_GROQ_API_KEY;
    if (!apiKey || apiKey === 'your-groq-api-key') {
      setAiError('Groq API Key is missing. Please configure VITE_GROQ_API_KEY in your .env file.');
      return;
    }
    if (!dictationText.trim()) {
      setAiError('Please enter or dictate some text first.');
      return;
    }

    setIsAiProcessing(true);
    setAiError('');

    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'llama-3.1-8b-instant',
          messages: [
            {
              role: 'system',
              content: `You are an AI assistant for SangamSetu, a missing and found person locator app at Kumbh Mela.
Analyze the user's voice dictation/text description of a missing or found person, and extract the details as a JSON object.

The allowed locations list is:
${JSON.stringify(locations)}

The output MUST be a JSON object with these EXACT keys:
{
  "name": string or null (extract name if mentioned, e.g., "Ramesh" or "Rahul"),
  "gender": "Male" | "Female" | "Unknown" | null (map to one of these three exact strings),
  "age_band": "0-12" | "13-17" | "18-40" | "41-60" | "61-70" | "71-80" | "80+" | null (map to the best fitting band),
  "language": string or null (primary language spoken, e.g., "Hindi", "Marathi", "English", "Tamil"),
  "last_seen_location": string or null (MUST match one of the allowed locations in the list exactly, e.g. "Ramkund Ghat". If not mentioned or not in the list, return null),
  "reporter_mobile": string or null (extract 10-digit mobile number if mentioned),
  "physical_description": string or null (extract details about clothing, height, hair, physical markings),
  "remarks": string or null (any additional context or comments)
}

Do not include any explanation or additional text outside of the JSON object. Return ONLY the JSON object.`
            },
            {
              role: 'user',
              content: dictationText,
            }
          ],
          response_format: { type: 'json_object' }
        })
      });

      if (!response.ok) {
        throw new Error(`Groq API returned status ${response.status}`);
      }

      const result = await response.json();
      const parsedData = JSON.parse(result.choices[0].message.content);

      // Apply parsed fields to form
      const updatedFields = [];
      setFormData((prev) => {
        const next = { ...prev };
        Object.keys(parsedData).forEach((key) => {
          if (parsedData[key] !== undefined && parsedData[key] !== null) {
            next[key] = parsedData[key];
            updatedFields.push(key);
          }
        });
        return next;
      });

      // Highlight fields that were auto-filled
      setHighlightedFields(updatedFields);
      setTimeout(() => {
        setHighlightedFields([]);
      }, 4000);

    } catch (err) {
      console.error(err);
      setAiError(err.message || 'Failed to analyze text with AI.');
    } finally {
      setIsAiProcessing(false);
    }
  };

  function handleChange(event) {
    const { name, value } = event.target;
    setFormData((current) => ({ ...current, [name]: value }));
    setError('');
    setSuccessMessage('');
  }

  // Called by PhotoCapture when a face descriptor is available
  const handleDescriptorReady = useCallback(async (descriptor, dataUrl) => {
    setFaceDescriptor(descriptor);
    setMatchedReports(null);
    setConfirmedDuplicate(false);

    if (!descriptor) return;

    // Run matching immediately once we have a descriptor
    setIsFaceMatching(true);
    try {
      // We need an img element to pass to matchFace
      const img = new window.Image();
      img.src = dataUrl;
      await new Promise((res) => { img.onload = res; });
      const { matches } = await matchFace(img);
      setMatchedReports(matches);
    } catch {
      setMatchedReports([]);
    } finally {
      setIsFaceMatching(false);
    }
  }, [matchFace]);

  const handlePhotoSelected = useCallback((dataUrl) => {
    setPhotoDataUrl(dataUrl);
    if (!dataUrl) {
      setFaceDescriptor(null);
      setMatchedReports(null);
      setConfirmedDuplicate(false);
    }
  }, []);

  async function handleSubmit(event) {
    event.preventDefault();

    if (!selectedCenter) {
      setError('Choose a reporting center before submitting a report.');
      return;
    }

    setIsSubmitting(true);
    setError('');
    setSuccessMessage('');

    if (selectedMissingPerson) {
      if (!formData.last_seen_location) {
        setError('Please specify where this person was found.');
        setIsSubmitting(false);
        return;
      }
      
      const newRemarks = [
        selectedMissingPerson.remarks,
        `Found at: ${formData.last_seen_location} (Reported by center: ${selectedCenter})`,
        formData.remarks ? `Additional remarks: ${formData.remarks}` : null
      ].filter(Boolean).join('\n---\n');

      const { error: updateError } = await supabase
        .from('reports')
        .update({ status: 'Reunited', remarks: newRemarks })
        .eq('report_id', selectedMissingPerson.report_id);

      if (updateError) {
        setError(updateError.message);
        setIsSubmitting(false);
        return;
      }

      setSelectedMissingPerson(null);
      setFormData((current) => ({ ...initialFormState, report_type: current.report_type }));
      setSuccessMessage('Missing person marked as found/reunited.');
      setIsSubmitting(false);
      return;
    }

    if (!formData.gender || !formData.age_band || !formData.last_seen_location) {
      setError('Gender, age band, and last seen location are required.');
      setIsSubmitting(false);
      return;
    }

    // Block if matches found and user hasn't confirmed
    if (matchedReports?.length && !confirmedDuplicate) {
      setError('Please review the flagged match above and confirm before submitting.');
      setIsSubmitting(false);
      return;
    }

    let photo_url = null;

    // Upload photo if one was captured
    if (photoDataUrl) {
      try {
        const blob = await (await fetch(photoDataUrl)).blob();
        const ext = blob.type.includes('png') ? 'png' : 'jpg';
        const filePath = `reports/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('report-photos')
          .upload(filePath, blob, { contentType: blob.type, upsert: false });
        if (!uploadError && uploadData) {
          const { data: urlData } = supabase.storage.from('report-photos').getPublicUrl(uploadData.path);
          photo_url = urlData?.publicUrl ?? null;
        }
      } catch {
        // Photo upload failed — proceed without it
      }
    }

    const payload = {
      ...formData,
      reporting_center: selectedCenter,
      reporter_mobile: formData.report_type === 'missing' ? formData.reporter_mobile : null,
      name: formData.name || null,
      language: formData.language || null,
      physical_description: formData.physical_description || null,
      remarks: formData.remarks || null,
      photo_url,
      face_embedding: faceDescriptor ? Array.from(faceDescriptor) : null,
    };

    let { error: insertError } = await supabase.from('reports').insert(payload);

    // Graceful fallback: if photo_url / face_embedding columns don't exist yet, retry without them
    if (insertError && (insertError.message?.includes('photo_url') || insertError.message?.includes('face_embedding') || insertError.code === '42703')) {
      const { photo_url: _p, face_embedding: _f, ...corePayload } = payload;
      ({ error: insertError } = await supabase.from('reports').insert(corePayload));
    }

    if (insertError) {
      setError(insertError.message);
      setIsSubmitting(false);
      return;
    }

    setFormData((current) => ({ ...initialFormState, report_type: current.report_type }));
    setPhotoDataUrl(null);
    setFaceDescriptor(null);
    setMatchedReports(null);
    setConfirmedDuplicate(false);
    setSuccessMessage('Report submitted and broadcast to all centers.');
    setIsSubmitting(false);
  }

  const hasMatches = matchedReports?.length > 0;

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-semibold text-slate-900">New report</h2>
        <p className="text-sm text-slate-600">Only gender, age band, and last-seen location are mandatory.</p>
      </div>

      <form className="space-y-5" onSubmit={handleSubmit}>
        {/* Report type */}
        <div>
          <span className="mb-2 block text-sm font-medium text-slate-700">Report type</span>
          <div className="grid grid-cols-2 gap-3">
            {[
              { value: 'missing', label: 'Missing' },
              { value: 'found', label: 'Found' },
            ].map((option) => {
              const active = formData.report_type === option.value;
              return (
                <label
                  key={option.value}
                  className={`cursor-pointer rounded-2xl border px-4 py-3 text-center text-sm font-medium transition ${
                    active
                      ? 'border-saffron bg-saffron/10 text-slate-900'
                      : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300'
                  }`}
                >
                  <input
                    className="sr-only"
                    type="radio"
                    name="report_type"
                    value={option.value}
                    checked={active}
                    onChange={handleChange}
                  />
                  {option.label}
                </label>
              );
            })}
          </div>
        </div>

        {/* Search existing missing persons (only for 'Found' reports) */}
        {formData.report_type === 'found' && (
          <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4">
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm font-semibold text-sky-900 flex items-center gap-2">
                Link to existing missing person
                {isSearchingMissing && <span className="text-xs text-sky-600 animate-pulse">Searching...</span>}
              </span>
              {selectedMissingPerson && (
                <button
                  type="button"
                  onClick={() => setSelectedMissingPerson(null)}
                  className="text-xs font-semibold text-sky-600 hover:text-sky-800"
                >
                  Clear selection
                </button>
              )}
            </div>
            
            {!selectedMissingPerson ? (
              <>
                <p className="text-xs text-sky-700 mb-2">If you know who this is, search to instantly mark them as found.</p>
                <input
                  type="text"
                  placeholder="Search by name or description..."
                  className="input border-sky-300 bg-white"
                  value={missingSearchTerm}
                  onChange={(e) => setMissingSearchTerm(e.target.value)}
                />

                {missingSearchResults.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {missingSearchResults.map(person => (
                      <div
                        key={person.report_id}
                        onClick={() => handleSelectMissing(person)}
                        className="cursor-pointer rounded-xl border border-sky-200 bg-white p-3 shadow-sm transition hover:border-sky-400 hover:bg-sky-50"
                      >
                        <div className="flex justify-between items-center">
                          <span className="font-semibold text-sm text-slate-800">{person.name || 'Unnamed'}</span>
                          <span className="text-xs text-slate-500">{formatDate(person.reported_at)}</span>
                        </div>
                        <p className="text-xs text-slate-600 mt-1">
                          {person.gender} | {person.age_band} | Missing from: {person.last_seen_location}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                <p className="text-sm font-semibold text-emerald-800">✅ Selected: {selectedMissingPerson.name || 'Unnamed'}</p>
                <p className="text-xs text-emerald-700 mt-1">Fill out where they were found below to mark them as Reunited.</p>
              </div>
            )}
          </div>
        )}

        {!selectedMissingPerson && (
          <>
            {/* Photo capture */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-slate-700">Photo</span>
                {isLoadingModels && (
                  <span className="flex items-center gap-1.5 text-xs text-slate-500">
                    <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                    </svg>
                    Loading face models...
                  </span>
                )}
                {modelsReady && !isLoadingModels && (
                  <span className="flex items-center gap-1 text-xs font-medium text-emerald-600">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    Face matching ready
                  </span>
                )}
              </div>
              <PhotoCapture
                modelsReady={modelsReady}
                onDescriptorReady={handleDescriptorReady}
                onPhotoSelected={handlePhotoSelected}
              />

              {/* Matching spinner */}
              {isFaceMatching && (
                <div className="flex items-center gap-2 rounded-xl bg-blue-50 px-4 py-3 text-sm text-blue-800">
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                  Searching for matching records…
                </div>
              )}

              {/* Match found alert */}
              {hasMatches && !isFaceMatching && (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 space-y-3">
                  <div className="flex items-start gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-rose-100">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-rose-600" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-rose-800">
                        ⚠️ Possible match{matchedReports.length > 1 ? 'es' : ''} found
                      </p>
                      <p className="mt-0.5 text-xs text-rose-700">
                        A person with a similar face is already in the system. Coordinate with the center below before creating a new record.
                      </p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    {matchedReports.map((r) => (
                      <div key={r.report_id} className="rounded-xl border border-rose-200 bg-white px-3 py-2.5 text-xs">
                        <div className="flex items-center justify-between">
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
                            r.report_type === 'found'
                              ? 'bg-emerald-100 text-emerald-700'
                              : 'bg-rose-100 text-rose-700'
                          }`}>
                            {r.report_type}
                          </span>
                          <span className="text-slate-400">{formatDate(r.reported_at)}</span>
                        </div>
                        <p className="mt-1.5 font-medium text-slate-800">{r.name || 'Unnamed'}</p>
                        <p className="text-slate-500">📍 {r.reporting_center}</p>
                        <p className="text-slate-400">Status: {r.status}</p>
                      </div>
                    ))}
                  </div>

                  {!confirmedDuplicate ? (
                    <button
                      type="button"
                      onClick={() => setConfirmedDuplicate(true)}
                      className="w-full rounded-xl border border-rose-300 bg-white px-4 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-50"
                    >
                      I've verified this — submit anyway
                    </button>
                  ) : (
                    <p className="rounded-xl bg-rose-100 px-3 py-2 text-center text-xs font-medium text-rose-700">
                      ✓ Override confirmed — you may now submit
                    </p>
                  )}
                </div>
              )}

              {/* No match result */}
              {matchedReports !== null && matchedReports.length === 0 && !isFaceMatching && faceDescriptor && (
                <p className="flex items-center gap-1.5 rounded-xl bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                  No matching records found — this appears to be a new case.
                </p>
              )}
            </div>
          </>
        )}

        {/* AI Voice & Text Assistant */}
        {!selectedMissingPerson && (
          <div className="rounded-3xl border border-violet-100 bg-violet-50/40 p-5 space-y-4 shadow-sm backdrop-blur-sm">
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-violet-900 flex items-center gap-2">
                <span className="relative flex h-2 w-2" style={{ display: isListening ? 'inline-flex' : 'none' }}>
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500"></span>
                </span>
                {isListening ? '🎙️ Listening (Speak now)...' : '✨ AI Voice Auto-Fill'}
              </span>
              
              <select 
                value={speechLang} 
                onChange={(e) => setSpeechLang(e.target.value)}
                className="rounded-xl border border-violet-200 bg-white px-3 py-1.5 text-xs font-semibold text-violet-800 outline-none shadow-sm focus:border-violet-500"
              >
                <option value="hi-IN">Hindi (हिन्दी)</option>
                <option value="en-IN">English (India)</option>
              </select>
            </div>

            <p className="text-xs leading-relaxed text-violet-700">
              Describe the person in English or Hindi (e.g. <i>"Rahul, a 10 year old boy speaking Hindi, missing from Ramkund Ghat, wearing a green t-shirt..."</i>) and AI will extract details instantly!
            </p>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={toggleListening}
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl transition shadow-sm ${
                  isListening 
                    ? 'bg-rose-500 text-white animate-pulse' 
                    : 'bg-violet-600 text-white hover:bg-violet-700 hover:shadow-md'
                }`}
                title={isListening ? 'Stop recording' : 'Start voice dictation'}
              >
                {isListening ? (
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
                    <path fillRule="evenodd" d="M4.5 7.5a3 3 0 013-3h9a3 3 0 013 3v9a3 3 0 01-3 3h-9a3 3 0 01-3-3v-9z" clipRule="evenodd" />
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5.5 w-5.5">
                    <path d="M12 2a3 3 0 00-3 3v7a3 3 0 006 0V5a3 3 0 00-3-3z" />
                    <path d="M19 10a1 1 0 00-1 1v1a7 7 0 01-14 0v-1a1 1 0 00-2 0v1a9 9 0 008 8.94V21a1 1 0 102 0v-2.06A9 9 0 0022 12v-1a1 1 0 00-1-1z" />
                  </svg>
                )}
              </button>

              <textarea
                value={dictationText}
                onChange={(e) => setDictationText(e.target.value)}
                placeholder={isListening ? 'Listening and transcribing...' : 'Or type the description here to auto-fill...'}
                className="input flex-1 min-h-[44px] max-h-[120px] py-2.5 px-3 border-violet-200 text-sm focus:border-violet-500 focus:ring-violet-200"
                rows={1}
              />
            </div>

            <div className="flex items-center justify-between gap-4 pt-1">
              {aiError ? (
                <span className="text-xs font-semibold text-rose-600">{aiError}</span>
              ) : (
                <span className="text-[11px] text-slate-400">
                  {!(import.meta.env.VITE_GROQ_API_KEY) || import.meta.env.VITE_GROQ_API_KEY === 'your-groq-api-key' 
                    ? '⚠️ Groq Key missing in .env' 
                    : '⚡ Groq Engine active'}
                </span>
              )}

              <button
                type="button"
                onClick={handleAiAutoFill}
                disabled={isAiProcessing || !dictationText.trim()}
                className="flex items-center gap-2 rounded-2xl bg-violet-600 px-5 py-2.5 text-xs font-bold text-white transition hover:bg-violet-750 hover:shadow-md disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
              >
                {isAiProcessing ? (
                  <>
                    <svg className="h-3 w-3 animate-spin text-white" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                    </svg>
                    Extracting...
                  </>
                ) : (
                  <>
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
                      <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
                    </svg>
                    Auto-Fill Fields
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Core form fields */}
        {!selectedMissingPerson && (
          <div className="grid gap-4">
            <Field label="Name">
              <input
                name="name"
                value={formData.name}
                onChange={handleChange}
                placeholder="Optional if unknown"
                className={`input transition-all duration-300 ${
                  highlightedFields.includes('name')
                    ? 'ring-2 ring-emerald-500 border-emerald-500 bg-emerald-50/50 scale-[1.01]'
                    : ''
                }`}
              />
            </Field>

            <Field label="Language">
              <input
                name="language"
                value={formData.language}
                onChange={handleChange}
                placeholder="Hindi, Marathi, Tamil..."
                className={`input transition-all duration-300 ${
                  highlightedFields.includes('language')
                    ? 'ring-2 ring-emerald-500 border-emerald-500 bg-emerald-50/50 scale-[1.01]'
                    : ''
                }`}
              />
            </Field>

            <Field label="Gender" required>
              <select 
                name="gender" 
                value={formData.gender} 
                onChange={handleChange} 
                className={`input transition-all duration-300 ${
                  highlightedFields.includes('gender')
                    ? 'ring-2 ring-emerald-500 border-emerald-500 bg-emerald-50/50 scale-[1.01]'
                    : ''
                }`}
              >
                <option value="">Select gender</option>
                {genders.map((gender) => (
                  <option key={gender} value={gender}>{gender}</option>
                ))}
              </select>
            </Field>

            <Field label="Age band" required>
              <select 
                name="age_band" 
                value={formData.age_band} 
                onChange={handleChange} 
                className={`input transition-all duration-300 ${
                  highlightedFields.includes('age_band')
                    ? 'ring-2 ring-emerald-500 border-emerald-500 bg-emerald-50/50 scale-[1.01]'
                    : ''
                }`}
              >
                <option value="">Select age band</option>
                {ageBands.map((band) => (
                  <option key={band} value={band}>{band}</option>
                ))}
              </select>
            </Field>

            {formData.report_type === 'missing' && (
              <Field label="Reporter mobile">
                <input
                  name="reporter_mobile"
                  value={formData.reporter_mobile}
                  onChange={handleChange}
                  placeholder="Optional contact number"
                  className={`input transition-all duration-300 ${
                    highlightedFields.includes('reporter_mobile')
                      ? 'ring-2 ring-emerald-500 border-emerald-500 bg-emerald-50/50 scale-[1.01]'
                      : ''
                  }`}
                />
              </Field>
            )}

            <Field label="Physical description">
              <textarea
                name="physical_description"
                value={formData.physical_description}
                onChange={handleChange}
                placeholder="Clothing, approximate height, identifying marks..."
                rows={4}
                className={`input min-h-28 resize-y transition-all duration-300 ${
                  highlightedFields.includes('physical_description')
                    ? 'ring-2 ring-emerald-500 border-emerald-500 bg-emerald-50/50 scale-[1.01]'
                    : ''
                }`}
              />
            </Field>
          </div>
        )}

        <Field label={selectedMissingPerson ? 'Where was this person found? *' : 'Last seen / found location *'} required>
          <select
            name="last_seen_location"
            value={formData.last_seen_location}
            onChange={handleChange}
            className={`input transition-all duration-300 ${
              highlightedFields.includes('last_seen_location')
                ? 'ring-2 ring-emerald-500 border-emerald-500 bg-emerald-50/50 scale-[1.01]'
                : ''
            }`}
            disabled={isLoading}
          >
            <option value="">{isLoading ? 'Loading locations...' : 'Select location'}</option>
            {locations.map((location) => (
              <option key={location} value={location}>{location}</option>
            ))}
          </select>
        </Field>

        <Field label="Reporting center">
          <input value={selectedCenter || 'Choose a center above'} disabled className="input bg-slate-100" />
        </Field>

        <Field label="Remarks">
          <textarea
            name="remarks"
            value={formData.remarks}
            onChange={handleChange}
            placeholder="Any extra context from the operator"
            rows={3}
            className={`input min-h-24 resize-y transition-all duration-300 ${
              highlightedFields.includes('remarks')
                ? 'ring-2 ring-emerald-500 border-emerald-500 bg-emerald-50/50 scale-[1.01]'
                : ''
            }`}
          />
        </Field>

        {error ? <p className="rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p> : null}
        {successMessage ? (
          <p className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{successMessage}</p>
        ) : null}

        <button
          type="submit"
          disabled={isSubmitting || isLoading || !selectedCenter || isFaceMatching || (matchedReports?.length > 0 && !confirmedDuplicate) || (selectedMissingPerson && !formData.last_seen_location)}
          className="w-full rounded-2xl bg-river px-5 py-3 text-sm font-semibold text-white transition hover:bg-river/90 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {isSubmitting ? 'Submitting...' : selectedMissingPerson ? 'Mark person as Found / Reunited' : 'Submit report'}
        </button>
      </form>
    </section>
  );
}

function Field({ label, required = false, children }) {
  return (
    <label className="block space-y-2">
      <span className="text-sm font-medium text-slate-700">
        {label}
        {required ? <span className="ml-1 text-saffron">*</span> : null}
      </span>
      {children}
    </label>
  );
}
