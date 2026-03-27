/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, createContext, useContext, useRef, useCallback } from 'react';
import { Book, Mic, Music, User, Settings, Bell, Search, Play, Pause, SkipForward, SkipBack, LogOut, AlertCircle, Repeat, Shuffle, Repeat1, ArrowDown10, ArrowUp01, Sun, Moon, Edit2, Camera, Check, X, Download } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  auth, 
  db, 
  googleProvider, 
  signInWithPopup, 
  signOut, 
  onAuthStateChanged, 
  updateProfile,
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

const AuthContext = createContext<AuthContextType>({ user: null, loading: true, history: [], favorites: [] });
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

const NeumorphicIconButton = ({ icon: Icon, onClick, active = false, label }: { icon: any, onClick: () => void, active?: boolean, label?: string }) => (
  <div className="flex flex-col items-center gap-1">
    <button 
      onClick={onClick}
      className={`
        rounded-2xl p-4 transition-all duration-200
        ${active 
          ? 'shadow-[var(--shadow-btn-inset)] text-blue-600' 
          : 'shadow-[var(--shadow-flat)] text-gray-500'}
      `}
    >
      <Icon size={24} />
    </button>
    {label && <span className={`text-[10px] font-medium uppercase tracking-wider ${active ? 'text-blue-600' : 'text-gray-400'}`}>{label}</span>}
  </div>
);

// --- Tab Components ---
const QuranTab = () => {
  const { user } = useContext(AuthContext);

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

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="flex flex-col items-center justify-center min-h-[60vh] text-gray-400"
    >
      <p className="text-sm italic">Menu is currently empty</p>
    </motion.div>
  );
};

import { SURAHS, SURAHS_ARABIC, RECITERS } from './constants';

