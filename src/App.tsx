/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, createContext, useContext, useRef, useCallback } from 'react';
import { Book, Mic, Music, User, Settings, Bell, Search, Play, Pause, SkipForward, SkipBack, LogOut, AlertCircle, Repeat, Shuffle, Repeat1, ArrowDown10, ArrowUp01, Sun, Moon, Edit2, Camera, Check, X, Download, Lock } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  auth, 
  db, 
  googleProvider, 
  signInWithPopup, 
  signOut, 
  onAuthStateChanged, 
  updateProfile,
  signInAnonymously,
  doc, 
  setDoc, 
  getDoc, 
  collection, 
  addDoc, 
  query, 
  where, 
  onSnapshot, 
  orderBy, 
  limit,
  handleFirestoreError,
  OperationType,
  User as FirebaseUser
} from './firebase';
import { serverTimestamp, Timestamp } from 'firebase/firestore';

// --- Main App ---
interface AuthContextType {
  user: FirebaseUser | null;
  loading: boolean;
  history: any[];
  favorites: any[];
  plan: 'free' | 'premium';
  role: 'user' | 'admin';
}

interface AudioContextType {
  selectedReciter: typeof RECITERS[0];
  setSelectedReciter: (reciter: typeof RECITERS[0]) => void;
  currentSurahIndex: number;
  setCurrentSurahIndex: (index: number) => void;
  isPlaying: boolean;
  setIsPlaying: (playing: boolean) => void;
  repeatMode: 'off' | 'one' | 'all';
  setRepeatMode: (mode: 'off' | 'one' | 'all') => void;
  playbackOrder: 'asc' | 'desc';
  setPlaybackOrder: (order: 'asc' | 'desc') => void;
  audioError: string | null;
  setAudioError: (error: string | null) => void;
  isBuffering: boolean;
  currentTime: number;
  duration: number;
  audioRef: React.RefObject<HTMLAudioElement | null>;
  handleNext: () => void;
  handlePrev: () => void;
  togglePlay: () => void;
  playSurah: (index: number) => void;
  getAudioUrl: (reciter: typeof RECITERS[0], index: number) => string;
}

const AuthContext = createContext<AuthContextType>({ 
  user: null, 
  loading: true, 
  history: [], 
  favorites: [],
  plan: 'free',
  role: 'user'
});
const AudioContext = createContext<AudioContextType | null>(null);

const useAudio = () => {
  const context = useContext(AudioContext);
  if (!context) throw new Error("useAudio must be used within an AudioProvider");
  return context;
};

// --- Neumorphic Utility Components ---
const NeumorphicContainer = ({ children, className = "" }: { children: React.ReactNode, className?: string }) => (
  <div className={`bg-bg min-h-screen text-ink font-sans transition-colors duration-300 ${className}`}>
    {children}
  </div>
);

const NeumorphicCard = ({ children, className = "", inset = false, onClick, ...props }: { children: React.ReactNode, className?: string, inset?: boolean, onClick?: () => void, [key: string]: any }) => (
  <div 
    onClick={onClick}
    {...props}
    className={`
      rounded-3xl p-6 transition-all duration-300
      ${inset 
        ? 'shadow-[var(--shadow-inset-light)]' 
        : 'shadow-[var(--shadow-flat)]'}
      ${className}
    `}
  >
    {children}
  </div>
);

const NeumorphicButton = ({ children, onClick, className = "", active = false, disabled = false, inset = false }: { children: React.ReactNode, onClick?: (e: any) => void, className?: string, active?: boolean, disabled?: boolean, inset?: boolean }) => (
  <button 
    onClick={onClick}
    disabled={disabled}
    className={`
      rounded-2xl transition-all duration-200 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed
      ${active || inset
        ? 'shadow-[var(--shadow-btn-inset)] text-blue-500' 
        : 'shadow-[var(--shadow-btn-flat)] hover:shadow-[var(--shadow-btn-hover)]'}
      ${className}
    `}
  >
    {children}
  </button>
);

const NeumorphicIconButton = ({ icon: Icon, onClick, active = false }: { icon: any, onClick: () => void, active?: boolean }) => (
  <div className="flex flex-col items-center">
    <button 
      onClick={onClick}
      className={`
        rounded-2xl p-4 transition-all duration-200 bg-bg
        ${active 
          ? 'shadow-[var(--shadow-btn-inset)] text-blue-600' 
          : 'shadow-[var(--shadow-flat)] text-gray-500'}
      `}
    >
      <Icon size={24} />
    </button>
  </div>
);

import QuranReader from './components/QuranReader';

// --- Tab Components ---
const QuranTab = () => {
  const { plan } = useContext(AuthContext);
  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="h-full"
    >
      <QuranReader plan={plan} />
    </motion.div>
  );
};

import { SURAHS, RECITERS } from './constants';

