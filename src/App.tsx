// @ts-nocheck
import React, { useState, useEffect } from 'react';
import {
  Home,
  ClipboardList,
  CalendarDays,
  MoreHorizontal,
  Plus,
  X,
  Phone,
  AlertTriangle,
  MessageSquare,
  Send,
  CheckCircle,
  Heart,
  Users,
  Edit2,
  Trash2,
  ShieldCheck,
  User,
  Info,
  Camera,
  Moon,
  Trees
} from 'lucide-react';

import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, onSnapshot, collection, setDoc, deleteDoc } from 'firebase/firestore';

// ============================================================================
// ⚙️ SCHNELL-KONFIGURATION FÜR JULIAS ANTWORT (Hier später einfach anpassen!)
// ============================================================================
const TANNENHOF_CONFIG = {
  appName: "Tannenhof",
  shiftLabel: "Abäppeldienst",
  showBlanketService: false,
  customLogoPath: "/logo.jpeg",
  adminEmail: "kirstenmarc@outlook.de"
};

// --- FIREBASE INITIALIZATION ---
let app, auth, db;
const firebaseConfig = {
  apiKey: "AIzaSyDMCuXQV69kHy2K4_OlPxDvBuMHrUuGFVM",
  authDomain: "tannenhof-32b31.firebaseapp.com",
  projectId: "tannenhof-32b31",
  storageBucket: "tannenhof-32b31.firebasestorage.app",
  messagingSenderId: "300986241421",
  appId: "1:300986241421:web:c32ae9cc6f8f150f10adc4"
};

try {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
} catch (e) {
  console.error("Firebase config error:", e);
}

const appId = typeof __app_id !== 'undefined' ? __app_id : 'stall-app-tannenhof';
const STORAGE_KEY = 'stall_tannenhof_user';