// --- Tab Components ---
const RecitationTab = () => {
  const { user } = useContext(AuthContext);
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

  const filteredSurahs = SURAHS.map((surah, index) => ({ surah, index }))
    .filter(({ surah, index }) => 
      surah.toLowerCase().includes(searchQuery.toLowerCase()) || 
      SURAHS_ARABIC[index].includes(searchQuery)
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
        <h2 className="text-2xl font-bold text-ink">Recitations</h2>
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
            Buffering...
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
                Retry
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
              {SURAHS[currentSurahIndex]} <span className="font-normal text-gray-500 ml-1" dir="rtl">({SURAHS_ARABIC[currentSurahIndex]})</span>
            </h3>
            <p className="text-sm text-gray-400">{selectedReciter.name}</p>
          </div>
          {!isPhotoExpanded && (
            <NeumorphicButton className="p-3 rounded-full" onClick={addToFavorites}>
              <Bell size={18} className="text-gray-400" />
            </NeumorphicButton>
          )}
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
            placeholder="Search Surah..." 
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
                      {surah} <span className="font-normal text-gray-500 ml-1" dir="rtl">({SURAHS_ARABIC[index]})</span>
                    </div>
                    <div className="text-[10px] text-gray-400 uppercase tracking-widest">Meccan • 7 Verses</div>
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
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm p-4"
            onClick={() => setShowReciterModal(false)}
          >
            <motion.div 
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              className="bg-bg w-full max-w-md rounded-t-[3rem] p-8 space-y-6 shadow-2xl"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex justify-between items-center">
                <h3 className="text-xl font-bold text-ink">Select Reciter</h3>
                <NeumorphicButton className="p-2 rounded-full" onClick={() => setShowReciterModal(false)}>
                  <Settings size={18} />
                </NeumorphicButton>
              </div>
              <div className="grid gap-3 max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
                {RECITERS.map((reciter) => (
                  <NeumorphicCard 
                    key={reciter.id} 
                    className={`p-4 flex items-center gap-4 cursor-pointer ${selectedReciter.id === reciter.id ? 'bg-blue-50/10' : ''}`}
                    inset={selectedReciter.id === reciter.id}
                    onClick={() => {
                      setSelectedReciter(reciter);
                      setShowReciterModal(false);
                    }}
                  >
                    <div className="w-12 h-12 rounded-full bg-gray-200/20 overflow-hidden flex items-center justify-center shadow-sm">
                      {reciter.image ? (
                        <img src={reciter.image} alt={reciter.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                      ) : (
                        <User size={24} className="text-gray-400" />
                      )}
                    </div>
                    <span className={`font-medium ${selectedReciter.id === reciter.id ? 'text-blue-600' : 'text-ink'}`}>{reciter.name}</span>
                  </NeumorphicCard>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

const ProfileTab = ({ theme, toggleTheme }: { theme: 'light' | 'dark', toggleTheme: () => void }) => {
  const { user, history, favorites } = useContext(AuthContext);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  
  const [isEditing, setIsEditing] = useState(false);
  const [newName, setNewName] = useState(user?.displayName || "");
  const [newPhoto, setNewPhoto] = useState<string | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (user) {
      setNewName(user.displayName || "");
      setNewPhoto(user.photoURL || null);
    }
  }, [user]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 1024 * 1024) { // 1MB limit for base64 storage
        setLoginError("Image too large. Please select a smaller image (< 1MB).");
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
      setLoginError("Failed to update profile.");
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
      if (error.code === 'auth/popup-closed-by-user') {
        setLoginError("Popup closed. Please try again.");
      } else {
        setLoginError("Login failed. Please check your connection.");
      }
      console.error("Login failed", error);
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
        <h2 className="text-2xl font-bold text-ink">My Profile</h2>
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
                  placeholder="Enter your name"
                />
                <p className="text-gray-400 text-sm">{user.email}</p>
              </div>
            ) : (
              <>
                <h3 className="text-xl font-bold text-ink">{user.displayName}</h3>
                <p className="text-gray-400 text-sm">{user.email}</p>
              </>
            )}
          </div>
        )}
      </div>

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
                "Sign In with Google"
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
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise.catch(error => {
          if (error.name !== 'AbortError' && error.name !== 'NotAllowedError') {
            console.error("Playback error:", error);
            setAudioError("Playback failed. The server might be busy.");
            setIsPlaying(false);
          }
        });
      }
      
      // MediaSession API for lock screen controls
      if ('mediaSession' in navigator) {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: SURAHS[currentSurahIndex],
          artist: selectedReciter.name,
          album: 'Quran Recitation',
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
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
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
        <div className="w-16 h-16 rounded-full shadow-[var(--shadow-flat)] flex items-center justify-center animate-pulse">
          <div className="w-8 h-8 rounded-full bg-blue-500 opacity-50"></div>
        </div>
      </NeumorphicContainer>
    );
  }

  return (
    <AuthContext.Provider value={{ user, loading, history, favorites }}>
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
            key={`${selectedReciter.id}-${currentSurahIndex}`}
            ref={audioRef} 
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
              
              let message = `Ошибка загрузки. Попробуйте нажать "Retry" или сменить чтеца.`;
              if (error?.code === 1) message = "Воспроизведение прервано.";
              if (error?.code === 2) message = "Ошибка сети. Проверьте интернет.";
              if (error?.code === 3) message = "Ошибка декодирования аудио.";
              if (error?.code === 4) message = "Файл не найден на сервере. Попробуйте другого чтеца.";
              
              setAudioError(message);
              setIsPlaying(false);
              setIsBuffering(false);
            }}
            preload="auto"
          >
            <source src={getAudioUrl(selectedReciter, currentSurahIndex)} />
          </audio>

          {/* Main Content */}
          <main className="flex-1 p-6 pb-32 max-w-md mx-auto w-full">
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
                      <div className="text-[10px] font-bold text-blue-500 uppercase tracking-widest">Now Playing</div>
                      {isPlaying && (
                        <div className="flex gap-0.5 items-end h-2">
                          <motion.div animate={{ height: [4, 8, 4] }} transition={{ repeat: Infinity, duration: 0.6 }} className="w-0.5 bg-blue-500 rounded-full" />
                          <motion.div animate={{ height: [8, 4, 8] }} transition={{ repeat: Infinity, duration: 0.6, delay: 0.2 }} className="w-0.5 bg-blue-500 rounded-full" />
                          <motion.div animate={{ height: [6, 10, 6] }} transition={{ repeat: Infinity, duration: 0.6, delay: 0.4 }} className="w-0.5 bg-blue-500 rounded-full" />
                        </div>
                      )}
                    </div>
                    <div className="text-sm font-black text-ink truncate tracking-tight">
                      {SURAHS[currentSurahIndex]} <span className="font-normal text-gray-500 ml-1" dir="rtl">({SURAHS_ARABIC[currentSurahIndex]})</span>
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
          <nav className="fixed bottom-0 left-0 right-0 p-6 bg-bg/80 backdrop-blur-lg z-50">
            <div className="max-w-md mx-auto">
              <NeumorphicCard className="flex justify-around items-center py-4 px-2 rounded-[2rem]">
                <NeumorphicIconButton 
                  icon={Book} 
                  label="Home" 
                  onClick={() => setActiveTab('quran')} 
                  active={activeTab === 'quran'} 
                />
                <NeumorphicIconButton 
                  icon={Music} 
                  label="Quran" 
                  onClick={() => setActiveTab('music')} 
                  active={activeTab === 'music'} 
                />
                <NeumorphicIconButton 
                  icon={User} 
                  label="Profile" 
                  onClick={() => setActiveTab('profile')} 
                  active={activeTab === 'profile'} 
                />
              </NeumorphicCard>
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
