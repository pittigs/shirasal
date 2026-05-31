/**
 * Plays a synthesized notification sound using the Web Audio API
 * @param {'join' | 'leave' | 'mute' | 'unmute'} type 
 */
export const playNotificationSound = (type: 'join' | 'leave' | 'mute' | 'unmute') => {
  try {
    // Read volume from localStorage (default is 50%)
    const saved = localStorage.getItem('voicechat-theme-settings');
    let volumeScale = 0.5;
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed.soundVolume !== undefined) {
        volumeScale = parsed.soundVolume / 100;
      }
    }

    if (volumeScale === 0) return;

    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    const ctx = new AudioContextClass();
    
    // Play upward chime for join
    if (type === 'join') {
      const now = ctx.currentTime;
      [523.25, 659.25, 783.99].forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + idx * 0.08);
        
        gain.gain.setValueAtTime(0, now + idx * 0.08);
        gain.gain.linearRampToValueAtTime(0.08 * volumeScale, now + idx * 0.08 + 0.02);
        gain.gain.setValueAtTime(0.08 * volumeScale, now + idx * 0.08 + 0.1);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.08 + 0.25);
        
        osc.start(now + idx * 0.08);
        osc.stop(now + idx * 0.08 + 0.26);
      });
    } 
    // Play downward chime for leave
    else if (type === 'leave') {
      const now = ctx.currentTime;
      [783.99, 659.25, 523.25].forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + idx * 0.08);
        
        gain.gain.setValueAtTime(0, now + idx * 0.08);
        gain.gain.linearRampToValueAtTime(0.08 * volumeScale, now + idx * 0.08 + 0.02);
        gain.gain.setValueAtTime(0.08 * volumeScale, now + idx * 0.08 + 0.1);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.08 + 0.25);
        
        osc.start(now + idx * 0.08);
        osc.stop(now + idx * 0.08 + 0.26);
      });
    } 
    // Play double low beep for mute
    else if (type === 'mute') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(220, ctx.currentTime);
      
      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.06 * volumeScale, ctx.currentTime + 0.02);
      gain.gain.setValueAtTime(0.06 * volumeScale, ctx.currentTime + 0.08);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
      
      osc.start();
      osc.stop(ctx.currentTime + 0.13);
    } 
    // Play high chime for unmute
    else if (type === 'unmute') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      osc.type = 'sine';
      osc.frequency.setValueAtTime(440, ctx.currentTime);
      
      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.06 * volumeScale, ctx.currentTime + 0.02);
      gain.gain.setValueAtTime(0.06 * volumeScale, ctx.currentTime + 0.08);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
      
      osc.start();
      osc.stop(ctx.currentTime + 0.13);
    }
  } catch (err) {
    console.warn('Failed to play synthesized sound notification:', err);
  }
};