// --- HELPER: 2-MONATS-KALENDER GENERIEREN ---
const getTwoMonthsData = () => {
  const months = [];
  const now = new Date();
  const todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  for (let m = 0; m < 2; m++) {
    const year = now.getFullYear();
    const monthIndex = now.getMonth() + m;
    const firstDay = new Date(year, monthIndex, 1);
    const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();

    const monthTitle = firstDay.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
    const shortTitle = firstDay.toLocaleDateString('de-DE', { month: 'long' });
    const days = [];

    for (let d = 1; d <= daysInMonth; d++) {
      const current = new Date(year, monthIndex, d);
      const iso = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}-${String(current.getDate()).padStart(2, '0')}`;
      const isWeekend = current.getDay() === 0 || current.getDay() === 6;

      days.push({
        iso,
        dayNum: d,
        weekday: current.toLocaleDateString('de-DE', { weekday: 'short' }),
        label: current.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' }),
        isToday: iso === todayIso,
        isPast: iso < todayIso,
        isWeekend
      });
    }

    months.push({
      id: `${firstDay.getFullYear()}-${firstDay.getMonth()}`,
      title: monthTitle,
      shortTitle,
      days
    });
  }
  return months;
};

const getNightBlanketId = (horse) => {
  if (horse.nightBlanketId !== undefined) return horse.nightBlanketId;
  return horse.keepBlanketAtNight ? horse.activeBlanketId : null;
};

// --- LOGO KOMPONENTE ---
const TannenhofLogo = ({ size = "md" }) => {
  if (size === "lg") {
    return (
      <div className="flex flex-col items-center justify-center mb-3">
        <img
          src={TANNENHOF_CONFIG.customLogoPath}
          alt={`${TANNENHOF_CONFIG.appName} Logo`}
          className="w-44 h-44 mx-auto mb-2 rounded-3xl object-cover shadow-md border border-stone-200"
        />
        <p className="text-xs text-stone-500 font-semibold mt-1">Stall-Organisation & Abäppelplan</p>
      </div>
    );
  }

  return (
    <img
      src={TANNENHOF_CONFIG.customLogoPath}
      alt="Logo"
      className="w-8 h-8 rounded-lg object-cover"
    />
  );
};


export default function TannenhofStallApp() {
  const [fbUser, setFbUser] = useState(null);
  const [currentUser, setCurrentUser] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? JSON.parse(saved) : null;
    } catch (e) {
      return null;
    }
  });
  const [isLoginMode, setIsLoginMode] = useState(true);
  const [loginForm, setLoginForm] = useState({ email: '', password: '', name: '' });
  const [authError, setAuthError] = useState('');

  // Data State
  const [profiles, setProfiles] = useState([]);
  const [horses, setHorses] = useState([]);
  const [messages, setMessages] = useState([]);
  const [shifts, setShifts] = useState([]);

  // UI State
  const [activeTab, setActiveTab] = useState('home');
  const [selectedMonthIdx, setSelectedMonthIdx] = useState(0);
  const [toast, setToast] = useState(null);
  const [shiftPickerSlot, setShiftPickerSlot] = useState(null);

  // Form States
  const [newMessage, setNewMessage] = useState('');
  const [newPassword, setNewPassword] = useState('');

  // Horse Form State
  const [isEditingHorse, setIsEditingHorse] = useState(false);
  const [selectedHorse, setSelectedHorse] = useState(null);
  const [horseFormData, setHorseFormData] = useState({
    name: '', feed: '', notes: '', image: '', vet: '', vetPhone: '', farrier: '', farrierPhone: '',
    activeBlanketId: null, nightBlanketId: null, blankets: [], team: []
  });

  // --- 1. FIREBASE AUTH ---
  useEffect(() => {
    if (!auth) return;
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          try {
            await signInWithCustomToken(auth, __initial_auth_token);
          } catch (customTokenError) {
            await signInAnonymously(auth);
          }
        } else {
          await signInAnonymously(auth);
        }
      } catch (e) {
        console.error("Auth init error:", e);
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, setFbUser);
    return () => unsubscribe();
  }, []);

  // --- 2. FIRESTORE SUBSCRIPTIONS ---
  useEffect(() => {
    if (!fbUser || !db) return;
    const publicPath = (col) => collection(db, 'artifacts', appId, 'public', 'data', col);
    const unsubs = [];

    const subscribe = (colName, setter) => {
      return onSnapshot(publicPath(colName), (snapshot) => {
        setter(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      }, (err) => console.error(`Snapshot error on ${colName}:`, err));
    };

    unsubs.push(subscribe('profiles', setProfiles));
    unsubs.push(subscribe('horses', setHorses));
    unsubs.push(subscribe('messages', setMessages));
    unsubs.push(subscribe('shifts', setShifts));

    return () => unsubs.forEach(unsub => unsub());
  }, [fbUser]);

  // --- 3. GESPEICHERTEN NUTZER AKTUELL HALTEN ---
  useEffect(() => {
    if (!currentUser || profiles.length === 0) return;
    const freshUser = profiles.find(p => p.id === currentUser.id);
    if (freshUser) {
      if (JSON.stringify(freshUser) !== JSON.stringify(currentUser)) {
        setCurrentUser(freshUser);
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(freshUser));
        } catch (e) {}
      }
    } else {
      setCurrentUser(null);
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch (e) {}
    }
  }, [profiles, currentUser]);

  // --- HELPERS ---
  const showToast = (msg, isError = false) => {
    setToast({ msg, isError });
    setTimeout(() => setToast(null), 3000);
  };

  const syncToFirebase = async (colName, id, data, isDelete = false) => {
    if (!db || !fbUser) return;
    try {
      const docRef = doc(db, 'artifacts', appId, 'public', 'data', colName, id);
      if (isDelete) {
        await deleteDoc(docRef);
      } else {
        await setDoc(docRef, data, { merge: true });
      }
    } catch (err) {
      console.error(`Error syncing ${colName}:`, err);
    }
  };

  // --- HANDLERS ---
  const handleLogin = (e) => {
    e.preventDefault();
    setAuthError('');
    const userEmail = loginForm.email.trim().toLowerCase();
    const user = profiles.find(u => u.email.trim().toLowerCase() === userEmail && u.password === loginForm.password);

    if (user) {
      setCurrentUser(user);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
      } catch (e) {}
      showToast(`Willkommen zurück, ${user.name}!`);
    } else {
      setAuthError('E-Mail oder Passwort falsch.');
    }
  };

  const handleLogout = () => {
    setCurrentUser(null);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (e) {}
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setAuthError('');
    const newUserEmail = loginForm.email.trim().toLowerCase();

    if (profiles.some(u => u.email.trim().toLowerCase() === newUserEmail)) {
      setAuthError('E-Mail wird bereits verwendet.');
      return;
    }

    const newId = Date.now().toString();
    const role = newUserEmail === TANNENHOF_CONFIG.adminEmail.toLowerCase() ? 'admin' : 'user';

    const newUser = {
      id: newId,
      email: loginForm.email,
      password: loginForm.password,
      name: loginForm.name,
      role,
      createdAt: new Date().toISOString()
    };

    setProfiles(prev => [...prev, newUser]);
    setCurrentUser(newUser);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newUser));
    } catch (e) {}

    showToast(role === 'admin' ? 'Admin-Konto erfolgreich erstellt!' : 'Registrierung erfolgreich!');
    await syncToFirebase('profiles', newId, newUser);
  };

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    if (newPassword.length < 6) {
      showToast('Das Passwort muss mindestens 6 Zeichen lang sein!', true);
      return;
    }
    const updatedUser = { ...currentUser, password: newPassword };
    setCurrentUser(updatedUser);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedUser));
    } catch (e) {}
    setNewPassword('');

    await syncToFirebase('profiles', currentUser.id, { password: newPassword });
    showToast('Dein Passwort wurde erfolgreich geändert!');
  };

  const canEditHorse = (horse) => {
    if (!currentUser) return false;
    if (currentUser.role === 'admin') return true;
    const uName = currentUser.name.trim().toLowerCase();
    return (horse.team || []).some(member => (member.name || '').trim().toLowerCase() === uName);
  };

  const handlePostMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim()) return;

    const newId = Date.now().toString();
    const msgData = { id: newId, text: newMessage, author: currentUser.name, createdAt: new Date().toISOString() };

    setMessages(prev => [...prev, msgData]);
    setNewMessage('');
    showToast('Nachricht gepostet!');
    await syncToFirebase('messages', newId, msgData);
  };

  const deleteMessage = async (id) => {
    setMessages(prev => prev.filter(m => m.id !== id));
    showToast('Nachricht gelöscht!');
    await syncToFirebase('messages', id, null, true);
  };

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 800;
        let width = img.width;
        let height = img.height;
        if (width > MAX_WIDTH) {
          height = height * (MAX_WIDTH / width);
          width = MAX_WIDTH;
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
        setHorseFormData(prev => ({ ...prev, image: dataUrl }));
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  };

  const saveHorse = async (e) => {
    e.preventDefault();
    if (!horseFormData.name) {
      showToast('Pferdename fehlt!', true);
      return;
    }

    const horseId = horseFormData.id || Date.now().toString();
    const validBlanketIds = new Set((horseFormData.blankets || []).map(b => b.id));
    const cleanActiveId = validBlanketIds.has(horseFormData.activeBlanketId) ? horseFormData.activeBlanketId : null;
    const rawNightId = getNightBlanketId(horseFormData);
    const cleanNightId = validBlanketIds.has(rawNightId) ? rawNightId : null;

    const sanitizedData = {
      id: horseId,
      name: horseFormData.name || '',
      feed: horseFormData.feed || '',
      notes: horseFormData.notes || '',
      image: horseFormData.image || '',
      vet: horseFormData.vet || '',
      vetPhone: horseFormData.vetPhone || '',
      farrier: horseFormData.farrier || '',
      farrierPhone: horseFormData.farrierPhone || '',
      activeBlanketId: cleanActiveId,
      nightBlanketId: cleanNightId,
      keepBlanketAtNight: Boolean(cleanNightId),
      blankets: (horseFormData.blankets || []).map(b => ({ id: b.id, name: b.name || '', description: b.description || '' })),
      team: (horseFormData.team || []).map(t => ({ id: t.id, role: t.role || '', name: t.name || '', phone: t.phone || '' })),
      createdAt: horseFormData.createdAt || new Date().toISOString()
    };

    if (horseFormData.id) {
      setHorses(prev => prev.map(h => h.id === horseId ? sanitizedData : h));
    } else {
      setHorses(prev => [...prev, sanitizedData]);
    }

    setIsEditingHorse(false);
    setSelectedHorse(null);
    showToast('Pferd erfolgreich gespeichert!');
    await syncToFirebase('horses', horseId, sanitizedData);
  };

  const deleteHorse = async (id) => {
    setHorses(prev => prev.filter(h => h.id !== id));
    setIsEditingHorse(false);
    setSelectedHorse(null);
    showToast('Pferd gelöscht!');
    await syncToFirebase('horses', id, null, true);
  };

  const toggleBlanket = async (horseId, blanketId) => {
    const newVal = blanketId === "" ? null : blanketId;
    const targetHorse = horses.find(h => h.id === horseId);
    const currentNightId = targetHorse ? getNightBlanketId(targetHorse) : null;
    const updates = { activeBlanketId: newVal, nightBlanketId: currentNightId };
    setHorses(prev => prev.map(h => h.id === horseId ? { ...h, ...updates } : h));
    showToast('Decke für tagsüber aktualisiert!');
    await syncToFirebase('horses', horseId, updates);
  };

  const toggleNightBlanket = async (horseId, blanketId) => {
    const newVal = blanketId === "" ? null : blanketId;
    const updates = { nightBlanketId: newVal, keepBlanketAtNight: Boolean(newVal) };
    setHorses(prev => prev.map(h => h.id === horseId ? { ...h, ...updates } : h));
    showToast(newVal ? 'Nacht-Decke gespeichert!' : 'Abends keine Decke!');
    await syncToFirebase('horses', horseId, updates);
  };

  // --- DIENSTPLAN: JEDER DARF FÜR JEDES PFERD EINTRAGEN ---
  const addShift = async (date, horse = null) => {
    const newId = Date.now().toString();
    const shiftData = {
      id: newId,
      date,
      type: 'daily',
      userId: currentUser.id,
      userName: currentUser.name,
      horseId: horse ? horse.id : null,
      horseName: horse ? horse.name : null
    };
    setShifts(prev => [...prev, shiftData]);
    setShiftPickerSlot(null);
    showToast(horse ? `${TANNENHOF_CONFIG.shiftLabel} für ${horse.name} eingetragen!` : 'Erfolgreich eingetragen!');
    await syncToFirebase('shifts', newId, shiftData);
  };

  const handleOpenShiftPicker = (date, label) => {
    // Wenn noch keine Pferde angelegt sind, direkt unter dem eigenen Namen eintragen
    if (sortedHorses.length === 0) {
      addShift(date, null);
      return;
    }
    // Ansonsten immer Auswahl aller Pferde anzeigen, damit jeder für jedes Pferd eintragen kann
    setShiftPickerSlot({ date, label });
  };

  const canRemoveShift = (shift) => {
    if (!currentUser) return false;
    if (currentUser.role === 'admin') return true;
    if (shift.userId === currentUser.id) return true;
    if (shift.horseId) {
      const horse = horses.find(h => h.id === shift.horseId);
      if (horse && canEditHorse(horse)) return true;
    }
    return false;
  };

  const removeShift = async (shiftId) => {
    setShifts(prev => prev.filter(s => s.id !== shiftId));
    showToast('Ausgetragen!');
    await syncToFirebase('shifts', shiftId, null, true);
  };

  // --- DERIVED STATE ---
  const sortedMessages = [...messages].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const sortedHorses = [...horses].sort((a, b) => a.name.localeCompare(b.name));
  const blanketHorses = sortedHorses.filter(h => h.activeBlanketId);
  const nightBlanketHorses = sortedHorses.filter(h => getNightBlanketId(h));
  const nightOnlyHorses = sortedHorses.filter(h => !h.activeBlanketId && getNightBlanketId(h));
  const unblanketEveningHorses = blanketHorses.filter(h => !getNightBlanketId(h));

  const twoMonthsData = getTwoMonthsData();

  // --- RENDER LOGIN ---
  if (!currentUser) {
    return (
      <div className="min-h-screen bg-stone-100 flex items-center justify-center p-4 font-sans text-black">
        <div className="bg-white p-6 rounded-3xl shadow-xl w-full max-w-sm border border-stone-300">
          <div className="text-center mb-6">
            <TannenhofLogo size="lg" />
          </div>

          {authError && <div className="bg-red-50 text-red-700 p-3 rounded-xl text-xs font-bold text-center mb-4 border border-red-200">{authError}</div>}

          {isLoginMode ? (
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-stone-600 mb-1 block">E-Mail Adresse</label>
                <input type="email" value={loginForm.email} onChange={e => setLoginForm({ ...loginForm, email: e.target.value })} required className="w-full bg-white text-black border border-gray-300 rounded-xl px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600" placeholder="z.B. user@stall.de" />
              </div>
              <div>
                <label className="text-xs font-bold text-stone-600 mb-1 block">Passwort</label>
                <input type="password" value={loginForm.password} onChange={e => setLoginForm({ ...loginForm, password: e.target.value })} required className="w-full bg-white text-black border border-gray-300 rounded-xl px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600" placeholder="Dein Passwort" />
              </div>
              <button type="submit" className="w-full bg-emerald-800 text-white font-bold py-3.5 rounded-xl shadow-md hover:bg-emerald-900 transition-colors mt-2">Einloggen</button>

              <div className="text-sm text-stone-500 text-center pt-4">
                Neu am Stall? <br />
                <button type="button" onClick={() => setIsLoginMode(false)} className="text-emerald-700 font-bold underline mt-1">Hier registrieren</button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleRegister} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-stone-600 mb-1 block">Vor- & Nachname</label>
                <input type="text" value={loginForm.name} onChange={e => setLoginForm({ ...loginForm, name: e.target.value })} required className="w-full bg-white text-black border border-gray-300 rounded-xl px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600" placeholder="Dein Name" />
              </div>
              <div>
                <label className="text-xs font-bold text-stone-600 mb-1 block">E-Mail Adresse</label>
                <input type="email" value={loginForm.email} onChange={e => setLoginForm({ ...loginForm, email: e.target.value })} required className="w-full bg-white text-black border border-gray-300 rounded-xl px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600" placeholder="Deine E-Mail" />
              </div>
              <div>
                <label className="text-xs font-bold text-stone-600 mb-1 block">Passwort festlegen</label>
                <input type="password" value={loginForm.password} onChange={e => setLoginForm({ ...loginForm, password: e.target.value })} required className="w-full bg-white text-black border border-gray-300 rounded-xl px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600" placeholder="Mindestens 6 Zeichen" />
              </div>
              <button type="submit" className="w-full bg-amber-700 text-white font-bold py-3.5 rounded-xl shadow-md hover:bg-amber-800 transition-colors mt-2">Konto erstellen</button>

              <div className="text-sm text-stone-500 text-center pt-4">
                Bereits registriert? <br />
                <button type="button" onClick={() => setIsLoginMode(true)} className="text-emerald-700 font-bold underline mt-1">Zurück zum Login</button>
              </div>
            </form>
          )}
        </div>
      </div>
    );
  }

  // --- RENDER APP ---
  return (
    <div className="min-h-screen bg-stone-100 text-black font-sans max-w-2xl mx-auto shadow-xl relative flex flex-col pb-20">

      {/* GLOBAL TOAST FEEDBACK */}
      {toast && (
        <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-full shadow-2xl font-bold text-sm text-white flex items-center gap-2 transition-all ${toast.isError ? 'bg-rose-600' : 'bg-emerald-600'}`}>
          {toast.isError ? <AlertTriangle className="w-5 h-5" /> : <CheckCircle className="w-5 h-5" />}
          {toast.msg}
        </div>
      )}

      {/* MODAL: PFERD FÜR DIENST AUSWÄHLEN (ALLE PFERDE VERFÜGBAR) */}
      {shiftPickerSlot && (
        <div
          className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-4"
          onClick={() => setShiftPickerSlot(null)}
        >
          <div
            className="bg-white w-full max-w-sm rounded-3xl p-5 shadow-2xl border border-stone-300 space-y-4"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex justify-between items-start border-b border-gray-200 pb-3">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 block">
                  {TANNENHOF_CONFIG.shiftLabel} • {shiftPickerSlot.label}
                </span>
                <h3 className="text-lg font-black text-black mt-0.5">Für welches Pferd?</h3>
              </div>
              <button
                type="button"
                onClick={() => setShiftPickerSlot(null)}
                className="bg-stone-100 text-stone-600 p-1.5 rounded-xl border border-gray-300 hover:bg-stone-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2 max-h-72 overflow-y-auto">
              {sortedHorses.map(h => (
                <button
                  key={h.id}
                  type="button"
                  onClick={() => addShift(shiftPickerSlot.date, h)}
                  className="w-full flex items-center justify-between p-3 rounded-2xl bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 text-left transition-colors shadow-sm"
                >
                  <div className="flex items-center gap-3">
                    {h.image ? (
                      <img src={h.image} alt={h.name} className="w-10 h-10 rounded-full object-cover border border-emerald-300 shrink-0" />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-emerald-800 text-white text-base flex items-center justify-center shrink-0">
                        🐴
                      </div>
                    )}
                    <div>
                      <span className="font-extrabold text-sm text-emerald-950 block">{h.name}</span>
                      <span className="text-[11px] text-emerald-700 font-medium">
                        Dienst übernimmt: {currentUser.name}
                      </span>
                    </div>
                  </div>
                  <Plus className="w-5 h-5 text-emerald-800 shrink-0" />
                </button>
              ))}
            </div>

            <div className="pt-2 border-t border-gray-200">
              <button
                type="button"
                onClick={() => addShift(shiftPickerSlot.date, null)}
                className="w-full py-2.5 px-3 rounded-xl bg-stone-100 hover:bg-stone-200 border border-gray-300 text-xs font-bold text-stone-700 transition-colors"
              >
                Ohne Pferd eintragen (nur {currentUser.name})
              </button>
            </div>
          </div>
        </div>
      )}

      {/* HEADER */}
      <header className="sticky top-0 z-30 bg-emerald-900 text-white px-4 py-2.5 flex items-center justify-between shadow-md">
        <div className="flex items-center gap-2.5">
          <div className="bg-white p-1 rounded-xl shadow-sm shrink-0">
            <TannenhofLogo size="sm" />
          </div>
          <span className="font-black text-sm block tracking-wide">{TANNENHOF_CONFIG.appName}</span>
        </div>
        <div className="flex flex-col items-end">
          <span className="text-[10px] font-bold text-emerald-900 bg-emerald-100 px-2 py-0.5 rounded flex items-center gap-1">
            {currentUser.role === 'admin' ? <ShieldCheck className="w-3 h-3" /> : <User className="w-3 h-3" />}
            {currentUser.name}
          </span>
          <button onClick={handleLogout} className="text-[10px] text-emerald-200 hover:text-white mt-1 font-bold underline">Logout</button>
        </div>
      </header>

      {/* MAIN CONTENT */}
      <main className="flex-1 p-4">

        {/* TAB: HOME */}
        {activeTab === 'home' && (
          <div className="space-y-4">

            {/* Heutiger Abäppeldienst Schnell-Card */}
            {(() => {
              const todayObj = twoMonthsData[0]?.days.find(d => d.isToday);
              const todayShift = todayObj ? shifts.find(s => s.date === todayObj.iso) : null;
              const matchedHorse = todayShift?.horseId
                ? horses.find(h => h.id === todayShift.horseId)
                : (todayShift?.horseName ? horses.find(h => (h.name || '').trim().toLowerCase() === todayShift.horseName.trim().toLowerCase()) : null);

              return (
                <div className="bg-emerald-800 text-white border border-emerald-900 rounded-2xl p-4 shadow-md flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    {todayShift?.horseName && (
                      matchedHorse?.image ? (
                        <img src={matchedHorse.image} alt={todayShift.horseName} className="w-12 h-12 rounded-full object-cover border-2 border-emerald-300 shrink-0" />
                      ) : (
                        <div className="w-12 h-12 rounded-full bg-emerald-950 text-white text-lg flex items-center justify-center border-2 border-emerald-400 shrink-0">
                          🐴
                        </div>
                      )
                    )}
                    <div className="min-w-0">
                      <span className="text-[10px] uppercase tracking-wider font-bold text-emerald-200 block">
                        Heute • {todayObj?.label}
                      </span>
                      {todayShift ? (
                        todayShift.horseName ? (
                          <div className="mt-0.5">
                            <h3 className="font-black text-base leading-tight truncate">{todayShift.horseName}</h3>
                            <p className="text-xs text-emerald-200 font-medium truncate">
                              {TANNENHOF_CONFIG.shiftLabel}: {todayShift.userName}
                            </p>
                          </div>
                        ) : (
                          <h3 className="font-extrabold text-base mt-0.5 truncate">
                            {TANNENHOF_CONFIG.shiftLabel}: {todayShift.userName}
                          </h3>
                        )
                      ) : (
                        <h3 className="font-extrabold text-base mt-0.5">
                          {TANNENHOF_CONFIG.shiftLabel} noch frei
                        </h3>
                      )}
                    </div>
                  </div>
                  {!todayShift && todayObj && (
                    <button
                      onClick={() => handleOpenShiftPicker(todayObj.iso, todayObj.label)}
                      className="bg-white text-emerald-900 hover:bg-emerald-50 font-extrabold text-xs px-3.5 py-2 rounded-xl shadow shrink-0 flex items-center gap-1"
                    >
                      <Plus className="w-4 h-4" /> Übernehmen
                    </button>
                  )}
                </div>
              );
            })()}

            {/* OPTIONALER DECKENSERVICE */}
            {TANNENHOF_CONFIG.showBlanketService && (
              <div className="grid grid-cols-1 gap-3">
                <div className="bg-emerald-800 text-white border border-emerald-900 rounded-2xl p-4 shadow-md">
                  <h3 className="font-extrabold flex items-center gap-2 mb-2"><CheckCircle className="w-5 h-5" /> Morgens (Decken AN)</h3>
                  {blanketHorses.length === 0 ? <p className="text-sm">Aktuell keine Decken für tagsüber nötig.</p> : (
                    <ul className="space-y-2 mt-3">
                      {blanketHorses.map(h => {
                        const nId = getNightBlanketId(h);
                        const dayBlanket = (h.blankets || []).find(b => b.id === h.activeBlanketId)?.name;
                        const nightBlanket = nId ? (h.blankets || []).find(b => b.id === nId)?.name : null;
                        return (
                          <li key={h.id} className="flex items-center justify-between gap-2 bg-emerald-900 p-2.5 rounded-xl border border-emerald-700">
                            <span className="text-sm font-bold">{h.name}</span>
                            <div className="flex items-center gap-2 flex-wrap justify-end">
                              <span className="text-xs text-amber-300 font-bold">{dayBlanket}</span>
                              {nId && nId === h.activeBlanketId && (
                                <span className="text-[10px] bg-indigo-950 text-indigo-200 border border-indigo-500 px-2 py-0.5 rounded-full font-bold flex items-center gap-1">
                                  <Moon className="w-3 h-3" /> + Nacht
                                </span>
                              )}
                              {nId && nId !== h.activeBlanketId && nightBlanket && (
                                <span className="text-[10px] bg-indigo-950 text-indigo-200 border border-indigo-500 px-2 py-0.5 rounded-full font-bold flex items-center gap-1">
                                  <Moon className="w-3 h-3" /> Nachts: {nightBlanket}
                                </span>
                              )}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                  {nightOnlyHorses.length > 0 && (
                    <p className="text-xs text-emerald-200 mt-3 pt-2 border-t border-emerald-700">
                      Hinweis: Bei <strong>{nightOnlyHorses.map(h => h.name).join(', ')}</strong> morgens die Nacht-Decke abnehmen.
                    </p>
                  )}
                </div>

                <div className="bg-stone-800 text-white border border-stone-900 rounded-2xl p-4 shadow-md">
                  <h3 className="font-extrabold flex items-center gap-2 mb-2"><CheckCircle className="w-5 h-5" /> Abends (Decken AUS / Nacht)</h3>
                  {nightBlanketHorses.length > 0 ? (
                    <div className="space-y-3 mt-2">
                      <div className="bg-indigo-950 border border-indigo-400 rounded-xl p-3">
                        <p className="text-xs font-extrabold uppercase tracking-wide text-indigo-200 flex items-center gap-1.5 mb-2">
                          <Moon className="w-4 h-4 text-amber-300" /> Decke für die NACHT:
                        </p>
                        <ul className="space-y-1.5">
                          {nightBlanketHorses.map(h => {
                            const nId = getNightBlanketId(h);
                            const nightBlanket = (h.blankets || []).find(b => b.id === nId)?.name;
                            const dayBlanket = h.activeBlanketId ? (h.blankets || []).find(b => b.id === h.activeBlanketId)?.name : null;
                            const isSame = h.activeBlanketId === nId;
                            const isSwitch = Boolean(h.activeBlanketId) && !isSame;

                            return (
                              <li key={h.id} className="flex items-center justify-between gap-2 bg-indigo-900/70 px-2.5 py-2 rounded-lg text-sm">
                                <span className="font-extrabold text-white">{h.name}</span>
                                <div className="text-right">
                                  {isSame && <span className="text-xs font-bold text-amber-300">{nightBlanket} <span className="text-[10px] bg-indigo-800 text-indigo-100 px-1.5 py-0.5 rounded ml-1">anlassen</span></span>}
                                  {isSwitch && <span className="text-xs font-bold text-amber-300"><span className="text-stone-300 line-through mr-1">{dayBlanket}</span> ➔ {nightBlanket}</span>}
                                  {!h.activeBlanketId && <span className="text-xs font-bold text-amber-300">{nightBlanket} <span className="text-[10px] bg-emerald-500/20 text-emerald-200 border border-emerald-400/40 px-1.5 py-0.5 rounded ml-1">anziehen</span></span>}
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                      <p className="text-sm text-stone-200">
                        {unblanketEveningHorses.length > 0
                          ? <>Bei <strong>{unblanketEveningHorses.map(h => h.name).join(', ')}</strong> die Tages-Decke abnehmen.</>
                          : 'Bei allen anderen Pferden ohne Nacht-Decke die Paddock-Decken abnehmen.'}
                      </p>
                    </div>
                  ) : (
                    <p className="text-sm">Bitte alle Paddock-Decken bei den Pferden abnehmen und ordentlich aufhängen.</p>
                  )}
                </div>
              </div>
            )}

            {/* Schwarzes Brett */}
            <div className="bg-white border border-gray-300 rounded-2xl p-4 shadow-sm">
              <h2 className="font-extrabold text-black mb-3 flex items-center gap-2"><MessageSquare className="w-5 h-5 text-emerald-700" /> Schwarzes Brett</h2>
              <form onSubmit={handlePostMessage} className="flex gap-2 mb-4">
                <input type="text" required value={newMessage} onChange={(e) => setNewMessage(e.target.value)} placeholder="Kurze Nachricht an alle..." className="flex-1 bg-white text-black border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600" />
                <button type="submit" className="bg-emerald-700 text-white font-bold px-4 py-2 rounded-xl hover:bg-emerald-800 transition-colors"><Send className="w-4 h-4" /></button>
              </form>
              <div className="space-y-3">
                {sortedMessages.map(m => (
                  <div key={m.id} className="bg-stone-50 border border-gray-300 p-3 rounded-xl shadow-sm">
                    <div className="flex justify-between items-baseline mb-1">
                      <span className="text-xs font-bold text-emerald-800">{m.author}</span>
                      <div className="flex items-center gap-3">
                        <span className="text-[10px] text-stone-500">{new Date(m.createdAt).toLocaleDateString('de-DE')}</span>
                        <button onClick={() => deleteMessage(m.id)} className="text-rose-600 hover:text-rose-800 p-0.5" title="Nachricht löschen">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                    <p className="text-sm text-black">{m.text}</p>
                  </div>
                ))}
                {sortedMessages.length === 0 && <p className="text-sm text-stone-500 italic">Noch keine Nachrichten am Brett.</p>}
              </div>
            </div>
          </div>
        )}

        {/* TAB: PFERDE */}
        {activeTab === 'pferde' && (
          <div className="space-y-4">
            {!isEditingHorse && !selectedHorse && (
              <>
                <button onClick={() => {
                  setHorseFormData({ name: '', feed: '', notes: '', image: '', vet: '', vetPhone: '', farrier: '', farrierPhone: '', activeBlanketId: null, nightBlanketId: null, blankets: [{ id: Date.now().toString(), name: 'Regendecke', description: '' }], team: [{ id: Date.now().toString(), name: currentUser.name, role: 'Besitzer', phone: '' }] });
                  setIsEditingHorse(true);
                }} className="w-full bg-emerald-700 hover:bg-emerald-800 transition-colors text-white font-bold py-3.5 rounded-2xl shadow-md flex items-center justify-center gap-2">
                  <Plus className="w-5 h-5" /> Neues Pferd anlegen
                </button>

                <div className="grid grid-cols-1 gap-3">
                  {sortedHorses.map(h => {
                    const nightId = getNightBlanketId(h);
                    return (
                      <div key={h.id} className="bg-white border border-gray-300 rounded-2xl p-4 shadow-sm cursor-pointer hover:border-emerald-500 transition-colors" onClick={() => setSelectedHorse(h)}>
                        <div className="flex justify-between items-center">
                          <div className="flex items-center gap-3">
                            {h.image ? (
                              <img src={h.image} alt={h.name} className="w-12 h-12 rounded-full object-cover border-2 border-stone-200" />
                            ) : (
                              <div className="w-12 h-12 rounded-full bg-stone-200 flex items-center justify-center border-2 border-stone-300 text-stone-400"><Camera className="w-5 h-5" /></div>
                            )}
                            <div>
                              <h3 className="font-extrabold text-lg text-black">{h.name}</h3>
                              {(h.team || []).length > 0 && (
                                <p className="text-xs text-stone-500 font-medium">
                                  {(h.team || []).map(t => t.name).filter(Boolean).join(', ')}
                                </p>
                              )}
                            </div>
                          </div>
                          <span className="text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-lg text-xs font-bold">Akte →</span>
                        </div>

                        {TANNENHOF_CONFIG.showBlanketService && (
                          <div className="mt-3 pt-3 border-t border-gray-200 space-y-2.5" onClick={e => e.stopPropagation()}>
                            <div>
                              <label className="text-[10px] uppercase font-bold text-stone-500 block mb-1">Decke tagsüber:</label>
                              {canEditHorse(h) ? (
                                <select value={h.activeBlanketId || ''} onChange={e => toggleBlanket(h.id, e.target.value)} className="w-full bg-white text-black border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600 font-bold">
                                  <option value="">🚫 Keine Decke anziehen</option>
                                  {(h.blankets || []).map(b => (
                                    <option key={b.id} value={b.id}>🧥 {b.name} {b.description && `(${b.description})`}</option>
                                  ))}
                                </select>
                              ) : (
                                <div className="w-full bg-stone-100 text-stone-700 border border-gray-300 text-sm rounded-xl px-3 py-2 font-bold">
                                  {h.activeBlanketId ? `🧥 ${(h.blankets || []).find(b => b.id === h.activeBlanketId)?.name}` : '🚫 Keine Decke'}
                                </div>
                              )}
                            </div>
                            <div>
                              <label className="text-[10px] uppercase font-bold text-indigo-800 flex items-center gap-1 mb-1">
                                <Moon className="w-3 h-3" /> Decke nachts:
                              </label>
                              {canEditHorse(h) ? (
                                <select
                                  value={nightId || ''}
                                  onChange={e => toggleNightBlanket(h.id, e.target.value)}
                                  className={`w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-600 font-bold ${nightId ? 'bg-indigo-50 text-indigo-950 border-indigo-300' : 'bg-white text-black border-gray-300'}`}
                                >
                                  <option value="">🚫 Keine Decke (abends abnehmen)</option>
                                  {(h.blankets || []).map(b => (
                                    <option key={b.id} value={b.id}>🌙 {b.name} {b.description && `(${b.description})`}</option>
                                  ))}
                                </select>
                              ) : (
                                <div className={`w-full border text-sm rounded-xl px-3 py-2 font-bold ${nightId ? 'bg-indigo-50 text-indigo-900 border-indigo-200' : 'bg-stone-100 text-stone-700 border-gray-300'}`}>
                                  {nightId ? `🌙 ${(h.blankets || []).find(b => b.id === nightId)?.name}` : '🚫 Keine Decke'}
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {sortedHorses.length === 0 && <p className="text-center text-stone-500 mt-4">Noch keine Pferde in der Kartei.</p>}
                </div>
              </>
            )}

            {/* Detail View */}
            {selectedHorse && !isEditingHorse && (
              <div className="space-y-4">
                <button onClick={() => setSelectedHorse(null)} className="text-emerald-700 font-bold text-sm flex items-center gap-1 bg-white px-3 py-1.5 rounded-lg border border-gray-300 shadow-sm hover:bg-stone-50">← Zurück zur Übersicht</button>
                <div className="bg-white border border-gray-300 rounded-2xl p-4 shadow-sm overflow-hidden relative">
                  {selectedHorse.image && (
                    <img src={selectedHorse.image} alt={selectedHorse.name} className="w-full h-48 object-cover rounded-xl mb-4 border border-stone-200 shadow-inner" />
                  )}

                  <div className="flex justify-between items-start mb-4">
                    <h2 className="text-2xl font-black text-black">{selectedHorse.name}</h2>
                    {canEditHorse(selectedHorse) && (
                      <button onClick={() => { setHorseFormData(selectedHorse); setIsEditingHorse(true); }} className="bg-stone-100 border border-gray-300 p-2 rounded-xl text-black hover:bg-stone-200 shadow-sm"><Edit2 className="w-5 h-5" /></button>
                    )}
                  </div>

                  <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 mb-4">
                    <h3 className="text-emerald-900 font-extrabold text-sm mb-3 flex items-center gap-1.5"><Info className="w-4 h-4" /> Tägliche Versorgung</h3>
                    <div className="space-y-2">
                      <div className="bg-white text-black border border-gray-300 p-3 rounded-xl shadow-sm">
                        <span className="text-[10px] uppercase font-bold text-emerald-700 block mb-1">Futterration</span>
                        <p className="text-sm font-bold whitespace-pre-wrap">{selectedHorse.feed || 'Nicht hinterlegt'}</p>
                      </div>
                      {TANNENHOF_CONFIG.showBlanketService && (
                        <>
                          <div className="bg-white text-black border border-gray-300 p-3 rounded-xl shadow-sm">
                            <span className="text-[10px] uppercase font-bold text-emerald-700 block mb-1">Decke tagsüber</span>
                            <p className="text-sm font-bold">
                              {selectedHorse.activeBlanketId
                                ? `🧥 ${(selectedHorse.blankets || []).find(b => b.id === selectedHorse.activeBlanketId)?.name}`
                                : '🚫 Keine Decke'}
                            </p>
                          </div>
                          <div className="bg-white text-black border border-gray-300 p-3 rounded-xl shadow-sm">
                            <span className="text-[10px] uppercase font-bold text-indigo-700 block mb-1">Decke nachts</span>
                            <p className="text-sm font-bold">
                              {getNightBlanketId(selectedHorse)
                                ? `🌙 ${(selectedHorse.blankets || []).find(b => b.id === getNightBlanketId(selectedHorse))?.name}`
                                : '🚫 Keine Decke (abends abnehmen)'}
                            </p>
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="bg-white border border-gray-300 rounded-2xl p-4 shadow-sm mb-4">
                    <h3 className="text-black font-extrabold text-sm mb-3 flex items-center gap-1.5"><Heart className="w-4 h-4 text-rose-600" /> Gesundheit & Betreuung</h3>
                    <div className="space-y-2">
                      <div className="bg-stone-50 p-3 rounded-xl border border-gray-300 flex justify-between items-center shadow-sm">
                        <div><span className="text-[10px] text-stone-500 font-bold block mb-1">Tierarzt</span><span className="text-sm font-bold text-black">{selectedHorse.vet || 'Nicht hinterlegt'}</span></div>
                        {selectedHorse.vetPhone && <a href={`tel:${selectedHorse.vetPhone}`} className="bg-emerald-600 hover:bg-emerald-700 text-white p-2 rounded-lg shadow-sm"><Phone className="w-4 h-4" /></a>}
                      </div>
                      <div className="bg-stone-50 p-3 rounded-xl border border-gray-300 flex justify-between items-center shadow-sm">
                        <div><span className="text-[10px] text-stone-500 font-bold block mb-1">Hufschmied</span><span className="text-sm font-bold text-black">{selectedHorse.farrier || 'Nicht hinterlegt'}</span></div>
                        {selectedHorse.farrierPhone && <a href={`tel:${selectedHorse.farrierPhone}`} className="bg-emerald-600 hover:bg-emerald-700 text-white p-2 rounded-lg shadow-sm"><Phone className="w-4 h-4" /></a>}
                      </div>
                      {selectedHorse.notes && (
                        <div className="bg-rose-50 border border-rose-200 p-3 rounded-xl mt-2 shadow-sm">
                          <span className="text-[10px] uppercase font-bold text-rose-800 block mb-1">Medizinische Hinweise (Allergien etc.)</span>
                          <p className="text-sm text-black font-bold whitespace-pre-wrap">{selectedHorse.notes}</p>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="bg-white border border-gray-300 rounded-2xl p-4 shadow-sm">
                    <h3 className="text-black font-extrabold text-sm mb-3 flex items-center gap-1.5"><Users className="w-4 h-4 text-stone-600" /> Team (Berechtigungen)</h3>
                    <div className="space-y-2">
                      {(selectedHorse.team || []).map((t, idx) => (
                        <div key={idx} className="bg-stone-50 p-3 rounded-xl border border-gray-300 shadow-sm flex justify-between items-center">
                          <div>
                            <span className="text-[10px] font-bold text-emerald-700 block mb-1">{t.role}</span>
                            <div className="text-sm text-black font-bold">{t.name}</div>
                          </div>
                          {t.phone && <a href={`tel:${t.phone}`} className="bg-emerald-600 text-white p-2 rounded-lg shadow-sm"><Phone className="w-4 h-4" /></a>}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Edit Form View */}
            {isEditingHorse && horseFormData && (
              <form onSubmit={saveHorse} className="bg-white border border-gray-300 rounded-2xl p-4 shadow-sm">
                <div className="flex justify-between items-center mb-4 pb-2 border-b border-gray-200">
                  <h2 className="text-xl font-black text-black">Pferdeakte bearbeiten</h2>
                  <button type="button" onClick={() => { setIsEditingHorse(false); if (!horseFormData.id) setSelectedHorse(null); }} className="text-stone-500 bg-stone-100 p-2 rounded-lg border border-gray-300 hover:bg-stone-200"><X className="w-5 h-5" /></button>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="text-xs font-bold text-stone-600 mb-2 block">Profilbild</label>
                    <div className="flex items-center gap-4">
                      {horseFormData.image ? (
                        <img src={horseFormData.image} alt="Vorschau" className="w-16 h-16 rounded-full object-cover border border-gray-300" />
                      ) : (
                        <div className="w-16 h-16 rounded-full bg-stone-100 border border-gray-300 flex items-center justify-center text-stone-400"><Camera className="w-6 h-6" /></div>
                      )}
                      <input type="file" accept="image/*" onChange={handleImageUpload} className="block w-full text-sm text-stone-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-emerald-50 file:text-emerald-700 hover:file:bg-emerald-100" />
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-bold text-stone-600 mb-1 block">Name des Pferdes *</label>
                    <input type="text" required value={horseFormData.name} onChange={e => setHorseFormData({ ...horseFormData, name: e.target.value })} placeholder="Pferdename" className="w-full bg-white text-black border border-gray-300 rounded-xl px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600" />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-stone-600 mb-1 block">Tägliche Futterration</label>
                    <textarea value={horseFormData.feed} onChange={e => setHorseFormData({ ...horseFormData, feed: e.target.value })} placeholder="Welches Futter bekommt das Pferd?" className="w-full bg-white text-black border border-gray-300 rounded-xl px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600 min-h-[80px]" />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-stone-600 mb-1 block">Besondere Hinweise (Krankheiten, Allergien)</label>
                    <textarea value={horseFormData.notes} onChange={e => setHorseFormData({ ...horseFormData, notes: e.target.value })} placeholder="Wichtige Infos für Vertretungen..." className="w-full bg-white text-black border border-gray-300 rounded-xl px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600 min-h-[80px]" />
                  </div>

                  {TANNENHOF_CONFIG.showBlanketService && (
                    <div className="pt-3 border-t border-gray-200">
                      <h3 className="font-extrabold text-sm mb-3 text-black">Decken-Schrank</h3>
                      {(horseFormData.blankets || []).map((b, idx) => (
                        <div key={b.id} className="flex flex-col gap-2 mb-4 bg-stone-50 p-3 rounded-xl border border-gray-300 shadow-sm">
                          <div className="flex justify-between items-center">
                            <span className="text-xs font-bold text-stone-500 uppercase tracking-wide">Decke {idx + 1}</span>
                            <button type="button" onClick={() => setHorseFormData({ ...horseFormData, blankets: horseFormData.blankets.filter((_, i) => i !== idx) })} className="text-rose-600 bg-rose-50 p-1 rounded border border-rose-200 hover:bg-rose-100"><X className="w-4 h-4" /></button>
                          </div>
                          <input type="text" value={b.name} onChange={e => {
                            const newB = [...horseFormData.blankets];
                            newB[idx].name = e.target.value;
                            setHorseFormData({ ...horseFormData, blankets: newB });
                          }} placeholder="Name der Decke (z.B. Winterdecke)" className="w-full bg-white text-black border border-gray-300 rounded-xl px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600" />
                          <input type="text" value={b.description} onChange={e => {
                            const newB = [...horseFormData.blankets];
                            newB[idx].description = e.target.value;
                            setHorseFormData({ ...horseFormData, blankets: newB });
                          }} placeholder="Beschreibung (z.B. 200g, blau)" className="w-full bg-white text-black border border-gray-300 rounded-xl px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600" />
                        </div>
                      ))}
                      <button type="button" onClick={() => setHorseFormData({ ...horseFormData, blankets: [...horseFormData.blankets, { id: Date.now().toString(), name: '', description: '' }] })} className="w-full text-sm bg-white text-emerald-800 border border-gray-300 py-2 rounded-xl font-bold hover:bg-stone-50">+ Weitere Decke hinzufügen</button>
                    </div>
                  )}

                  <div className="pt-3 border-t border-gray-200">
                    <h3 className="font-extrabold text-sm mb-3 text-black">Gesundheit Kontakte</h3>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[10px] font-bold text-stone-600 mb-1 block">Tierarzt Name</label>
                        <input type="text" value={horseFormData.vet} onChange={e => setHorseFormData({ ...horseFormData, vet: e.target.value })} className="w-full bg-white text-black border border-gray-300 rounded-xl px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600" />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-stone-600 mb-1 block">Tierarzt Telefon</label>
                        <input type="tel" value={horseFormData.vetPhone} onChange={e => setHorseFormData({ ...horseFormData, vetPhone: e.target.value })} className="w-full bg-white text-black border border-gray-300 rounded-xl px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600" />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-stone-600 mb-1 block">Hufschmied Name</label>
                        <input type="text" value={horseFormData.farrier} onChange={e => setHorseFormData({ ...horseFormData, farrier: e.target.value })} className="w-full bg-white text-black border border-gray-300 rounded-xl px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600" />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-stone-600 mb-1 block">Hufschmied Telefon</label>
                        <input type="tel" value={horseFormData.farrierPhone} onChange={e => setHorseFormData({ ...horseFormData, farrierPhone: e.target.value })} className="w-full bg-white text-black border border-gray-300 rounded-xl px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600" />
                      </div>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-gray-200">
                    <h3 className="font-extrabold text-sm mb-3 text-black">Team (Berechtigungen)</h3>
                    <p className="text-xs text-stone-500 mb-3">Trage den exakten Namen des App-Nutzers ein, damit er/sie die Pferdeakte bearbeiten darf.</p>
                    {(horseFormData.team || []).map((t, idx) => (
                      <div key={t.id} className="flex flex-col gap-2 mb-4 bg-stone-50 p-3 rounded-xl border border-gray-300 shadow-sm">
                        <div className="flex justify-between items-center">
                          <select value={t.role} onChange={e => {
                            const newT = [...horseFormData.team];
                            newT[idx].role = e.target.value;
                            setHorseFormData({ ...horseFormData, team: newT });
                          }} className="bg-white text-black border border-gray-300 rounded-lg px-2 py-1 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-emerald-600">
                            <option>Besitzer</option>
                            <option>Reitbeteiligung</option>
                            <option>Pfleger</option>
                          </select>
                          <button type="button" onClick={() => setHorseFormData({ ...horseFormData, team: horseFormData.team.filter((_, i) => i !== idx) })} className="text-rose-600 bg-rose-50 p-1 rounded border border-rose-200 hover:bg-rose-100"><X className="w-4 h-4" /></button>
                        </div>
                        <input type="text" value={t.name} onChange={e => {
                          const newT = [...horseFormData.team];
                          newT[idx].name = e.target.value;
                          setHorseFormData({ ...horseFormData, team: newT });
                        }} placeholder="Exakter Name des Nutzers" className="w-full bg-white text-black border border-gray-300 rounded-xl px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600" />
                        <input type="tel" value={t.phone} onChange={e => {
                          const newT = [...horseFormData.team];
                          newT[idx].phone = e.target.value;
                          setHorseFormData({ ...horseFormData, team: newT });
                        }} placeholder="Handynummer (Optional)" className="w-full bg-white text-black border border-gray-300 rounded-xl px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600" />
                      </div>
                    ))}
                    <button type="button" onClick={() => setHorseFormData({ ...horseFormData, team: [...horseFormData.team, { id: Date.now().toString(), name: '', role: 'Reitbeteiligung', phone: '' }] })} className="w-full text-sm bg-white text-emerald-800 border border-gray-300 py-2 rounded-xl font-bold hover:bg-stone-50">+ Person hinzufügen</button>
                  </div>

                  <div className="pt-4 border-t border-gray-200 space-y-2">
                    <button type="submit" disabled={!horseFormData.name} className="w-full bg-emerald-800 text-white font-bold py-3.5 rounded-xl shadow-md disabled:opacity-50 hover:bg-emerald-900 transition-colors">Speichern & Schließen</button>
                    {horseFormData.id && <button type="button" onClick={() => deleteHorse(horseFormData.id)} className="w-full bg-white text-rose-600 border border-gray-300 font-bold py-3 rounded-xl flex justify-center items-center gap-2 hover:bg-stone-50 transition-colors"><Trash2 className="w-5 h-5" /> Akte endgültig löschen</button>}
                  </div>
                </div>
              </form>
            )}
          </div>
        )}

        {/* TAB: PLÄNE (DIREKT 2-MONATS-ABÄPPELPLAN OHNE ANLAGENBELEGUNG) */}
        {activeTab === 'pläne' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2">
              {twoMonthsData.map((month, idx) => {
                const filledCount = month.days.filter(d => shifts.some(s => s.date === d.iso)).length;
                return (
                  <button
                    key={month.id}
                    onClick={() => setSelectedMonthIdx(idx)}
                    className={`p-3 rounded-2xl border text-left transition-all ${
                      selectedMonthIdx === idx
                        ? 'bg-emerald-800 text-white border-emerald-900 shadow-md'
                        : 'bg-white text-black border-gray-300 shadow-sm hover:bg-stone-50'
                    }`}
                  >
                    <div className="font-black text-sm">{month.title}</div>
                    <div className={`text-[11px] font-semibold mt-0.5 ${selectedMonthIdx === idx ? 'text-emerald-200' : 'text-stone-500'}`}>
                      {filledCount} / {month.days.length} Tage besetzt
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="space-y-2 mt-3">
              {twoMonthsData[selectedMonthIdx]?.days.map(day => {
                const dayShift = shifts.find(s => s.date === day.iso);
                const matchedHorse = dayShift?.horseId
                  ? horses.find(h => h.id === dayShift.horseId)
                  : (dayShift?.horseName ? horses.find(h => (h.name || '').trim().toLowerCase() === dayShift.horseName.trim().toLowerCase()) : null);

                return (
                  <div
                    key={day.iso}
                    className={`rounded-2xl p-3 border flex items-center justify-between gap-3 transition-colors ${
                      day.isToday
                        ? 'bg-emerald-50/80 border-emerald-500 shadow-md ring-1 ring-emerald-500'
                        : day.isWeekend
                          ? 'bg-stone-50 border-gray-300 shadow-sm'
                          : 'bg-white border-gray-300 shadow-sm'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 shrink-0 min-w-[105px]">
                      <div className={`w-9 h-9 rounded-xl flex flex-col items-center justify-center font-black text-xs border ${
                        day.isToday
                          ? 'bg-emerald-800 text-white border-emerald-900'
                          : day.isWeekend
                            ? 'bg-amber-100 text-amber-900 border-amber-300'
                            : 'bg-stone-100 text-black border-gray-300'
                      }`}>
                        <span>{String(day.dayNum).padStart(2, '0')}</span>
                      </div>
                      <div>
                        <span className="font-black text-sm text-black block leading-tight">{day.weekday}</span>
                        {day.isToday ? (
                          <span className="text-[10px] font-extrabold text-emerald-700 uppercase">Heute</span>
                        ) : (
                          <span className="text-[10px] text-stone-500 font-medium">{day.label.split(' ')[1]}</span>
                        )}
                      </div>
                    </div>

                    <div className="flex-1 min-w-0">
                      {dayShift ? (
                        <div className="flex justify-between items-center p-2.5 rounded-xl bg-emerald-50 border border-emerald-300 text-emerald-900 shadow-sm">
                          <div className="flex items-center gap-2.5 min-w-0 pr-1">
                            {dayShift.horseName ? (
                              <>
                                {matchedHorse?.image ? (
                                  <img src={matchedHorse.image} alt={dayShift.horseName} className="w-9 h-9 rounded-full object-cover border border-emerald-400 shrink-0" />
                                ) : (
                                  <div className="w-9 h-9 rounded-full bg-emerald-800 text-white text-sm flex items-center justify-center shrink-0">
                                    🐴
                                  </div>
                                )}
                                <div className="min-w-0">
                                  <span className="text-sm font-black text-emerald-950 block truncate">{dayShift.horseName}</span>
                                  <span className="text-xs font-semibold text-emerald-800 block truncate">{dayShift.userName}</span>
                                </div>
                              </>
                            ) : (
                              <span className="truncate block text-sm font-extrabold text-emerald-950">{dayShift.userName}</span>
                            )}
                          </div>
                          {canRemoveShift(dayShift) && (
                            <button
                              onClick={() => removeShift(dayShift.id)}
                              className="text-rose-600 bg-white border border-rose-200 rounded-lg px-2 py-1 hover:bg-rose-100 shrink-0"
                              title="Austragen"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      ) : (
                        <button
                          onClick={() => handleOpenShiftPicker(day.iso, day.label)}
                          className="w-full text-left text-xs font-bold text-emerald-800 bg-white border border-dashed border-emerald-400 hover:bg-emerald-50 p-2.5 rounded-xl flex items-center justify-between transition-colors"
                        >
                          <span>Frei – Eintragen</span>
                          <Plus className="w-4 h-4 text-emerald-700" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* TAB: MEHR (NUR KONTO & PASSWORT) */}
        {activeTab === 'mehr' && (
          <div className="space-y-5">
            <section className="bg-white border border-gray-300 rounded-2xl p-4 shadow-sm">
              <h2 className="font-black text-emerald-900 text-lg mb-4 flex items-center gap-2 border-b border-emerald-100 pb-2"><ShieldCheck className="w-5 h-5" /> Mein Passwort ändern</h2>
              <form onSubmit={handlePasswordChange} className="space-y-4">
                <div>
                  <label className="text-xs font-bold text-stone-600 mb-1 block">Neues Passwort festlegen</label>
                  <input type="password" required value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="Mindestens 6 Zeichen" className="w-full bg-white text-black border border-gray-300 rounded-xl px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600" />
                </div>
                <button type="submit" className="w-full bg-emerald-700 hover:bg-emerald-800 text-white font-bold py-3.5 rounded-xl shadow-md transition-colors">Passwort speichern</button>
              </form>
              <p className="text-xs text-stone-500 mt-3">Nach dem Speichern ist dein neues Passwort direkt in der Datenbank gesichert.</p>
            </section>

            <section className="bg-white border border-gray-300 rounded-2xl p-4 shadow-sm">
              <h2 className="font-black text-black text-base mb-2 flex items-center gap-2"><User className="w-4 h-4 text-emerald-700" /> Angemeldet als {currentUser.name}</h2>
              <p className="text-xs text-stone-500 mb-4">{currentUser.email}</p>
              <button onClick={handleLogout} className="w-full bg-stone-100 hover:bg-stone-200 text-stone-800 border border-gray-300 font-bold py-3 rounded-xl transition-colors">
                Ausloggen
              </button>
            </section>
          </div>
        )}
      </main>

      {/* BOTTOM NAVIGATION */}
      <nav className="fixed bottom-0 w-full max-w-2xl bg-white border-t border-gray-300 flex justify-around items-center pb-safe pt-2 px-2 shadow-[0_-4px_10px_rgba(0,0,0,0.05)] z-40">
        <button onClick={() => setActiveTab('home')} className={`flex flex-col items-center p-2 rounded-xl min-w-[64px] transition-colors ${activeTab === 'home' ? 'text-emerald-800 bg-emerald-100 font-bold' : 'text-stone-500 hover:text-emerald-700'}`}>
          <Home className={`w-6 h-6 mb-1 ${activeTab === 'home' ? 'stroke-2' : 'stroke-[1.5]'}`} />
          <span className="text-[10px]">Home</span>
        </button>
        <button onClick={() => setActiveTab('pferde')} className={`flex flex-col items-center p-2 rounded-xl min-w-[64px] transition-colors ${activeTab === 'pferde' ? 'text-emerald-800 bg-emerald-100 font-bold' : 'text-stone-500 hover:text-emerald-700'}`}>
          <ClipboardList className={`w-6 h-6 mb-1 ${activeTab === 'pferde' ? 'stroke-2' : 'stroke-[1.5]'}`} />
          <span className="text-[10px]">Pferde</span>
        </button>
        <button onClick={() => setActiveTab('pläne')} className={`flex flex-col items-center p-2 rounded-xl min-w-[64px] transition-colors ${activeTab === 'pläne' ? 'text-emerald-800 bg-emerald-100 font-bold' : 'text-stone-500 hover:text-emerald-700'}`}>
          <CalendarDays className={`w-6 h-6 mb-1 ${activeTab === 'pläne' ? 'stroke-2' : 'stroke-[1.5]'}`} />
          <span className="text-[10px]">Abäppelplan</span>
        </button>
        <button onClick={() => setActiveTab('mehr')} className={`flex flex-col items-center p-2 rounded-xl min-w-[64px] relative transition-colors ${activeTab === 'mehr' ? 'text-emerald-800 bg-emerald-100 font-bold' : 'text-stone-500 hover:text-emerald-700'}`}>
          <MoreHorizontal className={`w-6 h-6 mb-1 ${activeTab === 'mehr' ? 'stroke-2' : 'stroke-[1.5]'}`} />
          <span className="text-[10px]">Mehr</span>
        </button>
      </nav>
      <div className="h-20" />
    </div>
  );
}
