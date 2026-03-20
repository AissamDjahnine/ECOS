import { useEffect, useId, useRef, useState } from "react";

function PlayIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M8 5.5v13l10-6.5-10-6.5Z" />
    </svg>
  );
}

function PauseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M7 5h4v14H7zm6 0h4v14h-4z" />
    </svg>
  );
}

function formatDuration(value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    return "0:00";
  }

  const totalSeconds = Math.floor(value);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

type RecordingPlayerProps = {
  src: string;
  darkMode: boolean;
  playbackRate: number;
};

export function RecordingPlayer({
  src,
  darkMode,
  playbackRate,
}: RecordingPlayerProps) {
  const audioId = useId();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackRate;
    }
  }, [playbackRate, src]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    const syncTime = () => setCurrentTime(audio.currentTime);
    const syncDuration = () => setDuration(audio.duration || 0);
    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(audio.duration || 0);
    };

    audio.addEventListener("timeupdate", syncTime);
    audio.addEventListener("loadedmetadata", syncDuration);
    audio.addEventListener("durationchange", syncDuration);
    audio.addEventListener("play", handlePlay);
    audio.addEventListener("pause", handlePause);
    audio.addEventListener("ended", handleEnded);

    syncTime();
    syncDuration();

    return () => {
      audio.removeEventListener("timeupdate", syncTime);
      audio.removeEventListener("loadedmetadata", syncDuration);
      audio.removeEventListener("durationchange", syncDuration);
      audio.removeEventListener("play", handlePlay);
      audio.removeEventListener("pause", handlePause);
      audio.removeEventListener("ended", handleEnded);
    };
  }, [src]);

  function togglePlayback() {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    if (audio.paused) {
      void audio.play().catch(() => {
        setIsPlaying(false);
      });
      return;
    }

    audio.pause();
  }

  function handleSeek(nextValue: string) {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    const nextTime = Number(nextValue);
    audio.currentTime = nextTime;
    setCurrentTime(nextTime);
  }

  const progressMax = duration > 0 ? duration : 1;
  const progressValue = Math.min(currentTime, progressMax);

  return (
    <div
      className={`rounded-xl border px-3 py-3 ${
        darkMode ? "border-slate-700 bg-slate-900/70" : "border-slate-200 bg-slate-50"
      }`}
    >
      <audio id={audioId} ref={audioRef} src={src} preload="metadata" className="hidden" />
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={togglePlayback}
          aria-controls={audioId}
          aria-label={isPlaying ? "Mettre en pause l'enregistrement" : "Lire l'enregistrement"}
          className={`inline-flex h-10 w-10 items-center justify-center rounded-xl transition-colors ${
            darkMode
              ? "bg-slate-100 text-slate-900 hover:bg-white"
              : "bg-slate-800 text-white hover:bg-slate-900"
          }`}
        >
          {isPlaying ? <PauseIcon className="h-4 w-4" /> : <PlayIcon className="h-4 w-4 translate-x-[1px]" />}
        </button>

        <div className="min-w-0 flex-1">
          <div className="mb-1.5 flex items-center justify-between gap-3">
            <span className={`truncate text-sm font-medium ${darkMode ? "text-slate-100" : "text-slate-800"}`}>
              Enregistrement
            </span>
            <span className={`shrink-0 text-xs font-medium ${darkMode ? "text-slate-400" : "text-slate-500"}`}>
              {formatDuration(currentTime)} / {formatDuration(duration)}
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={progressMax}
            step={0.1}
            value={progressValue}
            onChange={(event) => handleSeek(event.target.value)}
            className="h-1.5 w-full cursor-pointer accent-primary-600"
            aria-label="Position de lecture"
          />
        </div>

        <div
          className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${
            darkMode ? "bg-slate-800 text-slate-300" : "bg-white text-slate-500 border border-slate-200"
          }`}
        >
          {playbackRate}x
        </div>
      </div>
    </div>
  );
}
