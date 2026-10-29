import React, { useState, useEffect, useRef } from 'react';
import {
  ShieldCheck,
  Globe,
  ArrowRight,
  ArrowLeft,
  Settings,
  Lock,
  RefreshCw,
  CheckCircle,
  AlertTriangle,
  Heart,
  Trash2,
  Clock,
  FlaskConical,
  LogOut
} from 'lucide-react';

import { Language, ScreeningPayload } from './types';
import { getInstrument } from './lib/scoring';
import { isPinSet, setStaffPin, verifyStaffPin } from './lib/auth';
import {
  enqueueResponse,
  getQueueCount,
  clearAllLocalData,
  saveDraftProgress,
  clearDraftProgress
} from './lib/db';
import { getSyncConfig, saveSyncConfig, syncQueuedResponses, submitAndSyncResponse } from './lib/sync';

// Local storage key for active staff session label and idle timeout
const SESSION_LABEL_KEY = 'koroboi_session_label';
const TIMEOUT_MINUTES_KEY = 'koroboi_idle_timeout_min';
const DEMO_MODE_KEY = 'koroboi_demo_mode';

function App() {
  // Navigation & Session State
  const [view, setView] = useState<'locked' | 'staff_pin' | 'staff_dash' | 'admission' | 'screening' | 'thankyou'>('locked');
  const [language, setLanguage] = useState<Language>('en');

  // Staff Configuration
  const [sessionLabel, setSessionLabel] = useState<string>(() => localStorage.getItem(SESSION_LABEL_KEY) || 'Form 2 - Term 1');
  const [idleTimeoutMin, setIdleTimeoutMin] = useState<number>(() => parseInt(localStorage.getItem(TIMEOUT_MINUTES_KEY) || '2', 10));
  const [demoMode, setDemoMode] = useState<boolean>(() => localStorage.getItem(DEMO_MODE_KEY) === 'true');
  const [queueCount, setQueueCount] = useState<number>(0);

  // Active Screening State
  const [sessionId, setSessionId] = useState<string>('');
  const [admissionNumber, setAdmissionNumber] = useState<string>('');
  const [currentInstrumentIndex, setCurrentInstrumentIndex] = useState<number>(0); // 0 = PHQ-9, 1 = GAD-7
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState<number>(0);
  const [phq9Answers, setPhq9Answers] = useState<number[]>([]);
  const [gad7Answers, setGad7Answers] = useState<number[]>([]);
  const [hasItem9Urgent, setHasItem9Urgent] = useState<boolean>(false);

  // Timeout Prompt State
  const [showInactivityPrompt, setShowInactivityPrompt] = useState<boolean>(false);
  const lastActivityRef = useRef<number>(Date.now());

  // Hidden Long Press for Staff Access
  const longPressTimerRef = useRef<any>(null);

  // Load Queue Count on Mount
  useEffect(() => {
    refreshQueueCount();
  }, []);

  const refreshQueueCount = async () => {
    try {
      const count = await getQueueCount();
      setQueueCount(count);
    } catch {
      // IndexedDB fallback
    }
  };

  // Inactivity Timer Effect during Screening
  useEffect(() => {
    if (view !== 'screening') return;

    const timeoutMs = idleTimeoutMin * 60 * 1000;
    const warningMs = Math.max(10000, timeoutMs - 30000); // 30s before timeout or 90s default

    const interval = setInterval(async () => {
      const elapsed = Date.now() - lastActivityRef.current;

      if (elapsed >= timeoutMs) {
        // Session Abandoned!
        setShowInactivityPrompt(false);
        await handleSessionAbandoned();
      } else if (elapsed >= warningMs && !showInactivityPrompt) {
        setShowInactivityPrompt(true);
      }
    }, 1000);

    const handleUserTouch = () => {
      lastActivityRef.current = Date.now();
      if (showInactivityPrompt) {
        setShowInactivityPrompt(false);
      }
    };

    window.addEventListener('pointerdown', handleUserTouch);
    window.addEventListener('keydown', handleUserTouch);

    return () => {
      clearInterval(interval);
      window.removeEventListener('pointerdown', handleUserTouch);
      window.removeEventListener('keydown', handleUserTouch);
    };
  }, [view, idleTimeoutMin, showInactivityPrompt, phq9Answers, gad7Answers, admissionNumber, sessionId]);

  const resetActivityTimer = () => {
    lastActivityRef.current = Date.now();
    setShowInactivityPrompt(false);
  };

  // Handle Session Abandonment Logic
  const handleSessionAbandoned = async () => {
    // If PHQ-9 item 9 was answered > 0, submit partial URGENT record
    if (phq9Answers.length >= 9 && phq9Answers[8] > 0) {
      const payload: ScreeningPayload = {
        sessionId: sessionId || `session_${Date.now()}`,
        sessionLabel,
        admissionNumber: admissionNumber || 'ABANDONED',
        language,
        timestamp: new Date().toISOString(),
        phq9Answers,
        gad7Answers,
        incomplete: true,
        demo: demoMode
      };
      await submitAndSyncResponse(payload);
    }

    // Clear local draft and return immediately to admission screen
    await clearDraftProgress();
    resetScreeningState();
    setView('admission');
  };

  const resetScreeningState = () => {
    setSessionId('');
    setAdmissionNumber('');
    setCurrentInstrumentIndex(0);
    setCurrentQuestionIndex(0);
    setPhq9Answers([]);
    setGad7Answers([]);
    setHasItem9Urgent(false);
    setShowInactivityPrompt(false);
  };

  // Start Screening Session
  const startStudentSession = () => {
    resetScreeningState();
    setSessionId(`session_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`);
    setView('admission');
  };

  // Hidden Logo Touch/Long-Press Handlers (3 seconds)
  const handleLogoTouchStart = () => {
    longPressTimerRef.current = setTimeout(() => {
      setView('staff_pin');
    }, 3000);
  };

  const handleLogoTouchEnd = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
    }
  };

  // Save Progress on Each Answer
  const handleAnswerSelect = async (val: number) => {
    resetActivityTimer();

    if (currentInstrumentIndex === 0) {
      // PHQ-9
      const newAnswers = [...phq9Answers];
      newAnswers[currentQuestionIndex] = val;
      setPhq9Answers(newAnswers);

      if (currentQuestionIndex === 8) {
        setHasItem9Urgent(val > 0);
      }

      await saveDraftProgress({
        sessionId,
        admissionNumber,
        language,
        phq9Answers: newAnswers,
        gad7Answers,
        timestamp: new Date().toISOString()
      });

      if (currentQuestionIndex < 8) {
        setCurrentQuestionIndex(prev => prev + 1);
      } else {
        // Move to GAD-7
        setCurrentInstrumentIndex(1);
        setCurrentQuestionIndex(0);
      }
    } else {
      // GAD-7
      const newAnswers = [...gad7Answers];
      newAnswers[currentQuestionIndex] = val;
      setGad7Answers(newAnswers);

      await saveDraftProgress({
        sessionId,
        admissionNumber,
        language,
        phq9Answers,
        gad7Answers: newAnswers,
        timestamp: new Date().toISOString()
      });

      if (currentQuestionIndex < 6) {
        setCurrentQuestionIndex(prev => prev + 1);
      } else {
        // Final Submit
        await handleFinalSubmission(phq9Answers, newAnswers);
      }
    }
  };

  const handleBackQuestion = () => {
    resetActivityTimer();
    if (currentInstrumentIndex === 1 && currentQuestionIndex === 0) {
      // Back to last question of PHQ-9
      setCurrentInstrumentIndex(0);
      setCurrentQuestionIndex(8);
    } else if (currentQuestionIndex > 0) {
      setCurrentQuestionIndex(prev => prev - 1);
    }
  };

  const handleFinalSubmission = async (pAnswers: number[], gAnswers: number[]) => {
    const payload: ScreeningPayload = {
      sessionId,
      sessionLabel,
      admissionNumber,
      language,
      timestamp: new Date().toISOString(),
      phq9Answers: pAnswers,
      gad7Answers: gAnswers,
      demo: demoMode
    };

    await submitAndSyncResponse(payload);
    await clearDraftProgress();
    await refreshQueueCount();

    setView('thankyou');

    // Auto-clear and return to admission screen after 5 seconds
    setTimeout(() => {
      resetScreeningState();
      setView('admission');
    }, 5000);
  };

  // Render Language Toggle
  const renderLangToggle = () => (
    <div className="flex items-center gap-1 bg-emerald-100 p-1 rounded-lg">
      <button
        onClick={() => setLanguage('en')}
        className={`px-3 py-1.5 rounded-md text-sm font-semibold transition ${
          language === 'en' ? 'bg-emerald-700 text-white shadow-xs' : 'text-emerald-900 hover:bg-emerald-200'
        }`}
      >
        English
      </button>
      <button
        onClick={() => setLanguage('sw')}
        className={`px-3 py-1.5 rounded-md text-sm font-semibold transition ${
          language === 'sw' ? 'bg-emerald-700 text-white shadow-xs' : 'text-emerald-900 hover:bg-emerald-200'
        }`}
      >
        Kiswahili
      </button>
    </div>
  );

  return (
    <div className="min-h-screen flex flex-col justify-between bg-emerald-50/60 p-4 md:p-8 max-w-4xl mx-auto font-sans select-none">
      {/* Persistent Demo Mode Banner */}
      {demoMode && (
        <div className="bg-amber-500 text-slate-900 font-bold text-center py-2 px-4 rounded-lg shadow-sm mb-4 flex items-center justify-center gap-2">
          <FlaskConical className="w-5 h-5" />
          <span>DEMO MODE ACTIVE — Data will be saved to Demo tab only</span>
        </div>
      )}

      {/* Header */}
      <header className="flex justify-between items-center py-2 border-b border-emerald-200/60 mb-6">
        <div
          onMouseDown={handleLogoTouchStart}
          onMouseUp={handleLogoTouchEnd}
          onTouchStart={handleLogoTouchStart}
          onTouchEnd={handleLogoTouchEnd}
          className="cursor-pointer select-none group flex items-center gap-2"
          title="Staff: Press and hold 3s for Staff Screen"
        >
          <div className="bg-emerald-700 text-white p-2 rounded-xl group-hover:scale-105 transition">
            <Heart className="w-6 h-6 fill-emerald-100" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-emerald-950 tracking-tight">Koroboi</h1>
            <p className="text-xs text-emerald-700 font-medium">{sessionLabel}</p>
          </div>
        </div>

        {view !== 'staff_dash' && view !== 'staff_pin' && renderLangToggle()}
      </header>

      {/* MAIN CONTENT VIEWS */}
      <main className="flex-1 flex flex-col justify-center my-auto">
        {/* VIEW 1: LOCKED START SCREEN */}
        {view === 'locked' && (
          <div className="bg-white rounded-2xl p-8 md:p-12 shadow-sm border border-emerald-100 text-center space-y-6">
            <div className="w-16 h-16 bg-emerald-100 text-emerald-800 rounded-full flex items-center justify-center mx-auto">
              <Lock className="w-8 h-8" />
            </div>
            <div>
              <h2 className="text-2xl md:text-3xl font-bold text-emerald-950">Staff Session Locked</h2>
              <p className="text-slate-600 mt-2 max-w-md mx-auto text-base">
                A staff member must unlock this tablet and confirm student consent before handing it over to students.
              </p>
            </div>

            <button
              onClick={() => setView('staff_pin')}
              className="w-full md:w-auto px-8 py-4 bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-lg rounded-xl shadow-md transition flex items-center justify-center gap-2 mx-auto"
            >
              <Settings className="w-5 h-5" />
              <span>Staff Unlock & Session Start</span>
            </button>
          </div>
        )}

        {/* VIEW 2: STAFF PIN LOGIN / SETUP */}
        {view === 'staff_pin' && (
          <StaffPinScreen
            onUnlocked={() => setView('staff_dash')}
            onCancel={() => setView('locked')}
          />
        )}

        {/* VIEW 3: STAFF DASHBOARD */}
        {view === 'staff_dash' && (
          <StaffDashboardScreen
            sessionLabel={sessionLabel}
            setSessionLabel={setSessionLabel}
            idleTimeoutMin={idleTimeoutMin}
            setIdleTimeoutMin={setIdleTimeoutMin}
            demoMode={demoMode}
            setDemoMode={setDemoMode}
            queueCount={queueCount}
            refreshQueue={refreshQueueCount}
            onStartSession={() => {
              startStudentSession();
            }}
            onLock={() => setView('locked')}
          />
        )}

        {/* VIEW 4: ADMISSION NUMBER INPUT */}
        {view === 'admission' && (
          <div className="bg-white rounded-2xl p-8 md:p-12 shadow-sm border border-emerald-100 space-y-6">
            <div>
              <span className="text-xs uppercase font-bold tracking-wider text-emerald-700 bg-emerald-100 px-3 py-1 rounded-full">
                Step 1 of 2
              </span>
              <h2 className="text-2xl md:text-3xl font-bold text-emerald-950 mt-3">
                {language === 'sw' ? 'Ingiza Nambari yako ya Usajili' : 'Enter Your Admission Number'}
              </h2>
              <p className="text-slate-600 mt-1 text-sm">
                {language === 'sw'
                  ? 'Nambari yako tu ndiyo itakayotumika. Majina hayahifadhiwi kabisa.'
                  : 'Only your admission number is entered. Names are never stored or collected.'}
              </p>
            </div>

            <div className="space-y-4">
              <input
                type="text"
                placeholder={demoMode ? "e.g. 2025-0123" : "Admission Number (e.g., 2025-0123)"}
                value={admissionNumber}
                onChange={e => setAdmissionNumber(e.target.value)}
                className="w-full text-2xl font-mono px-4 py-4 border-2 border-emerald-200 rounded-xl focus:border-emerald-600 focus:outline-hidden text-emerald-950"
              />

              {demoMode && (
                <button
                  type="button"
                  onClick={() => setAdmissionNumber(`2025-${Math.floor(1000 + Math.random() * 9000)}`)}
                  className="px-4 py-2 bg-amber-100 hover:bg-amber-200 text-amber-900 text-sm font-semibold rounded-lg flex items-center gap-2"
                >
                  <FlaskConical className="w-4 h-4" />
                  <span>Fill Demo Admission Number</span>
                </button>
              )}

              <button
                disabled={!admissionNumber.trim()}
                onClick={() => {
                  if (admissionNumber.trim()) setView('screening');
                }}
                className="w-full py-4 bg-emerald-700 hover:bg-emerald-800 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-bold text-xl rounded-xl shadow-md transition flex items-center justify-center gap-2"
              >
                <span>{language === 'sw' ? 'Anza Maswali' : 'Begin Screening'}</span>
                <ArrowRight className="w-6 h-6" />
              </button>
            </div>
          </div>
        )}

        {/* VIEW 5: QUESTIONNAIRE (1 Q / Screen) */}
        {view === 'screening' && (
          <ScreeningView
            language={language}
            instrumentIndex={currentInstrumentIndex}
            questionIndex={currentQuestionIndex}
            onAnswer={handleAnswerSelect}
            onBack={handleBackQuestion}
            totalQuestions={currentInstrumentIndex === 0 ? 9 : 7}
          />
        )}

        {/* VIEW 6: THANK YOU SCREEN */}
        {view === 'thankyou' && (
          <div className="bg-white rounded-2xl p-8 md:p-12 shadow-sm border border-emerald-100 text-center space-y-6">
            <div className="w-20 h-20 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center mx-auto">
              <CheckCircle className="w-10 h-10" />
            </div>

            <div className="space-y-3">
              <h2 className="text-3xl font-bold text-emerald-950">
                {language === 'sw' ? 'Asante!' : 'Thank You!'}
              </h2>
              <p className="text-slate-600 text-lg max-w-lg mx-auto">
                {language === 'sw'
                  ? 'Majibu yako yamepokewa salama. Mfumo utasafishwa kwa sekunde chache.'
                  : 'Your responses have been securely submitted. This screen will reset in a few seconds.'}
              </p>
            </div>

            {hasItem9Urgent && (
              <div className="bg-emerald-50 border border-emerald-300 text-emerald-950 p-6 rounded-xl max-w-md mx-auto text-left space-y-2">
                <div className="flex items-center gap-2 font-bold text-emerald-900">
                  <Heart className="w-5 h-5 fill-emerald-600 text-emerald-600" />
                  <span>{language === 'sw' ? 'Ujumbe wa Msaada' : 'A Gentle Note'}</span>
                </div>
                <p className="text-sm text-emerald-900 leading-relaxed">
                  {language === 'sw'
                    ? 'Mwanachama wa wafanyakazi wa shule atazungumza nawe leo ili kuona jinsi unavyoendelea.'
                    : 'A member of the school staff will check in with you today just to see how you are doing.'}
                </p>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Inactivity Prompt Modal */}
      {showInactivityPrompt && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl p-6 md:p-8 max-w-md w-full shadow-xl space-y-4 text-center">
            <Clock className="w-12 h-12 text-amber-500 mx-auto" />
            <h3 className="text-xl font-bold text-slate-900">
              {language === 'sw' ? 'Bado upo hapa?' : 'Are you still there?'}
            </h3>
            <p className="text-slate-600 text-sm">
              {language === 'sw'
                ? 'Gusa popote kuendelea kabla ya mfumo kujifunga.'
                : 'Tap anywhere to continue your questionnaire.'}
            </p>
            <button
              onClick={resetActivityTimer}
              className="w-full py-3 bg-emerald-700 text-white font-bold rounded-xl shadow-xs"
            >
              {language === 'sw' ? 'Endelea' : 'Continue'}
            </button>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="text-center text-xs text-emerald-800/60 py-2 border-t border-emerald-200/40">
        Koroboi Screening System • Write-Only Offline PWA
      </footer>
    </div>
  );
}

// SUB-COMPONENT: Staff PIN Login / Setup Screen
function StaffPinScreen({ onUnlocked, onCancel }: { onUnlocked: () => void; onCancel: () => void }) {
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const isFirstSetup = !isPinSet();
  const [error, setError] = useState('');

  const handleSetPin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (pin.length !== 6 || !/^\d{6}$/.test(pin)) {
      setError('PIN must be 6 digits.');
      return;
    }

    if (pin !== confirmPin) {
      setError('PINs do not match.');
      return;
    }

    try {
      await setStaffPin(pin);
      onUnlocked();
    } catch (err: any) {
      setError(err.message || 'Failed to set PIN.');
    }
  };

  const handleVerifyPin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const res = await verifyStaffPin(pin);
    if (res.success) {
      onUnlocked();
    } else {
      setError(res.message || 'Invalid PIN.');
    }
  };

  return (
    <div className="bg-white rounded-2xl p-8 md:p-10 shadow-sm border border-emerald-100 max-w-md mx-auto w-full space-y-6">
      <div className="text-center">
        <div className="w-12 h-12 bg-emerald-100 text-emerald-800 rounded-full flex items-center justify-center mx-auto mb-3">
          <ShieldCheck className="w-6 h-6" />
        </div>
        <h2 className="text-2xl font-bold text-emerald-950">
          {isFirstSetup ? 'Set 6-Digit Staff PIN' : 'Enter Staff PIN'}
        </h2>
        <p className="text-slate-600 text-xs mt-1">
          {isFirstSetup
            ? 'First-time setup: Create a 6-digit passcode to manage tablet sessions.'
            : 'Enter staff PIN to access management settings.'}
        </p>
      </div>

      {error && (
        <div className="bg-red-50 text-red-700 p-3 rounded-lg text-sm flex items-center gap-2 border border-red-200">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {isFirstSetup ? (
        <form onSubmit={handleSetPin} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">New 6-Digit PIN</label>
            <input
              type="password"
              maxLength={6}
              value={pin}
              onChange={e => setPin(e.target.value)}
              className="w-full text-center text-2xl font-mono tracking-widest px-4 py-3 border border-emerald-200 rounded-xl"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Confirm 6-Digit PIN</label>
            <input
              type="password"
              maxLength={6}
              value={confirmPin}
              onChange={e => setConfirmPin(e.target.value)}
              className="w-full text-center text-2xl font-mono tracking-widest px-4 py-3 border border-emerald-200 rounded-xl"
            />
          </div>
          <button
            type="submit"
            className="w-full py-3 bg-emerald-700 text-white font-bold rounded-xl shadow-xs hover:bg-emerald-800"
          >
            Save PIN & Unlock
          </button>
        </form>
      ) : (
        <form onSubmit={handleVerifyPin} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Staff PIN</label>
            <input
              type="password"
              maxLength={6}
              value={pin}
              onChange={e => setPin(e.target.value)}
              className="w-full text-center text-2xl font-mono tracking-widest px-4 py-3 border border-emerald-200 rounded-xl"
            />
          </div>
          <button
            type="submit"
            className="w-full py-3 bg-emerald-700 text-white font-bold rounded-xl shadow-xs hover:bg-emerald-800"
          >
            Unlock Staff Screen
          </button>
        </form>
      )}

      <button
        onClick={onCancel}
        className="w-full py-2 text-slate-500 hover:text-slate-800 text-sm font-semibold"
      >
        Cancel
      </button>
    </div>
  );
}

// SUB-COMPONENT: Staff Dashboard
function StaffDashboardScreen({
  sessionLabel,
  setSessionLabel,
  idleTimeoutMin,
  setIdleTimeoutMin,
  demoMode,
  setDemoMode,
  queueCount,
  refreshQueue,
  onStartSession,
  onLock
}: {
  sessionLabel: string;
  setSessionLabel: (v: string) => void;
  idleTimeoutMin: number;
  setIdleTimeoutMin: (v: number) => void;
  demoMode: boolean;
  setDemoMode: (v: boolean) => void;
  queueCount: number;
  refreshQueue: () => void;
  onStartSession: () => void;
  onLock: () => void;
}) {
  const syncConfig = getSyncConfig();
  const [endpointUrl, setEndpointUrl] = useState(syncConfig.endpointUrl);
  const [secretToken, setSecretToken] = useState(syncConfig.secretToken);
  const [syncStatus, setSyncStatus] = useState<string>('');
  const [isSyncing, setIsSyncing] = useState(false);

  const handleSaveConfig = () => {
    saveSyncConfig(endpointUrl, secretToken);
    localStorage.setItem(SESSION_LABEL_KEY, sessionLabel);
    localStorage.setItem(TIMEOUT_MINUTES_KEY, idleTimeoutMin.toString());
    localStorage.setItem(DEMO_MODE_KEY, demoMode ? 'true' : 'false');
    setSyncStatus('Settings saved successfully!');
  };

  const handleForceSync = async () => {
    setIsSyncing(true);
    setSyncStatus('Syncing queued responses...');
    try {
      const res = await syncQueuedResponses();
      await refreshQueue();
      setSyncStatus(`Sync complete! ${res.successCount} sent, ${res.failCount} failed.`);
    } catch (err: any) {
      setSyncStatus(`Sync error: ${err.message}`);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleGenerateDemoBatch = async () => {
    for (let i = 0; i < 3; i++) {
      const mockPayload: ScreeningPayload = {
        sessionId: `demo_${Date.now()}_${i}`,
        sessionLabel,
        admissionNumber: `2025-09${Math.floor(10 + Math.random() * 80)}`,
        language: 'en',
        timestamp: new Date().toISOString(),
        phq9Answers: Array.from({ length: 9 }, () => Math.floor(Math.random() * 4)),
        gad7Answers: Array.from({ length: 7 }, () => Math.floor(Math.random() * 4)),
        demo: true
      };
      await enqueueResponse(mockPayload);
    }
    await refreshQueue();
    setSyncStatus('Added 3 synthetic demo responses to the offline queue!');
  };

  const handleWipeData = async () => {
    if (confirm('Are you sure you want to wipe all queued and draft offline data on this tablet?')) {
      await clearAllLocalData();
      await refreshQueue();
      setSyncStatus('All local offline data wiped.');
    }
  };

  return (
    <div className="bg-white rounded-2xl p-6 md:p-8 shadow-sm border border-emerald-100 space-y-6">
      <div className="flex justify-between items-center border-b pb-4 border-slate-200">
        <div>
          <h2 className="text-2xl font-bold text-emerald-950">Staff Control Panel</h2>
          <p className="text-xs text-slate-500">Manage screening session, endpoint sync & offline queue</p>
        </div>
        <button
          onClick={onLock}
          className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-sm rounded-lg flex items-center gap-1.5"
        >
          <LogOut className="w-4 h-4" />
          <span>Lock Staff Screen</span>
        </button>
      </div>

      {syncStatus && (
        <div className="bg-emerald-50 text-emerald-900 border border-emerald-200 p-3 rounded-lg text-sm font-medium">
          {syncStatus}
        </div>
      )}

      {/* Session Controls */}
      <div className="grid md:grid-cols-2 gap-4">
        <div className="bg-emerald-50/50 p-4 rounded-xl border border-emerald-100 space-y-3">
          <h3 className="font-bold text-emerald-950 text-sm flex items-center gap-2">
            <Clock className="w-4 h-4 text-emerald-700" />
            <span>Session & Timeout</span>
          </h3>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Session Label (Class & Term)</label>
            <input
              type="text"
              value={sessionLabel}
              onChange={e => setSessionLabel(e.target.value)}
              placeholder="e.g. Form 2 - Term 1 2025"
              className="w-full text-sm font-semibold px-3 py-2 border rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Student Idle Timeout (Minutes)</label>
            <select
              value={idleTimeoutMin}
              onChange={e => setIdleTimeoutMin(parseInt(e.target.value, 10))}
              className="w-full text-sm font-semibold px-3 py-2 border rounded-lg"
            >
              <option value={1}>1 minute</option>
              <option value={2}>2 minutes (Default)</option>
              <option value={3}>3 minutes</option>
              <option value={5}>5 minutes</option>
            </select>
          </div>
        </div>

        <div className="bg-emerald-50/50 p-4 rounded-xl border border-emerald-100 space-y-3">
          <h3 className="font-bold text-emerald-950 text-sm flex items-center gap-2">
            <Globe className="w-4 h-4 text-emerald-700" />
            <span>Google Apps Script Endpoint</span>
          </h3>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Web App URL</label>
            <input
              type="text"
              value={endpointUrl}
              onChange={e => setEndpointUrl(e.target.value)}
              placeholder="https://script.google.com/macros/s/.../exec"
              className="w-full text-xs font-mono px-3 py-2 border rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Shared Secret Token</label>
            <input
              type="password"
              value={secretToken}
              onChange={e => setSecretToken(e.target.value)}
              placeholder="Entered token is masked"
              className="w-full text-xs font-mono px-3 py-2 border rounded-lg"
            />
          </div>
        </div>
      </div>

      {/* Demo Mode Toggle */}
      <div className="bg-amber-50 p-4 rounded-xl border border-amber-200 flex items-center justify-between">
        <div>
          <h4 className="font-bold text-amber-950 text-sm flex items-center gap-2">
            <FlaskConical className="w-4 h-4 text-amber-600" />
            <span>Demo Mode</span>
          </h4>
          <p className="text-xs text-amber-800">
            Routes test submissions to the "Demo" tab in Google Sheets. Does not affect Triage or Summary.
          </p>
        </div>
        <button
          onClick={() => setDemoMode(!demoMode)}
          className={`px-4 py-2 font-bold text-xs rounded-lg transition ${
            demoMode ? 'bg-amber-600 text-white' : 'bg-slate-200 text-slate-700'
          }`}
        >
          {demoMode ? 'DEMO ON' : 'OFF'}
        </button>
      </div>

      {/* Queue & Sync Section */}
      <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
        <div className="flex justify-between items-center">
          <div>
            <span className="text-xs font-semibold text-slate-500 uppercase">Offline Response Queue</span>
            <div className="text-2xl font-bold text-slate-900">{queueCount} Pending Responses</div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleForceSync}
              disabled={isSyncing || queueCount === 0}
              className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 disabled:bg-slate-300 text-white font-bold text-sm rounded-lg flex items-center gap-1.5"
            >
              <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>Force Sync</span>
            </button>
            <button
              onClick={handleWipeData}
              className="px-3 py-2 bg-red-100 hover:bg-red-200 text-red-700 font-bold text-sm rounded-lg flex items-center gap-1.5"
            >
              <Trash2 className="w-4 h-4" />
              <span>Wipe Local Data</span>
            </button>
          </div>
        </div>

        {demoMode && (
          <button
            onClick={handleGenerateDemoBatch}
            className="w-full py-2 bg-amber-200 hover:bg-amber-300 text-amber-900 font-semibold text-xs rounded-lg"
          >
            + Generate 3 Synthetic Demo Submissions to Queue
          </button>
        )}
      </div>

      {/* Action Buttons */}
      <div className="flex flex-col md:flex-row gap-3 pt-2">
        <button
          onClick={handleSaveConfig}
          className="flex-1 py-3 bg-slate-800 hover:bg-slate-900 text-white font-bold rounded-xl text-sm"
        >
          Save Configuration
        </button>

        <button
          onClick={() => {
            handleSaveConfig();
            onStartSession();
          }}
          className="flex-1 py-3 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded-xl text-sm flex items-center justify-center gap-2"
        >
          <CheckCircle className="w-5 h-5" />
          <span>Confirm Consent & Start Class Session</span>
        </button>
      </div>
    </div>
  );
}

// SUB-COMPONENT: Single-Question Questionnaire View
function ScreeningView({
  language,
  instrumentIndex,
  questionIndex,
  onAnswer,
  onBack,
  totalQuestions
}: {
  language: Language;
  instrumentIndex: number;
  questionIndex: number;
  onAnswer: (val: number) => void;
  onBack: () => void;
  totalQuestions: number;
}) {
  const instrument = getInstrument(instrumentIndex === 0 ? 'phq9' : 'gad7', language);
  const question = instrument.questions[questionIndex];

  // Calculate Progress
  const overallCurrent = instrumentIndex === 0 ? questionIndex + 1 : 9 + questionIndex + 1;
  const overallTotal = 16;
  const progressPercent = Math.round((overallCurrent / overallTotal) * 100);

  return (
    <div className="bg-white rounded-2xl p-6 md:p-10 shadow-sm border border-emerald-100 space-y-6">
      {/* Progress Header */}
      <div className="space-y-2">
        <div className="flex justify-between items-center text-xs font-bold text-emerald-800">
          <span>{instrument.title}</span>
          <span>Question {questionIndex + 1} of {totalQuestions}</span>
        </div>
        <div className="w-full h-3 bg-emerald-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-emerald-600 transition-all duration-300 rounded-full"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* Instruction */}
      <p className="text-slate-500 text-sm font-medium bg-emerald-50/70 p-3 rounded-lg border border-emerald-100">
        {instrument.instruction}
      </p>

      {/* Question Text */}
      <div className="py-4">
        <h2 className="text-2xl md:text-3xl font-bold text-emerald-950 leading-snug">
          {question.number}. {question.text}
        </h2>
      </div>

      {/* 0-3 Scale Answer Options with Large Touch Targets */}
      <div className="grid gap-3">
        {instrument.options.map((opt) => (
          <button
            key={opt.value}
            onClick={() => onAnswer(opt.value)}
            className="w-full py-4 px-6 bg-emerald-50/80 hover:bg-emerald-600 hover:text-white border-2 border-emerald-200 text-emerald-950 font-bold text-lg md:text-xl rounded-2xl shadow-2xs transition active:scale-[0.99] flex items-center justify-between text-left group"
          >
            <span>{opt.label}</span>
            <span className="w-8 h-8 rounded-full bg-emerald-200 group-hover:bg-emerald-500 text-emerald-900 group-hover:text-white flex items-center justify-center text-sm font-mono shrink-0">
              {opt.value}
            </span>
          </button>
        ))}
      </div>

      {/* Back Button */}
      <div className="pt-2 flex justify-start">
        {(instrumentIndex > 0 || questionIndex > 0) && (
          <button
            onClick={onBack}
            className="px-4 py-2 text-slate-600 hover:text-slate-900 font-bold text-sm flex items-center gap-1"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>{language === 'sw' ? 'Rudi Nyuma' : 'Back'}</span>
          </button>
        )}
      </div>
    </div>
  );
}

export default App;
