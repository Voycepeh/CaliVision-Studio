export type LiveAudioCueStyle = "beep" | "chime" | "voice-count" | "silent";

function canUseAudioApis() {
  return typeof window !== "undefined" && (typeof window.AudioContext !== "undefined" || typeof (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext !== "undefined");
}

export function canUseLiveAudioCues(): boolean {
  return canUseAudioApis() || (typeof window !== "undefined" && typeof window.speechSynthesis !== "undefined");
}

export function createLiveAudioCueController() {
  let audioContext: AudioContext | null = null;

  const getAudioContext = () => {
    if (audioContext) {
      return audioContext;
    }
    if (!canUseAudioApis()) {
      return null;
    }
    const Context = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Context) {
      return null;
    }
    audioContext = new Context();
    return audioContext;
  };

  const prime = async () => {
    const context = getAudioContext();
    if (!context) return false;
    if (context.state === "suspended") {
      await context.resume();
    }
    return true;
  };

  const tone = async (frequency: number, durationMs: number, gain = 0.04) => {
    const context = getAudioContext();
    if (!context) return;
    if (context.state === "suspended") {
      await context.resume();
    }
    const osc = context.createOscillator();
    const amp = context.createGain();
    osc.frequency.value = frequency;
    osc.type = "sine";
    amp.gain.value = gain;
    osc.connect(amp);
    amp.connect(context.destination);
    osc.start();
    osc.stop(context.currentTime + durationMs / 1000);
  };

  const speakCount = (count: number) => {
    if (typeof window === "undefined" || typeof window.speechSynthesis === "undefined") return;
    const utterance = new SpeechSynthesisUtterance(String(count));
    utterance.rate = 1;
    utterance.pitch = 1;
    utterance.volume = 0.9;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  };

  return {
    async prime() {
      return prime();
    },
    async playRepSuccess(style: LiveAudioCueStyle, repCount: number) {
      if (style === "silent") return;
      if (style === "voice-count") {
        await tone(880, 70, 0.03);
        speakCount(repCount);
        return;
      }
      if (style === "chime") {
        await tone(740, 70, 0.035);
        await tone(980, 90, 0.035);
        return;
      }
      await tone(880, 100, 0.04);
    },
    async playHoldStart(style: LiveAudioCueStyle) {
      if (style === "silent") return;
      await tone(620, 90, 0.03);
    },
    async playHoldSuccess(style: LiveAudioCueStyle) {
      if (style === "silent") return;
      if (style === "chime" || style === "voice-count") {
        await tone(740, 80, 0.03);
        await tone(1040, 110, 0.035);
        return;
      }
      await tone(900, 110, 0.04);
    },
    async playHoldWarning(style: LiveAudioCueStyle) {
      if (style === "silent") return;
      await tone(320, 120, 0.045);
    }
  };
}
