import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Mic, Square, Eye, EyeOff, List, ChevronLeft, ChevronRight, ArrowLeft, Search, X, RotateCcw, Play, Pause, Loader2 } from 'lucide-react';

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
    .replace(/[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06DC\u06DF-\u06E8\u06EA-\u06ED]/g, "") // Remove all diacritics and small signs
    .replace(/[إأآٱا]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/\s+/g, " ")
    .trim();
};

interface QuranReaderProps {
  plan?: 'free' | 'premium';
}

export default function QuranReader({ plan = 'free' }: QuranReaderProps) {
  const [surahs, setSurahs] = useState<Surah[]>([]);
  const [activeSurah, setActiveSurah] = useState<SurahDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [isMemorization, setIsMemorization] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [revealedIndex, setRevealedIndex] = useState(0);
  const [timer, setTimer] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [speechError, setSpeechError] = useState<string | null>(null);
  const [interimText, setInterimText] = useState('');
  const [showHelp, setShowHelp] = useState(false);
  const [showSurahList, setShowSurahList] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [isBrowserSupported, setIsBrowserSupported] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentAudio, setCurrentAudio] = useState<HTMLAudioElement | null>(null);
  const [audioLoading, setAudioLoading] = useState(false);
  const [showPremiumModal, setShowPremiumModal] = useState(false);

  const recognitionRef = useRef<any>(null);
  const timerRef = useRef<any>(null);
  const confirmedIndexRef = useRef(0);
  const isFallbackRef = useRef(false);
  const langIndexRef = useRef(0);

  const ARABIC_LANGS = ['ar-SA', 'ar-AE', 'ar-EG', 'ar'];

  // Check browser support on mount
  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setIsBrowserSupported(false);
    }
  }, []);

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
      // Use regex to split by any whitespace or special characters that might be in the text
      ayah.text.trim().split(/\s+/).forEach(w => {
        if (w) {
          words.push({ word: w, normalized: normalizeArabic(w), globalIndex: gIndex++ });
        }
      });
    });
    return words;
  }, [activeSurah]);

  const stateRef = useRef({ activeSurah, isMemorization, flatWords, revealedIndex });
  useEffect(() => {
    stateRef.current = { activeSurah, isMemorization, flatWords, revealedIndex };
  }, [activeSurah, isMemorization, flatWords, revealedIndex]);

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

  const toggleAudio = async () => {
    if (isPlaying) {
      currentAudio?.pause();
      setIsPlaying(false);
      return;
    }

    if (currentAudio) {
      currentAudio.play();
      setIsPlaying(true);
      return;
    }

    if (!activeSurah) return;

    setAudioLoading(true);
    try {
      // Fetch recitation by Mishary Rashid Alafasy
      const res = await fetch(`https://api.alquran.cloud/v1/surah/${activeSurah.number}/ar.alafasy`);
      const data = await res.json();
      
      // Combine all ayah audios into one sequence or just play them one by one
      // For simplicity, we'll create a playlist logic or use a combined stream if available
      // Alafasy full surah stream: https://cdn.islamic.network/quran/audio-surah/128/ar.alafasy/{surah}.mp3
      const audioUrl = `https://cdn.islamic.network/quran/audio-surah/128/ar.alafasy/${activeSurah.number}.mp3`;
      
      const audio = new Audio(audioUrl);
      audio.onended = () => setIsPlaying(false);
      audio.oncanplaythrough = () => {
        setAudioLoading(false);
        audio.play();
        setIsPlaying(true);
      };
      setCurrentAudio(audio);
    } catch (err) {
      console.error("Failed to load audio:", err);
      setAudioLoading(false);
      setSpeechError("Не удалось загрузить аудио. Попробуйте позже.");
    }
  };

  // Cleanup audio on unmount or surah change
  useEffect(() => {
    return () => {
      currentAudio?.pause();
      setCurrentAudio(null);
      setIsPlaying(false);
    };
  }, [activeSurah]);

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

      const onResult = (event: any) => {
        const { activeSurah, isMemorization, flatWords, revealedIndex } = stateRef.current;
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

        setInterimText(finalTranscript || interimTranscript);
        
        const matchWords = (text: string, startIdx: number) => {
          const spokenWords = text.split(/\s+/).map(normalizeArabic).filter(Boolean);
          let idx = startIdx;
          for (const spokenWord of spokenWords) {
            if (idx >= flatWords.length) break;
            // Try to find the spoken word within the next 6 words (even more robust)
            for (let offset = 0; offset < 6; offset++) {
              if (idx + offset < flatWords.length && spokenWord === flatWords[idx + offset].normalized) {
                idx += offset + 1;
                break;
              }
            }
          }
          return idx;
        };

        if (finalTranscript) {
          const newIdx = matchWords(finalTranscript, confirmedIndexRef.current);
          if (newIdx > confirmedIndexRef.current) {
            confirmedIndexRef.current = newIdx;
            setRevealedIndex(newIdx);
          }
        }

        if (interimTranscript) {
          const tempIdx = matchWords(interimTranscript, confirmedIndexRef.current);
          if (tempIdx > revealedIndex) {
            setRevealedIndex(tempIdx);
          }
        }
      };

      const onError = (event: any) => {
        if (event.error === 'language-not-supported') {
          if (langIndexRef.current < ARABIC_LANGS.length - 1) {
            langIndexRef.current += 1;
            recognitionRef.current.lang = ARABIC_LANGS[langIndexRef.current];
            isFallbackRef.current = true;
            return; // Skip setting error and stopping
          } else {
            setSpeechError("Ваш браузер не поддерживает распознавание арабской речи. Пожалуйста, используйте Google Chrome.");
          }
        } else if (event.error === 'not-allowed') {
          setSpeechError("Нет доступа к микрофону. Разрешите доступ в настройках браузера.");
        } else {
          setSpeechError(`Ошибка микрофона: ${event.error}`);
        }
        setIsRecording(false);
      };

      const onEnd = () => {
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

      // Store handlers globally for re-initialization
      (window as any)._quran_onresult = onResult;
      (window as any)._quran_onerror = onError;
      (window as any)._quran_onend = onEnd;

      recognitionRef.current.onresult = onResult;
      recognitionRef.current.onerror = onError;
      recognitionRef.current.onend = onEnd;
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
    if (plan === 'free') {
      setShowPremiumModal(true);
      return;
    }

    if (isRecording) {
      recognitionRef.current?.stop();
      setIsRecording(false);
      setInterimText('');
    } else {
      setTimer(0);
      setSpeechError(null);
      setInterimText('');
      
      if (revealedIndex >= flatWords.length) {
        setRevealedIndex(0);
        confirmedIndexRef.current = 0;
      }
      
      try {
        // Re-initialize to ensure fresh state and correct language
        const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (SpeechRecognition) {
          recognitionRef.current = new SpeechRecognition();
          recognitionRef.current.lang = ARABIC_LANGS[langIndexRef.current];
          recognitionRef.current.continuous = true;
          recognitionRef.current.interimResults = true;
          
          // Re-attach handlers (simplified for this chunk)
          // In a real app, you'd wrap the setup in a function
          // For now, we rely on the initial setup but try to start it
          recognitionRef.current.onresult = (window as any)._quran_onresult;
          recognitionRef.current.onerror = (window as any)._quran_onerror;
          recognitionRef.current.onend = (window as any)._quran_onend;
        }

        recognitionRef.current?.start();
        setIsRecording(true);
      } catch (e) {
        console.error(e);
        setSpeechError("Не удалось запустить микрофон. Пожалуйста, проверьте разрешения или используйте Google Chrome.");
        setIsRecording(false);
      }
    }
  };

  const resetProgress = () => {
    setRevealedIndex(0);
    confirmedIndexRef.current = 0;
    if (isRecording) {
      recognitionRef.current?.stop();
      setIsRecording(false);
    }
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  if (loading && !activeSurah) {
    return (
      <div className="flex items-center justify-center h-full">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1.5, repeat: Infinity, repeatType: "reverse", ease: "easeInOut" }}
          className="text-5xl md:text-6xl font-arabic text-ink text-center px-4 leading-relaxed"
          dir="rtl"
        >
          بِسْمِ ٱللَّٰهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ
        </motion.div>
      </div>
    );
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
          title="Список сур"
        >
          <List size={24} />
        </button>
        <div className="text-center">
          <h2 className="text-2xl font-arabic font-bold text-ink" dir="rtl">{activeSurah.name}</h2>
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wider">Сура {activeSurah.number}</p>
        </div>
        <div className="w-10"></div> {/* Spacer for balance */}
      </div>

      <AnimatePresence>
        {showHelp && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mb-6 overflow-hidden"
          >
            <div className="bg-blue-50/50 p-5 rounded-2xl shadow-[var(--shadow-btn-inset)] text-sm text-ink space-y-3 border border-blue-100">
              <p className="font-bold text-blue-700 flex items-center gap-2">
                <Mic size={16} /> Как пользоваться:
              </p>
              <ul className="list-disc list-inside space-y-1 text-gray-600">
                <li>Нажмите <b>глаз</b>, чтобы скрыть текст для заучивания.</li>
                <li>Нажмите <b>микрофон</b> и читайте вслух — слова будут открываться сами.</li>
                <li>Если микрофон не срабатывает, просто <b>нажмите на слово</b>, чтобы открыть его.</li>
                <li>Для лучшей работы используйте <b>Google Chrome</b>.</li>
              </ul>
              {!isBrowserSupported && (
                <p className="text-red-500 font-medium bg-red-50 p-2 rounded-lg border border-red-100">
                  ⚠️ Ваш браузер не поддерживает голосовой ввод. Рекомендуем Google Chrome.
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

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
      <div className="px-2 pb-40" dir="rtl">
        <div className="text-right text-3xl leading-[2.5] font-arabic text-ink">
          {activeSurah.ayahs.map((ayah) => (
            <span key={ayah.numberInSurah}>
              {ayah.text.trim().split(/\s+/).map((word, wIdx) => {
                const currentGlobalIdx = globalWordCounter++;
                const isRevealed = !isMemorization || currentGlobalIdx < revealedIndex;
                const isJustRevealed = isMemorization && currentGlobalIdx === revealedIndex - 1;

                return (
                  <span 
                    key={wIdx} 
                    className={`inline-block mx-1 ${isMemorization && !isRevealed ? 'cursor-pointer' : ''}`}
                    onClick={() => {
                      if (isMemorization && !isRevealed) {
                        const nextIdx = currentGlobalIdx + 1;
                        setRevealedIndex(nextIdx);
                        confirmedIndexRef.current = nextIdx;
                      }
                    }}
                  >
                    {isRevealed ? (
                      <span className={`transition-colors duration-300 ${isJustRevealed ? 'text-blue-500 font-bold' : ''}`}>
                        {word}
                      </span>
                    ) : (
                      <span className="text-transparent border-b-2 border-gray-300 inline-block min-w-[2.5rem] mx-1 relative top-2 hover:border-blue-500 transition-colors">
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
      <div className="fixed bottom-24 left-0 right-0 z-40 px-6 pointer-events-none flex flex-col items-center gap-4 max-w-md mx-auto">
        {/* Interim Text Feedback */}
        <AnimatePresence>
          {isRecording && interimText && (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="bg-bg/80 backdrop-blur-md px-4 py-2 rounded-2xl shadow-[var(--shadow-flat)] text-sm text-blue-600 font-arabic text-center max-w-[80%] pointer-events-auto"
              dir="rtl"
            >
              {interimText}
            </motion.div>
          )}
        </AnimatePresence>

        <div className="w-full flex justify-between items-end">
          {/* Left: Hide/Show Ayahs & Reset */}
          <div className="pointer-events-auto flex flex-col gap-4">
            <button 
              className={`w-14 h-14 flex items-center justify-center rounded-full transition-all bg-bg shadow-[var(--shadow-flat)] ${isMemorization ? 'text-blue-500' : 'text-gray-500 hover:text-ink'}`}
              onClick={() => setIsMemorization(!isMemorization)}
              title={isMemorization ? "Показать текст" : "Скрыть текст"}
            >
              {isMemorization ? <EyeOff size={24} /> : <Eye size={24} />}
            </button>
            
            {/* Reset button removed */}
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
      </div>
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
                  <Mic size={40} />
                </div>
                
                <div className="space-y-2">
                  <h3 className="text-2xl font-bold text-ink">Премиум функция</h3>
                  <p className="text-gray-500 leading-relaxed">
                    Голосовое распознавание доступно только в <b>Premium</b> тарифе. 
                    Это поможет вам эффективнее заучивать Коран.
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
}