// --- Tab Components ---
const RecitationTab = () => {
  const { user, plan } = useContext(AuthContext);
  const { 
    selectedReciter, setSelectedReciter, 
    currentSurahIndex,
    isPlaying, setIsPlaying,
    repeatMode, setRepeatMode,
    playbackOrder, setPlaybackOrder,
    audioError,
    isBuffering, audioRef,
    handleNext, handlePrev,
    togglePlay, playSurah,
    getAudioUrl
  } = useAudio();

  const [searchQuery, setSearchQuery] = useState("");
  const [showReciterModal, setShowReciterModal] = useState(false);
  const [isPhotoExpanded, setIsPhotoExpanded] = useState(false);
  const [showPremiumModal, setShowPremiumModal] = useState(false);

  const filteredSurahs = SURAHS.map((surah, index) => ({ surah, index }))
    .filter(({ surah, index }) => 
      surah.includes(searchQuery)
    );

  const logReading = async (surahName: string, surahNumber: number) => {
    if (!user) return;
    const path = `users/${user.uid}/history`;
    try {
      await addDoc(collection(db, path), {
        userId: user.uid,
        surahName,
        surahNumber,
        timestamp: serverTimestamp()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  };

  const addToFavorites = async () => {
    if (!user) return;
    const path = `users/${user.uid}/favorites`;
    try {
      await addDoc(collection(db, path), {
        userId: user.uid,
        trackId: `${selectedReciter.id}-${currentSurahIndex}`,
        trackTitle: `${SURAHS[currentSurahIndex]} (${selectedReciter.name})`,
        addedAt: serverTimestamp()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="space-y-6"
    >
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-ink">Коран</h2>
        <NeumorphicButton className="p-1 rounded-full overflow-hidden w-12 h-12 flex items-center justify-center" onClick={() => setShowReciterModal(true)}>
          {selectedReciter.image ? (
            <img src={selectedReciter.image} alt={selectedReciter.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
          ) : (
            <User size={20} className="text-blue-600" />
          )}
        </NeumorphicButton>
      </div>

      {/* Player Card */}
      <NeumorphicCard className="space-y-6">
        {isBuffering && !audioError && (
          <div className="p-2 text-[10px] text-blue-500 font-bold uppercase tracking-widest text-center animate-pulse">
            Загрузка...
          </div>
        )}
        {audioError && (
          <div className="p-3 bg-red-50 text-red-500 text-xs rounded-xl flex flex-col items-center gap-2">
            <div className="flex items-center gap-2 font-medium">
              <AlertCircle size={14} />
              {audioError}
            </div>
            <div className="flex gap-2">
              <button 
                onClick={() => {
                  if (audioRef.current) {
                    audioRef.current.load();
                    setIsPlaying(true);
                  }
                }}
                className="text-[10px] uppercase tracking-wider font-bold bg-white/50 px-3 py-1 rounded-full shadow-sm hover:bg-white transition-colors"
              >
                Повторить
              </button>
            </div>
          </div>
        )}
        <div className={`flex ${isPhotoExpanded ? 'flex-col' : 'items-center'} gap-4`}>
          <div 
            onClick={() => setIsPhotoExpanded(!isPhotoExpanded)}
            className={`${isPhotoExpanded ? 'w-full aspect-square' : 'w-20 h-20'} rounded-2xl shadow-[var(--shadow-btn-inset)] overflow-hidden flex items-center justify-center cursor-pointer transition-all duration-300`}
          >
            {selectedReciter.image ? (
              <img src={selectedReciter.image} alt={selectedReciter.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
            ) : (
              <Music size={isPhotoExpanded ? 64 : 32} className="text-blue-500" />
            )}
          </div>
          <div className={`${isPhotoExpanded ? 'text-center' : 'flex-1'}`}>
            <h3 className={`${isPhotoExpanded ? 'text-xl' : 'text-lg'} font-bold text-ink`}>
              <span className="text-blue-500 mr-2">{currentSurahIndex + 1}.</span>
              {SURAHS[currentSurahIndex]}
            </h3>
            <p className={`text-sm text-gray-400 flex items-center gap-2 ${isPhotoExpanded ? 'justify-center' : ''}`}>
              {selectedReciter.name}
            </p>
          </div>
        </div>

        <div className="flex justify-center items-center gap-6">
          <div className="flex items-center gap-2">
            <NeumorphicButton 
              className={`p-1 rounded-md shadow-sm ${playbackOrder === 'desc' ? 'text-blue-600' : 'text-gray-400'}`}
              onClick={() => setPlaybackOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
            >
              {playbackOrder === 'asc' ? <ArrowUp01 size={10} /> : <ArrowDown10 size={10} />}
            </NeumorphicButton>
            
            <NeumorphicButton 
              className="p-4 rounded-full" 
              onClick={handlePrev}
              disabled={playbackOrder === 'asc' ? currentSurahIndex === 0 : currentSurahIndex === SURAHS.length - 1}
            >
              <SkipBack size={24} fill="currentColor" />
            </NeumorphicButton>
          </div>

          <NeumorphicButton 
            className="w-20 h-20 rounded-full flex items-center justify-center text-blue-500"
            inset={isPlaying}
            onClick={togglePlay}
          >
            {isPlaying ? <Pause size={32} fill="currentColor" /> : <Play size={32} fill="currentColor" className="ml-1" />}
          </NeumorphicButton>

          <div className="flex items-center gap-2">
            <NeumorphicButton 
              className="p-4 rounded-full" 
              onClick={handleNext}
              disabled={playbackOrder === 'asc' ? currentSurahIndex === SURAHS.length - 1 : currentSurahIndex === 0}
            >
              <SkipForward size={24} fill="currentColor" />
            </NeumorphicButton>
            <NeumorphicButton 
              className={`p-1 rounded-md shadow-sm ${repeatMode !== 'off' ? 'text-blue-600' : 'text-gray-400'}`}
              onClick={() => {
                if (repeatMode === 'off') setRepeatMode('all');
                else if (repeatMode === 'all') setRepeatMode('one');
                else setRepeatMode('off');
              }}
            >
              {repeatMode === 'one' ? <Repeat1 size={14} /> : <Repeat size={14} />}
            </NeumorphicButton>
          </div>
        </div>
      </NeumorphicCard>

      <div className="space-y-4">
        <NeumorphicCard className="p-4 flex items-center gap-3">
          <Search size={18} className="text-gray-400" />
          <input 
            type="text" 
            placeholder="Поиск суры..." 
            className="bg-transparent border-none outline-none text-ink w-full text-sm"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </NeumorphicCard>

        <div className="grid gap-3">
          {filteredSurahs.map(({ surah, index }) => {
            const isActive = index === currentSurahIndex;
            return (
              <NeumorphicCard 
                key={surah} 
                className={`p-4 flex items-center justify-between cursor-pointer transition-all ${isActive ? 'bg-blue-50/10' : ''}`}
                onClick={() => {
                  playSurah(index);
                  logReading(surah, index + 1);
                }}
              >
                <div className="flex items-center gap-4">
                  <span className={`text-xs font-bold w-6 ${isActive ? 'text-blue-500' : 'text-gray-300'}`}>{(index + 1).toString().padStart(2, '0')}</span>
                  <div>
                    <div className={`font-bold ${isActive ? 'text-blue-600' : 'text-ink'}`}>
                      {surah}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  {isActive && isPlaying ? (
                    <div className="flex gap-1 items-end h-4">
                      {[0, 1, 2].map(i => (
                        <motion.div 
                          key={i}
                          animate={{ height: [4, 16, 4] }}
                          transition={{ repeat: Infinity, duration: 0.6, delay: i * 0.2 }}
                          className="w-1 bg-blue-500 rounded-full"
                        />
                      ))}
                    </div>
                  ) : (
                    <Play size={14} className={isActive ? 'text-blue-500' : 'text-gray-300'} />
                  )}
                </div>
              </NeumorphicCard>
            );
          })}
        </div>
      </div>

      <AnimatePresence>
        {showReciterModal && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 backdrop-blur-sm p-4 sm:p-6"
            onClick={() => setShowReciterModal(false)}
          >
            <motion.div 
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              className="bg-bg w-full max-w-md rounded-3xl p-6 sm:p-8 space-y-6 shadow-2xl mb-safe"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex justify-between items-center">
                <h3 className="text-xl font-bold text-ink">Выберите чтеца</h3>
                <NeumorphicButton className="p-2 rounded-full" onClick={() => setShowReciterModal(false)}>
                  <X size={18} />
                </NeumorphicButton>
              </div>
              <div className="grid gap-3 max-h-[65vh] overflow-y-auto pr-2 custom-scrollbar pb-4">
                {RECITERS.map((reciter) => {
                  const isLocked = plan === 'free' && reciter.id !== 'yasser';
                  return (
                    <NeumorphicCard 
                      key={reciter.id} 
                      className={`p-4 flex items-center justify-between cursor-pointer ${selectedReciter.id === reciter.id ? 'bg-blue-50/10' : ''}`}
                      inset={selectedReciter.id === reciter.id}
                      onClick={() => {
                        if (isLocked) {
                          setShowPremiumModal(true);
                        } else {
                          setSelectedReciter(reciter);
                          setShowReciterModal(false);
                        }
                      }}
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-full bg-gray-200/20 overflow-hidden flex items-center justify-center shadow-sm shrink-0">
                          {reciter.image ? (
                            <img src={reciter.image} alt={reciter.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                          ) : (
                            <User size={24} className="text-gray-400" />
                          )}
                        </div>
                        <span className={`font-medium ${selectedReciter.id === reciter.id ? 'text-blue-600' : 'text-ink'}`}>{reciter.name}</span>
                      </div>
                      {isLocked && (
                        <div className="p-2 bg-gray-100 rounded-xl text-gray-400">
                          <Lock size={16} />
                        </div>
                      )}
                    </NeumorphicCard>
                  );
                })}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Premium Modal */}
      <AnimatePresence>
        {showPremiumModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowPremiumModal(false)}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative bg-bg w-full max-w-sm rounded-[2.5rem] p-8 shadow-2xl overflow-hidden"
            >
              <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-blue-500 to-indigo-600" />
              
              <div className="flex flex-col items-center text-center space-y-6">
                <div className="w-20 h-20 rounded-full bg-blue-50 shadow-[var(--shadow-btn-inset)] flex items-center justify-center text-blue-600">
                  <Music size={40} />
                </div>
                
                <div className="space-y-2">
                  <h3 className="text-2xl font-bold text-ink">Премиум функция</h3>
                  <p className="text-gray-500 leading-relaxed">
                    Выбор этого чтеца доступен только в <b>Premium</b> тарифе. 
                    Откройте доступ ко всем 20+ чтецам навсегда!
                  </p>
                </div>

                <div className="w-full space-y-3">
                  <button
                    onClick={() => {
                      window.open('https://t.me/muua3', '_blank');
                      setShowPremiumModal(false);
                    }}
                    className="w-full py-4 rounded-2xl bg-blue-600 text-white font-bold shadow-lg shadow-blue-200 active:scale-95 transition-transform"
                  >
                    Купить Premium за 10 000 ₽
                  </button>
                  <button
                    onClick={() => setShowPremiumModal(false)}
                    className="w-full py-4 rounded-2xl bg-bg text-gray-500 font-medium shadow-[var(--shadow-flat)] active:scale-95 transition-transform"
                  >
                    Позже
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

const ProfileTab = ({ theme, toggleTheme }: { theme: 'light' | 'dark', toggleTheme: () => void }) => {
  const { user, history, favorites, plan, role } = useContext(AuthContext);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  
  const [isEditing, setIsEditing] = useState(false);
  const [newName, setNewName] = useState(user?.displayName || "");
  const [newPhoto, setNewPhoto] = useState<string | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [showAdminLogin, setShowAdminLogin] = useState(false);
  const [adminUsername, setAdminUsername] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [isAdminLoggedIn, setIsAdminLoggedIn] = useState(false);
  const [allUsers, setAllUsers] = useState<any[]>([]);

  useEffect(() => {
    if (user) {
      setNewName(user.displayName || "");
      setNewPhoto(user.photoURL || null);
    }
  }, [user]);

  useEffect(() => {
    if (isAdminLoggedIn && role === 'admin') {
      const unsub = onSnapshot(collection(db, 'users'), (snapshot) => {
        setAllUsers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      });
      return () => unsub();
    }
  }, [isAdminLoggedIn, role]);

  const handleAdminLogin = () => {
    if (adminUsername === "Manu" && adminPassword === "Hgkhmzs2005") {
      setIsAdminLoggedIn(true);
      setShowAdminLogin(false);
      setAdminPassword("");
    } else {
      setLoginError("Неверный логин или пароль администратора");
    }
  };

  const updateUserPlan = async (userId: string, newPlan: 'free' | 'premium') => {
    try {
      await setDoc(doc(db, 'users', userId), { plan: newPlan }, { merge: true });
    } catch (error) {
      console.error("Failed to update user plan", error);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 1024 * 1024) { // 1MB limit for base64 storage
        setLoginError("Изображение слишком большое. Пожалуйста, выберите изображение меньше 1 МБ.");
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setNewPhoto(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleUpdateProfile = async () => {
    if (!user) return;
    setIsUpdating(true);
    try {
      await updateProfile(user, {
        displayName: newName,
        photoURL: newPhoto
      });

      const userRef = doc(db, 'users', user.uid);
      await setDoc(userRef, {
        displayName: newName,
        photoURL: newPhoto
      }, { merge: true });

      setIsEditing(false);
    } catch (error) {
      console.error("Update profile failed", error);
      setLoginError("Не удалось обновить профиль.");
    } finally {
      setIsUpdating(false);
    }
  };

  const handleLogin = async () => {
    if (isLoggingIn) return;
    setIsLoggingIn(true);
    setLoginError(null);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const user = result.user;
      
      const userRef = doc(db, 'users', user.uid);
      await setDoc(userRef, {
        uid: user.uid,
        displayName: user.displayName,
        email: user.email,
        photoURL: user.photoURL,
        createdAt: serverTimestamp(),
        role: 'user'
      }, { merge: true });
    } catch (error: any) {
      console.error("Login failed", error);
      if (error.code === 'auth/popup-closed-by-user') {
        setLoginError("Окно входа было закрыто. Пожалуйста, попробуйте еще раз.");
      } else if (error.code === 'auth/unauthorized-domain') {
        setLoginError("Этот домен не разрешен для входа. Пожалуйста, обратитесь к администратору.");
      } else if (error.code === 'auth/popup-blocked') {
        setLoginError("Всплывающее окно заблокировано браузером. Пожалуйста, разрешите всплывающие окна.");
      } else {
        setLoginError(`Ошибка входа: ${error.message || "Неизвестная ошибка"}`);
      }
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleGuestLogin = async () => {
    if (isLoggingIn) return;
    setIsLoggingIn(true);
    setLoginError(null);
    try {
      await signInAnonymously(auth);
    } catch (error: any) {
      console.error("Guest login failed", error);
      setLoginError(`Ошибка входа как гость: ${error.message || "Неизвестная ошибка"}`);
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Logout failed", error);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="space-y-8 pb-20"
    >
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-ink">Мой профиль</h2>
        <div className="flex gap-3">
          <NeumorphicButton className="p-3 rounded-full" onClick={toggleTheme}>
            {theme === 'light' ? <Moon size={20} className="text-blue-600" /> : <Sun size={20} className="text-yellow-500" />}
          </NeumorphicButton>
          {user && (
            <div className="flex gap-3">
              <NeumorphicButton 
                className={`p-3 rounded-full ${isEditing ? 'text-green-500' : 'text-blue-500'}`} 
                onClick={() => isEditing ? handleUpdateProfile() : setIsEditing(true)}
                disabled={isUpdating}
              >
                {isUpdating ? (
                  <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin"></div>
                ) : isEditing ? (
                  <Check size={20} />
                ) : (
                  <Edit2 size={20} />
                )}
              </NeumorphicButton>
              {isEditing && (
                <NeumorphicButton className="p-3 rounded-full text-red-500" onClick={() => { setIsEditing(false); setNewName(user.displayName || ""); setNewPhoto(user.photoURL || null); }}>
                  <X size={20} />
                </NeumorphicButton>
              )}
              {!isEditing && (
                <NeumorphicButton className="p-3 rounded-full text-red-500" onClick={handleLogout}>
                  <LogOut size={20} />
                </NeumorphicButton>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-col items-center gap-4">
        <div className="relative group">
          <div className="w-32 h-32 rounded-full p-2 shadow-[var(--shadow-flat)]">
            <div className="w-full h-full rounded-full bg-gray-200 flex items-center justify-center overflow-hidden">
              {newPhoto ? (
                <img src={newPhoto} alt="Profile" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
              ) : user?.photoURL ? (
                <img src={user.photoURL} alt="Profile" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
              ) : (
                <User size={64} className="text-gray-400" />
              )}
            </div>
          </div>
          {isEditing && (
            <button 
              onClick={() => fileInputRef.current?.click()}
              className="absolute bottom-0 right-0 p-3 bg-blue-500 text-white rounded-full shadow-lg hover:bg-blue-600 transition-colors"
            >
              <Camera size={20} />
            </button>
          )}
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleFileChange} 
            accept="image/*" 
            className="hidden" 
          />
        </div>
        
        {user && (
          <div className="text-center w-full max-w-xs">
            {isEditing ? (
              <div className="space-y-2">
                <input 
                  type="text" 
                  value={newName} 
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full bg-bg shadow-[var(--shadow-btn-inset)] rounded-xl px-4 py-2 text-center text-ink focus:outline-none"
                  placeholder="Введите ваше имя"
                />
                <p className="text-gray-400 text-sm">{user.email}</p>
              </div>
            ) : (
              <>
                <h3 className="text-xl font-bold text-ink">{user.isAnonymous ? "Гость" : user.displayName}</h3>
                <p className="text-gray-400 text-sm mb-1">{user.isAnonymous ? "Анонимный доступ" : user.email}</p>
                <div className={`inline-block px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest ${plan === 'premium' ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-500'}`}>
                  {plan === 'premium' ? 'Premium' : 'Free Plan'}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {user && !isAdminLoggedIn && (
        <div className="space-y-6">
          <h3 className="text-lg font-bold text-ink px-2">Тарифы</h3>
          <div className="grid gap-4">
            <NeumorphicCard className={`p-6 border-2 transition-all ${plan === 'free' ? 'border-blue-500/30' : 'border-transparent'}`}>
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h4 className="text-lg font-bold text-ink">Бесплатно</h4>
                  <p className="text-xs text-gray-500">Базовый доступ</p>
                </div>
                <div className="text-xl font-black text-ink">0 ₽</div>
              </div>
              <ul className="space-y-2 mb-6">
                <li className="text-xs text-gray-600 flex items-center gap-2">
                  <Check size={14} className="text-green-500" /> Один чтец (Ясир аль-Досари)
                </li>
                <li className="text-xs text-gray-600 flex items-center gap-2">
                  <Check size={14} className="text-green-500" /> Ручное открытие аятов
                </li>
                <li className="text-xs text-gray-400 flex items-center gap-2">
                  <X size={14} className="text-red-400" /> Работа с микрофоном
                </li>
              </ul>
              <NeumorphicButton 
                className="w-full py-3 text-sm font-bold" 
                inset={plan === 'free'}
                disabled={plan === 'free'}
              >
                {plan === 'free' ? 'Активно' : 'Выбрать'}
              </NeumorphicButton>
            </NeumorphicCard>

            <NeumorphicCard className={`p-6 border-2 transition-all ${plan === 'premium' ? 'border-blue-500/30' : 'border-transparent'}`}>
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h4 className="text-lg font-bold text-blue-600">Premium</h4>
                  <p className="text-xs text-gray-500">Пожизненный доступ</p>
                </div>
                <div className="text-xl font-black text-blue-600">10 000 ₽</div>
              </div>
              <ul className="space-y-2 mb-6">
                <li className="text-xs text-gray-600 flex items-center gap-2">
                  <Check size={14} className="text-green-500" /> Все чтецы (20+)
                </li>
                <li className="text-xs text-gray-600 flex items-center gap-2">
                  <Check size={14} className="text-green-500" /> Работа с микрофоном
                </li>
                <li className="text-xs text-gray-600 flex items-center gap-2">
                  <Check size={14} className="text-green-500" /> Приоритетная поддержка
                </li>
              </ul>
              <a 
                href="https://t.me/muua3" 
                target="_blank" 
                rel="noopener noreferrer"
                className="block"
              >
                <NeumorphicButton 
                  className="w-full py-3 text-sm font-bold text-blue-600"
                  inset={plan === 'premium'}
                >
                  {plan === 'premium' ? 'Активно' : 'Активировать'}
                </NeumorphicButton>
              </a>
            </NeumorphicCard>
          </div>
        </div>
      )}

      {isAdminLoggedIn && role === 'admin' && (
        <div className="space-y-6">
          <div className="flex justify-between items-center px-2">
            <h3 className="text-lg font-bold text-ink">Управление пользователями</h3>
            <NeumorphicButton className="p-2 text-red-500" onClick={() => setIsAdminLoggedIn(false)}>
              Выйти
            </NeumorphicButton>
          </div>
          <div className="grid gap-3">
            {allUsers.map(u => (
              <NeumorphicCard key={u.id} className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full overflow-hidden bg-gray-200">
                    {u.photoURL && <img src={u.photoURL} alt="" className="w-full h-full object-cover" />}
                  </div>
                  <div>
                    <div className="text-sm font-bold text-ink">{u.displayName || 'Без имени'}</div>
                    <div className="text-[10px] text-gray-400">{u.email}</div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <NeumorphicButton 
                    className={`px-3 py-1 text-[10px] font-bold ${u.plan === 'free' ? 'bg-blue-500 text-white' : 'text-gray-400'}`}
                    onClick={() => updateUserPlan(u.id, 'free')}
                  >
                    Free
                  </NeumorphicButton>
                  <NeumorphicButton 
                    className={`px-3 py-1 text-[10px] font-bold ${u.plan === 'premium' ? 'bg-blue-500 text-white' : 'text-gray-400'}`}
                    onClick={() => updateUserPlan(u.id, 'premium')}
                  >
                    Premium
                  </NeumorphicButton>
                </div>
              </NeumorphicCard>
            ))}
          </div>
        </div>
      )}

      {!isAdminLoggedIn && role === 'admin' && (
        <div className="flex justify-center pt-8">
          <button 
            onClick={() => setShowAdminLogin(true)}
            className="text-[10px] text-gray-300 hover:text-gray-500 transition-colors"
          >
            Админ-панель
          </button>
        </div>
      )}

      <AnimatePresence>
        {showAdminLogin && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 backdrop-blur-sm p-6"
            onClick={() => setShowAdminLogin(false)}
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-bg w-full max-w-xs rounded-3xl p-8 space-y-6 shadow-2xl"
              onClick={e => e.stopPropagation()}
            >
              <h3 className="text-xl font-bold text-center text-ink">Вход для админа</h3>
              <div className="space-y-4">
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-gray-400 ml-2">Логин</label>
                  <input 
                    type="text" 
                    value={adminUsername}
                    onChange={e => setAdminUsername(e.target.value)}
                    className="w-full bg-bg shadow-[var(--shadow-btn-inset)] rounded-xl px-4 py-3 text-ink focus:outline-none"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-gray-400 ml-2">Пароль</label>
                  <input 
                    type="password" 
                    value={adminPassword}
                    onChange={e => setAdminPassword(e.target.value)}
                    className="w-full bg-bg shadow-[var(--shadow-btn-inset)] rounded-xl px-4 py-3 text-ink focus:outline-none"
                  />
                </div>
                <NeumorphicButton className="w-full py-4 text-blue-600 font-bold" onClick={handleAdminLogin}>
                  Войти
                </NeumorphicButton>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="space-y-4">
        {!user && (
          <div className="space-y-3">
            {loginError && (
              <div className="p-3 bg-red-50 text-red-500 text-xs rounded-xl text-center font-medium animate-pulse">
                {loginError}
              </div>
            )}
            <NeumorphicButton 
              className="w-full py-4 px-4 text-blue-600 font-bold mt-4 flex items-center justify-center gap-2" 
              onClick={handleLogin}
              disabled={isLoggingIn}
            >
              {isLoggingIn ? (
                <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
              ) : (
                "Войти через Google"
              )}
            </NeumorphicButton>
            <NeumorphicButton 
              className="w-full py-4 px-4 text-gray-500 font-bold flex items-center justify-center gap-2" 
              onClick={handleGuestLogin}
              disabled={isLoggingIn}
            >
              {isLoggingIn ? (
                <div className="w-5 h-5 border-2 border-gray-400 border-t-transparent rounded-full animate-spin"></div>
              ) : (
                "Войти как гость"
              )}
            </NeumorphicButton>
          </div>
        )}
      </div>
    </motion.div>
  );
};

// --- Main App ---
function AppContent() {
  const [activeTab, setActiveTab] = useState<'quran' | 'music' | 'profile'>('quran');
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [plan, setPlan] = useState<'free' | 'premium'>('free');
  const [role, setRole] = useState<'user' | 'admin'>('user');
  const [loading, setLoading] = useState(true);
  const [history, setHistory] = useState<any[]>([]);
  const [favorites, setFavorites] = useState<any[]>([]);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  // Audio State moved to AppContent for persistence
  const [selectedReciter, setSelectedReciter] = useState(RECITERS[0]);
  const [currentSurahIndex, setCurrentSurahIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [repeatMode, setRepeatMode] = useState<'off' | 'one' | 'all'>('off');
  const [playbackOrder, setPlaybackOrder] = useState<'asc' | 'desc'>('asc');
  const [audioError, setAudioError] = useState<string | null>(null);
  const [isBuffering, setIsBuffering] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const getAudioUrl = (reciter: typeof RECITERS[0], index: number) => {
    const surahNumber = (index + 1).toString().padStart(3, '0');
    return `${reciter.server}${surahNumber}.mp3`;
  };

  const handleNext = useCallback(() => {
    let nextIndex;
    if (playbackOrder === 'asc') {
      nextIndex = currentSurahIndex + 1;
      if (nextIndex >= SURAHS.length) {
        if (repeatMode === 'all') nextIndex = 0;
        else { setIsPlaying(false); return; }
      }
    } else {
      nextIndex = currentSurahIndex - 1;
      if (nextIndex < 0) {
        if (repeatMode === 'all') nextIndex = SURAHS.length - 1;
        else { setIsPlaying(false); return; }
      }
    }
    setCurrentSurahIndex(nextIndex);
    setIsPlaying(true);
  }, [currentSurahIndex, playbackOrder, repeatMode]);

  const handlePrev = useCallback(() => {
    const nextIndex = playbackOrder === 'asc' ? Math.max(0, currentSurahIndex - 1) : Math.min(SURAHS.length - 1, currentSurahIndex + 1);
    setCurrentSurahIndex(nextIndex);
    setIsPlaying(true);
  }, [currentSurahIndex, playbackOrder]);

  const togglePlay = () => setIsPlaying(!isPlaying);

  const playSurah = (index: number) => {
    if (index === currentSurahIndex && isPlaying) return;
    setCurrentSurahIndex(index);
    setIsPlaying(true);
  };

  // Audio Management Effect
  const previousSrcRef = useRef<string | null>(null);
  
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const currentSrc = getAudioUrl(selectedReciter, currentSurahIndex);
    
    // Force load the new source if it changed
    if (previousSrcRef.current !== currentSrc) {
      previousSrcRef.current = currentSrc;
      setCurrentTime(0);
      audio.load();
    }

    if (isPlaying) {
      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise.catch(error => {
          if (error.name !== 'AbortError' && error.name !== 'NotAllowedError') {
            console.error("Playback error:", error);
            setAudioError("Ошибка воспроизведения. Возможно, сервер перегружен.");
            setIsPlaying(false);
          }
        });
      }
      
      // MediaSession API for lock screen controls
      if ('mediaSession' in navigator) {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: SURAHS[currentSurahIndex],
          artist: selectedReciter.name,
          album: 'Чтение Корана',
          artwork: [
            { src: selectedReciter.image || '', sizes: '512x512', type: 'image/jpeg' }
          ]
        });

        navigator.mediaSession.setActionHandler('play', () => setIsPlaying(true));
        navigator.mediaSession.setActionHandler('pause', () => setIsPlaying(false));
        navigator.mediaSession.setActionHandler('previoustrack', handlePrev);
        navigator.mediaSession.setActionHandler('nexttrack', handleNext);
      }
    } else {
      audio.pause();
    }
  }, [isPlaying, selectedReciter, currentSurahIndex, handleNext, handlePrev]);

  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    if (newTheme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        // Fetch user plan and role from Firestore
        const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
        if (userDoc.exists()) {
          const data = userDoc.data();
          setPlan(data.plan || 'free');
          setRole(data.role || 'user');
        } else {
          setPlan('free');
          setRole('user');
        }
      } else {
        setPlan('free');
        setRole('user');
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) {
      setHistory([]);
      setFavorites([]);
      return;
    }

    // History Listener
    const historyPath = `users/${user.uid}/history`;
    const historyQuery = query(collection(db, historyPath), orderBy('timestamp', 'desc'), limit(10));
    const unsubHistory = onSnapshot(historyQuery, (snapshot) => {
      setHistory(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => handleFirestoreError(error, OperationType.LIST, historyPath));

    // Favorites Listener
    const favPath = `users/${user.uid}/favorites`;
    const unsubFav = onSnapshot(collection(db, favPath), (snapshot) => {
      setFavorites(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => handleFirestoreError(error, OperationType.LIST, favPath));

    return () => {
      unsubHistory();
      unsubFav();
    };
  }, [user]);

  if (loading) {
    return (
      <NeumorphicContainer className="flex items-center justify-center">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1.5, repeat: Infinity, repeatType: "reverse", ease: "easeInOut" }}
          className="text-5xl md:text-6xl font-arabic text-ink text-center px-4 leading-relaxed"
          dir="rtl"
        >
          بِسْمِ ٱللَّٰهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ
        </motion.div>
      </NeumorphicContainer>
    );
  }

  return (
    <AuthContext.Provider value={{ user, loading, history, favorites, plan, role }}>
      <AudioContext.Provider value={{ 
        selectedReciter, setSelectedReciter,
        currentSurahIndex, setCurrentSurahIndex,
        isPlaying, setIsPlaying,
        repeatMode, setRepeatMode,
        playbackOrder, setPlaybackOrder,
        audioError, setAudioError,
        isBuffering, currentTime, duration, audioRef,
        handleNext, handlePrev,
        togglePlay, playSurah,
        getAudioUrl
      }}>
        <NeumorphicContainer className="flex flex-col">
          {/* Persistent Audio Element */}
          <audio 
            ref={audioRef} 
            src={getAudioUrl(selectedReciter, currentSurahIndex)}
            onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
            onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
            onEnded={() => {
              if (repeatMode === 'one') {
                if (audioRef.current) {
                  audioRef.current.currentTime = 0;
                  audioRef.current.play().catch(e => console.error("Repeat One error:", e));
                }
              } else {
                handleNext();
              }
            }}
            onWaiting={() => setIsBuffering(true)}
            onPlaying={() => {
              setIsBuffering(false);
              setAudioError(null);
            }}
            onCanPlay={() => {
              if (isPlaying) audioRef.current?.play().catch(() => {});
            }}
            onError={(e) => {
              const audio = e.target as HTMLAudioElement;
              const error = audio.error;
              const currentSrc = audio.currentSrc || audio.src;
              console.error("Audio element error:", error, "URL:", currentSrc);
              
              let message = `Ошибка загрузки. Попробуйте нажать "Повторить" или сменить чтеца.`;
              if (error?.code === 1) message = "Воспроизведение прервано.";
              if (error?.code === 2) message = "Ошибка сети. Проверьте интернет.";
              if (error?.code === 3) message = "Ошибка декодирования аудио.";
              if (error?.code === 4) message = "Файл не найден на сервере. Попробуйте другого чтеца.";
              
              setAudioError(message);
              setIsPlaying(false);
              setIsBuffering(false);
            }}
            preload="auto"
          />

          {/* Main Content */}
          <main className="flex-1 p-6 pb-48 max-w-md mx-auto w-full">
            <AnimatePresence mode="wait">
              {activeTab === 'quran' && <QuranTab key="quran" />}
              {activeTab === 'music' && <RecitationTab key="recitation" />}
              {activeTab === 'profile' && <ProfileTab theme={theme} toggleTheme={toggleTheme} />}
            </AnimatePresence>
          </main>

          {/* Mini Player for other tabs */}
          {activeTab === 'profile' && (isPlaying || (currentTime > 0 && currentTime < duration)) && (
            <motion.div 
              initial={{ y: 100, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              className="fixed bottom-28 left-4 right-4 z-40"
            >
              <NeumorphicCard 
                className="p-4 flex flex-col gap-2 cursor-pointer bg-bg/95 backdrop-blur-md border border-white/10 shadow-2xl"
                onClick={() => setActiveTab('music')}
              >
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-2xl overflow-hidden shadow-lg border-2 border-white/20">
                    {selectedReciter.image ? (
                      <img src={selectedReciter.image} alt={selectedReciter.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    ) : (
                      <div className="w-full h-full bg-blue-500 flex items-center justify-center text-white"><Music size={24} /></div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <div className="text-[10px] font-bold text-blue-500 uppercase tracking-widest">Сейчас играет</div>
                      {isPlaying && (
                        <div className="flex gap-0.5 items-end h-2">
                          <motion.div animate={{ height: [4, 8, 4] }} transition={{ repeat: Infinity, duration: 0.6 }} className="w-0.5 bg-blue-500 rounded-full" />
                          <motion.div animate={{ height: [8, 4, 8] }} transition={{ repeat: Infinity, duration: 0.6, delay: 0.2 }} className="w-0.5 bg-blue-500 rounded-full" />
                          <motion.div animate={{ height: [6, 10, 6] }} transition={{ repeat: Infinity, duration: 0.6, delay: 0.4 }} className="w-0.5 bg-blue-500 rounded-full" />
                        </div>
                      )}
                    </div>
                    <div className="text-sm font-black text-ink truncate tracking-tight">
                      {SURAHS[currentSurahIndex]}
                    </div>
                    <div className="text-xs font-medium text-gray-500 truncate">{selectedReciter.name}</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <NeumorphicButton 
                      className="p-3 rounded-full" 
                      onClick={(e) => { e.stopPropagation(); togglePlay(); }}
                    >
                      {isPlaying ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />}
                    </NeumorphicButton>
                    <NeumorphicButton 
                      className="p-3 rounded-full" 
                      onClick={(e) => { e.stopPropagation(); handleNext(); }}
                    >
                      <SkipForward size={20} fill="currentColor" />
                    </NeumorphicButton>
                  </div>
                </div>
                
                {/* Progress Bar */}
                <div className="w-full h-1.5 bg-gray-200 dark:bg-gray-800 rounded-full overflow-hidden mt-1">
                  <motion.div 
                    className="h-full bg-blue-500"
                    initial={{ width: 0 }}
                    animate={{ width: `${(currentTime / (duration || 1)) * 100}%` }}
                    transition={{ type: 'spring', bounce: 0, duration: 0.5 }}
                  />
                </div>
              </NeumorphicCard>
            </motion.div>
          )}

          {/* Bottom Navigation */}
          <nav className="fixed bottom-2 left-0 right-0 z-50 pointer-events-none px-6">
            <div className="max-w-md mx-auto relative bg-bg rounded-[2rem] shadow-[var(--shadow-flat)] h-16 flex items-center justify-between px-2 pointer-events-auto">
              {[
                { id: 'quran', icon: Book },
                { id: 'music', icon: Music },
                { id: 'profile', icon: User }
              ].map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <div key={tab.id} className="relative flex-1 flex justify-center h-full items-center">
                    <button
                      onClick={() => setActiveTab(tab.id as 'quran' | 'music' | 'profile')}
                      className={`
                        transition-all duration-300 flex items-center justify-center rounded-full
                        ${isActive 
                          ? 'absolute -top-5 w-14 h-14 bg-bg shadow-[var(--shadow-flat)] text-blue-500' 
                          : 'w-12 h-12 text-gray-400 hover:text-gray-600'}
                      `}
                    >
                      <Icon size={isActive ? 24 : 24} />
                    </button>
                  </div>
                );
              })}
            </div>
          </nav>
        </NeumorphicContainer>
      </AudioContext.Provider>
    </AuthContext.Provider>
  );
}

export default function App() {
  return (
    <AppContent />
  );
}
