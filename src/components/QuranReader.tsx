import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mic, Square, Eye, EyeOff, List, ChevronLeft, ChevronRight, ArrowLeft, Search, X } from 'lucide-react';

interface Surah {
  number: number;
  name: string;
  englishName: string;
  englishNameTranslation: string;
  numberOfAyahs: number;
  revelationType: string;
}

interface Ayah {
  number: number;
  text: string;
  numberInSurah: number;
  juz: number;
  manzil: number;
  page: number;
  ruku: number;
  hizbQuarter: number;
  sajda: boolean | object;
}

interface SurahDetail extends Surah {
  ayahs: Ayah[];
}

const normalizeArabic = (text: string) => {
  return text
    .replace(/[\u0617-\u061A\u064B-\u0652]/g, "") // Remove diacritics
    .replace(/[إأآا]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .trim();
};

export default function QuranReader() {
  const [surahs, setSurahs] = useState<Surah[]>([]);
  const [activeSurah, setActiveSurah] = useState<SurahDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [isMemorization, setIsMemorization] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [revealedIndex, setRevealedIndex] = useState(0);
  const [timer, setTimer] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [speechError, setSpeechError] = useState<string | null>(null);
  const [showSurahList, setShowSurahList] = useState(false);
  const [showToast, setShowToast] = useState(false);

  const recognitionRef = useRef<any>(null);
  const timerRef = useRef<any>(null);
  const confirmedIndexRef = useRef(0);
  const isFallbackRef = useRef(false);
  const langIndexRef = useRef(0);

  const ARABIC_LANGS = ['ar-SA', 'ar-AE', 'ar-EG', 'ar'];

  useEffect(() => {
    if (isMemorization) {
      setShowToast(true);
      const timer = setTimeout(() => setShowToast(false), 3000);
      return () => clearTimeout(timer);
    } else {
      setShowToast(false);
    }
  }, [isMemorization]);

  const flatWords = React.useMemo(() => {
    if (!activeSurah) return [];
    const words: { word: string, normalized: string, globalIndex: number }[] = [];
    let gIndex = 0;
    activeSurah.ayahs.forEach(ayah => {
      ayah.text.split(' ').forEach(w => {
        words.push({ word: w, normalized: normalizeArabic(w), globalIndex: gIndex++ });
      });
    });
    return words;
  }, [activeSurah]);

  const stateRef = useRef({ activeSurah, isMemorization, flatWords });
  useEffect(() => {
    stateRef.current = { activeSurah, isMemorization, flatWords };
  }, [activeSurah, isMemorization, flatWords]);

  // Fetch Surahs list
  useEffect(() => {
    const cachedSurahs = localStorage.getItem('quran_surahs');
    if (cachedSurahs) {
      setSurahs(JSON.parse(cachedSurahs));
      const lastRead = localStorage.getItem('lastReadSurah');
      loadSurah(lastRead ? parseInt(lastRead) : 1);
    }

    fetch('https://api.alquran.cloud/v1/surah')
      .then(res => res.json())
      .then(data => {
        setSurahs(data.data);
        localStorage.setItem('quran_surahs', JSON.stringify(data.data));
        if (!cachedSurahs) {
          const lastRead = localStorage.getItem('lastReadSurah');
          loadSurah(lastRead ? parseInt(lastRead) : 1);
        }
      })
      .catch(err => {
        console.error('Failed to fetch surahs:', err);
        if (!cachedSurahs) setLoading(false);
      });
  }, []);

  const loadSurah = (number: number) => {
    setLoading(true);
    setSpeechError(null);
    if (isRecording) {
      recognitionRef.current?.stop();
      setIsRecording(false);
    }

    const cachedSurah = localStorage.getItem(`quran_surah_${number}`);
    if (cachedSurah) {
      const data = JSON.parse(cachedSurah);
      setActiveSurah(data);
      setRevealedIndex(0);
      confirmedIndexRef.current = 0;
      setIsMemorization(false);
      setLoading(false);
      setShowSurahList(false);
      localStorage.setItem('lastReadSurah', number.toString());
    }

    fetch(`https://api.alquran.cloud/v1/surah/${number}`)
      .then(res => res.json())
      .then(data => {
        setActiveSurah(data.data);
        localStorage.setItem(`quran_surah_${number}`, JSON.stringify(data.data));
        if (!cachedSurah) {
          setRevealedIndex(0);
          confirmedIndexRef.current = 0;
          setIsMemorization(false);
          setLoading(false);
          setShowSurahList(false);
          localStorage.setItem('lastReadSurah', number.toString());
        }
      })
      .catch(err => {
        console.error(`Failed to fetch surah ${number}:`, err);
        if (!cachedSurah) setLoading(false);
      });
  };

  // Timer
  useEffect(() => {
    if (isRecording) {
      timerRef.current = setInterval(() => setTimer(p => p + 1), 1000);
    } else {
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [isRecording]);

  // Speech Recognition Setup
  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.lang = ARABIC_LANGS[langIndexRef.current];
      recognitionRef.current.continuous = true;
      recognitionRef.current.interimResults = true;

      recognitionRef.current.onresult = (event: any) => {
        const { activeSurah, isMemorization, flatWords } = stateRef.current;
        if (!activeSurah || !isMemorization) return;

        let finalTranscript = '';
        let interimTranscript = '';
        
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript + ' ';
          } else {
            interimTranscript += event.results[i][0].transcript + ' ';
          }
        }
        
        const matchWords = (text: string, startIdx: number) => {
          const spokenWords = text.split(' ').map(normalizeArabic).filter(Boolean);
          let idx = startIdx;
          for (const spokenWord of spokenWords) {
            if (idx >= flatWords.length) break;
            // Try to find the spoken word within the next 3 words (allow skipping/errors)
            for (let offset = 0; offset < 3; offset++) {
              if (idx + offset < flatWords.length && spokenWord === flatWords[idx + offset].normalized) {
                idx += offset + 1;
                break;
              }
            }
          }
          return idx;
        };

        if (finalTranscript) {
          confirmedIndexRef.current = matchWords(finalTranscript, confirmedIndexRef.current);
          setRevealedIndex(confirmedIndexRef.current);
        }

        if (interimTranscript) {
          const tempIdx = matchWords(interimTranscript, confirmedIndexRef.current);
          setRevealedIndex(prev => tempIdx > prev ? tempIdx : prev);
        }
      };

      recognitionRef.current.onerror = (event: any) => {
        if (event.error === 'language-not-supported') {
          if (langIndexRef.current < ARABIC_LANGS.length - 1) {
            langIndexRef.current += 1;
            recognitionRef.current.lang = ARABIC_LANGS[langIndexRef.current];
            isFallbackRef.current = true;
            return; // Skip setting error and stopping
          } else {
            // Error is handled in UI, no need to log to console which triggers AI Studio error overlay
            setSpeechError("Ваш браузер не поддерживает распознавание арабской речи. Пожалуйста, используйте Google Chrome.");
          }
        } else if (event.error === 'not-allowed') {
          setSpeechError("Нет доступа к микрофону. Разрешите доступ в настройках браузера.");
        } else {
          setSpeechError(`Ошибка микрофона: ${event.error}`);
        }
        setIsRecording(false);
      };
      
      recognitionRef.current.onend = () => {
        if (isFallbackRef.current) {
          isFallbackRef.current = false;
          try {
            recognitionRef.current?.start();
          } catch (e) {
            console.error("Failed to restart recognition on fallback", e);
            setIsRecording(false);
          }
        } else {
          setIsRecording(false);
        }
      };
    } else {
      setSpeechError("Ваш браузер не поддерживает голосовой ввод. Пожалуйста, используйте Google Chrome.");
    }

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, []); // Run only once on mount

  const toggleRecording = () => {
    if (isRecording) {
      recognitionRef.current?.stop();
      setIsRecording(false);
    } else {
      setTimer(0);
      setRevealedIndex(0); // Reset for new session
      confirmedIndexRef.current = 0;
      try {
        recognitionRef.current?.start();
        setIsRecording(true);
      } catch (e) {
        console.error(e);
        alert("Не удалось запустить микрофон. Возможно, нет разрешения.");
      }
    }
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  if (loading && !activeSurah) {
    return <div className="flex items-center justify-center h-full"><div className="animate-pulse text-blue-500 font-medium">Загрузка сур...</div></div>;
  }

  if (showSurahList || !activeSurah) {
    const filtered = surahs.filter(s => s.name.includes(searchQuery) || s.englishName.toLowerCase().includes(searchQuery.toLowerCase()));
    return (
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        className="flex flex-col"
      >
        <div className="mb-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-2xl font-bold text-ink">Оглавление</h2>
            {activeSurah && (
              <button onClick={() => setShowSurahList(false)} className="p-2 text-gray-500 hover:text-blue-500 transition-colors">
                <X size={24} />
              </button>
            )}
          </div>
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
            <input
              type="text"
              placeholder="Поиск суры..."
              className="w-full pl-12 pr-4 py-4 rounded-2xl bg-bg shadow-[var(--shadow-btn-inset)] outline-none text-ink placeholder-gray-400"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>
        </div>
        <div className="space-y-4 pr-2">
          {filtered.map(surah => (
            <div
              key={surah.number}
              onClick={() => loadSurah(surah.number)}
              className={`p-4 rounded-2xl flex items-center justify-between cursor-pointer active:scale-95 transition-transform ${activeSurah?.number === surah.number ? 'bg-blue-50/50 shadow-[var(--shadow-btn-inset)]' : 'bg-bg shadow-[var(--shadow-flat)] hover:shadow-[var(--shadow-btn-hover)]'}`}
            >
              <div className="flex items-center gap-4">
                <div className={`w-12 h-12 rounded-full shadow-[var(--shadow-btn-inset)] flex items-center justify-center font-bold text-lg ${activeSurah?.number === surah.number ? 'text-blue-600' : 'text-blue-500'}`}>
                  {surah.number}
                </div>
                <div>
                  <div className="font-bold text-ink text-lg">{surah.englishName}</div>
                  <div className="text-sm text-gray-500">{surah.englishNameTranslation}</div>
                </div>
              </div>
              <div className="text-2xl font-arabic text-blue-600" dir="rtl">{surah.name}</div>
            </div>
          ))}
        </div>
      </motion.div>
    );
  }

  // Render Reading View
  let globalWordCounter = 0;

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="flex flex-col relative"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-6 bg-bg p-4 rounded-2xl shadow-[var(--shadow-flat)] relative z-20">
        <button 
          onClick={() => setShowSurahList(true)} 
          className="p-2 text-gray-500 hover:text-blue-500 transition-colors"
        >
          <List size={24} />
        </button>
        <div className="text-center">
          <h2 className="text-2xl font-arabic font-bold text-ink" dir="rtl">{activeSurah.name}</h2>
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wider">Сура {activeSurah.number}</p>
        </div>
        <div className="w-10"></div> {/* Spacer */}
      </div>

      {speechError && (
        <div className="mb-4 p-4 bg-red-100/50 text-red-600 rounded-2xl text-sm text-center shadow-[var(--shadow-flat)] relative z-20">
          {speechError}
        </div>
      )}

      {/* Toast for Memorization Mode */}
      <AnimatePresence>
        {showToast && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-24 left-1/2 -translate-x-1/2 bg-ink text-white px-6 py-2 rounded-full text-sm font-medium shadow-lg z-50 whitespace-nowrap"
          >
            Режим запоминания: Включён
          </motion.div>
        )}
      </AnimatePresence>

      {/* Content */}
      <div className="px-2" dir="rtl">
        <div className="text-right text-3xl leading-[2.5] font-arabic text-ink">
          {activeSurah.ayahs.map((ayah) => (
            <span key={ayah.numberInSurah}>
              {ayah.text.split(' ').map((word, wIdx) => {
                const currentGlobalIdx = globalWordCounter++;
                const isRevealed = !isMemorization || currentGlobalIdx < revealedIndex;
                const isJustRevealed = isMemorization && currentGlobalIdx === revealedIndex - 1;

                return (
                  <span key={wIdx} className="inline-block mx-1">
                    {isRevealed ? (
                      <span className={`transition-colors duration-300 ${isJustRevealed ? 'text-blue-500 font-bold' : ''}`}>
                        {word}
                      </span>
                    ) : (
                      <span className="text-transparent border-b-2 border-gray-300 inline-block min-w-[2rem] mx-1 relative top-2">
                        _
                      </span>
                    )}
                  </span>
                );
              })}
              <span className="inline-flex items-center justify-center w-10 h-10 rounded-full border-2 border-gray-300 text-lg mx-2 text-gray-500 font-sans relative -top-1">
                {ayah.numberInSurah}
              </span>
            </span>
          ))}
        </div>
      </div>

      {/* Bottom Control Panel */}
      <div className="fixed bottom-24 left-0 right-0 z-40 px-6 pointer-events-none flex justify-between items-end max-w-md mx-auto">
        {/* Left: Hide/Show Ayahs */}
        <div className="pointer-events-auto flex items-center">
          <button 
            className={`w-14 h-14 flex items-center justify-center rounded-full transition-all bg-bg shadow-[var(--shadow-flat)] ${isMemorization ? 'text-blue-500' : 'text-gray-500 hover:text-ink'}`}
            onClick={() => setIsMemorization(!isMemorization)}
          >
            {isMemorization ? <EyeOff size={24} /> : <Eye size={24} />}
          </button>
        </div>

        {/* Right: Microphone & Timer */}
        <div className="flex flex-col items-end gap-4 pointer-events-auto">
          {isRecording && (
            <div className="bg-bg px-4 py-2 rounded-full shadow-[var(--shadow-flat)] flex items-center gap-2 text-sm font-bold text-ink">
              <div className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse"></div>
              {formatTime(timer)}
            </div>
          )}
          <button
            onClick={toggleRecording}
            className={`w-14 h-14 rounded-full flex items-center justify-center text-white transition-all duration-300 transform hover:scale-105 ${
              isRecording 
                ? 'bg-red-500 shadow-[0_0_15px_rgba(239,68,68,0.5)]' 
                : 'bg-gradient-to-br from-blue-400 to-blue-600 shadow-[0_0_15px_rgba(37,99,235,0.5)]'
            }`}
          >
            {isRecording ? <Square size={20} fill="currentColor" /> : <Mic size={24} />}
          </button>
        </div>
      </div>
    </motion.div>
  );
}
