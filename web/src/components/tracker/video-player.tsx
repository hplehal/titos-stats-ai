"use client";

import { Pause, Play, RotateCcw, RotateCw } from "lucide-react";
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatTimecode } from "@/lib/format";

export type VideoPlayerHandle = {
  getCurrentTime: () => number;
  play: () => void;
  pause: () => void;
  togglePlay: () => void;
  seekRelative: (seconds: number) => void;
};

type Props = {
  src: string | null;
};

const SPEEDS = ["0.5", "1", "1.5", "2"];

export const VideoPlayer = forwardRef<VideoPlayerHandle, Props>(
  function VideoPlayer({ src }, ref) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);
    const [speed, setSpeed] = useState("1");

    useImperativeHandle(ref, () => ({
      getCurrentTime: () => videoRef.current?.currentTime ?? 0,
      play: () => videoRef.current?.play().catch(() => {}),
      pause: () => videoRef.current?.pause(),
      togglePlay: () => {
        const v = videoRef.current;
        if (!v) return;
        if (v.paused) v.play().catch(() => {});
        else v.pause();
      },
      seekRelative: (seconds) => {
        const v = videoRef.current;
        if (!v) return;
        v.currentTime = Math.max(0, Math.min(v.duration || 0, v.currentTime + seconds));
      },
    }));

    // Sync local speed state to the element.
    useEffect(() => {
      if (videoRef.current) videoRef.current.playbackRate = Number(speed);
    }, [speed]);

    return (
      <div className="space-y-2">
        <div className="text-3xl font-mono tabular-nums tracking-tight">
          {formatTimecode(currentTime)}
        </div>

        <video
          ref={videoRef}
          src={src ?? undefined}
          className="w-full rounded aspect-video bg-black"
          onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
          onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
        />

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={() => videoRef.current?.paused
              ? videoRef.current?.play().catch(() => {})
              : videoRef.current?.pause()}
            aria-label={isPlaying ? "Pause" : "Play"}
          >
            {isPlaying ? (
              <Pause className="size-4" />
            ) : (
              <Play className="size-4" />
            )}
          </Button>

          <Button
            variant="outline"
            size="icon"
            onClick={() => {
              const v = videoRef.current;
              if (v) v.currentTime = Math.max(0, v.currentTime - 5);
            }}
            aria-label="Back 5s"
          >
            <RotateCcw className="size-4" />
          </Button>

          <Button
            variant="outline"
            size="icon"
            onClick={() => {
              const v = videoRef.current;
              if (v) v.currentTime = Math.min(v.duration || 0, v.currentTime + 5);
            }}
            aria-label="Forward 5s"
          >
            <RotateCw className="size-4" />
          </Button>

          <input
            type="range"
            min={0}
            max={duration || 0}
            step={0.1}
            value={currentTime}
            onChange={(e) => {
              const v = videoRef.current;
              if (v) v.currentTime = Number(e.target.value);
            }}
            className="flex-1 accent-primary"
            aria-label="Seek"
          />

          <span className="text-xs text-muted-foreground tabular-nums w-24 text-right">
            {formatTimecode(currentTime)} / {formatTimecode(duration)}
          </span>

          <Select value={speed} onValueChange={(v) => setSpeed(v ?? "1")}>
            <SelectTrigger className="w-20" size="sm">
              <SelectValue>
                {(v: string | null) => `${v ?? "1"}×`}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {SPEEDS.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}×
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    );
  },
);
