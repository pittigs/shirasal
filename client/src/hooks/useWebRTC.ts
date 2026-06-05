import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { Room, RoomEvent, createLocalAudioTrack, ExternalE2EEKeyProvider } from 'livekit-client';

import { RnnoiseWorkletNode, loadRnnoise } from '@sapphi-red/web-noise-suppressor';
import rnnoiseWorkletPath from '@sapphi-red/web-noise-suppressor/rnnoiseWorklet.js?url';
import rnnoiseWasmPath from '@sapphi-red/web-noise-suppressor/rnnoise.wasm?url';
import rnnoiseSimdPath from '@sapphi-red/web-noise-suppressor/rnnoise_simd.wasm?url';
import { playNotificationSound } from '../utils/audio';

const getSocketUrl = (): string => {
  const saved = localStorage.getItem('shirasal-server-url');
  if (saved) return saved;
  const origin = window.location.origin;
  if (origin.startsWith('wails://') || origin.startsWith('file://')) {
    return 'http://localhost:3001';
  }
  return import.meta.env.DEV ? 'http://localhost:3001' : origin;
};

const SOCKET_URL = getSocketUrl();

const rtcConfig: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' }
  ]
};

interface Participant {
  socketId: string;
  username: string;
  role: string;
}

interface RemoteStreamInfo extends Participant {
  stream: MediaStream;
  videoStream?: MediaStream;
  cameraStream?: MediaStream;
  isSpeaking: boolean;
  audioActive: boolean;
}

interface ChatMessage {
  id: string;
  username: string;
  role: string;
  text: string;
  timestamp: string;
  reactions?: { [emoji: string]: string[] };
}

interface RoleInfo {
  name: string;
  color: string;
  canManageRoles: boolean;
  canManageChannels: boolean;
  canManageUsers: boolean;
}

interface Channel {
  id: string;
  name: string;
  minRole: string;
}

const optimizeOpus = (sdp: string): string => {
  if (!sdp) return sdp;
  return sdp.replace('useinbandfec=1', 'useinbandfec=1;maxaveragebitrate=256000;stereo=1;usedtx=0');
};

export const useWebRTC = () => {
  // Benutzeridentität
  const [username, setUsername] = useState('');
  const [role, setRole] = useState('guest');
  const [avatar, setAvatar] = useState<string | null>(null);
  const [accountKey, setAccountKey] = useState<string | null>(null);
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
  const [hasPassword, setHasPassword] = useState(false);
  const [hasPasskeys, setHasPasskeys] = useState(false);
  const [temp2faSecret, setTemp2faSecret] = useState<string | null>(null);
  const [is2faRequired, setIs2faRequired] = useState(false);
  const serverUrl = SOCKET_URL;
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [allowDemoRoles, setAllowDemoRoles] = useState(false);

  const [activationMode, setActivationMode] = useState<'vad' | 'ptt'>(() => {
    return (localStorage.getItem('voicechat-activation-mode') as 'vad' | 'ptt') || 'vad';
  });
  const activationModeRef = useRef(activationMode);

  const [pttKey, setPttKey] = useState<string>(() => {
    return localStorage.getItem('voicechat-ptt-key') || ' ';
  });
  const pttKeyRef = useRef(pttKey);

  const [isPTTPressed, setIsPTTPressed] = useState(false);
  const isPTTPressedRef = useRef(isPTTPressed);

  const [noiseSuppressionMode, setNoiseSuppressionMode] = useState<'off' | 'gate' | 'rnnoise'>(() => {
    return (localStorage.getItem('voicechat-ns-mode') as 'off' | 'gate' | 'rnnoise') || 'gate';
  });
  const noiseSuppressionModeRef = useRef(noiseSuppressionMode);

  const rnnoiseBinaryRef = useRef<any>(null);
  const rnnoiseWorkletLoadedRef = useRef(false);

  // Kanal-Listen
  const [channels, setChannels] = useState<Channel[]>([]);
  const [textChannels, setTextChannels] = useState<Channel[]>([]);
  const [joinedRoomId, setJoinedRoomId] = useState<string | null>(null);
  const [currentTextRoomId, setCurrentTextRoomId] = useState<string>('general');
  const [roles, setRoles] = useState<RoleInfo[]>([]);
  const [searchResults, setSearchResults] = useState<ChatMessage[]>([]);

  // Chatnachrichten für den aktiven Kanal
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);

  // Remote-Teilnehmer (Sprache) & Admintools
  const [remoteStreams, setRemoteStreams] = useState<RemoteStreamInfo[]>([]);
  const [adminUsersList, setAdminUsersList] = useState<any[]>([]); // Ausführliche Liste für Admins
  const [onlineUsers, setOnlineUsers] = useState<Array<{ socketId: string; username: string; role: string; avatar?: string | null }>>([]); // Vereinfachte Liste für Laufband
  const [allUsers, setAllUsers] = useState<Array<{ username: string; role: string; online: boolean; socketId: string | null; avatar?: string | null }>>([]); // Alle Kontakte

  // Private Chats (PNs)
  const [privateChats, setPrivateChats] = useState<{ [username: string]: ChatMessage[] }>({});
  const [activePrivatePartner, setActivePrivatePartner] = useState<string | null>(null);
  const [unreadDMs, setUnreadDMs] = useState<{ [username: string]: boolean }>({});

  // Noise Gate Einstellungen
  const [noiseThreshold, setNoiseThreshold] = useState<number>(25);
  const noiseThresholdRef = useRef(25);

  useEffect(() => {
    noiseThresholdRef.current = noiseThreshold;
  }, [noiseThreshold]);

  useEffect(() => {
    activationModeRef.current = activationMode;
    localStorage.setItem('voicechat-activation-mode', activationMode);
  }, [activationMode]);

  useEffect(() => {
    pttKeyRef.current = pttKey;
    localStorage.setItem('voicechat-ptt-key', pttKey);
  }, [pttKey]);

  useEffect(() => {
    isPTTPressedRef.current = isPTTPressed;
  }, [isPTTPressed]);

  useEffect(() => {
    noiseSuppressionModeRef.current = noiseSuppressionMode;
    localStorage.setItem('voicechat-ns-mode', noiseSuppressionMode);
  }, [noiseSuppressionMode]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (activationModeRef.current !== 'ptt') return;
      
      const activeEl = document.activeElement;
      if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.tagName === 'SELECT')) {
        return;
      }

      if (e.key === pttKeyRef.current) {
        if (e.key === ' ') {
          e.preventDefault();
        }
        if (!e.repeat) {
          setIsPTTPressed(true);
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (activationModeRef.current !== 'ptt') return;

      if (e.key === pttKeyRef.current) {
        setIsPTTPressed(false);
      }
    };

    const handleBlur = () => {
      if (activationModeRef.current === 'ptt') {
        setIsPTTPressed(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
    };
  }, []);

  useEffect(() => {
    if (activationMode === 'ptt' && localGainNodeRef.current && audioContextRef.current) {
      const audioCtx = audioContextRef.current;
      if (audioCtx.state !== 'closed') {
        localGainNodeRef.current.gain.setTargetAtTime(isPTTPressed ? 1.0 : 0.0, audioCtx.currentTime, 0.01);
        setLocalSpeaking(isPTTPressed);
      }
    }
  }, [isPTTPressed, activationMode]);

  // Advanced Audio Einstellungen
  const [echoCancellation, setEchoCancellation] = useState(true);
  const [autoGainControl, setAutoGainControl] = useState(true);
  const [keyboardFilter, setKeyboardFilter] = useState(true);
  const [audioProfile, setAudioProfile] = useState<'flat' | 'studio' | 'clear'>(() => {
    return (localStorage.getItem('voicechat-audio-profile') as 'flat' | 'studio' | 'clear') || 'flat';
  });

  useEffect(() => {
    localStorage.setItem('voicechat-audio-profile', audioProfile);
  }, [audioProfile]);

  // Trigger Re-init of local stream if constraints change
  useEffect(() => {
    if (joinedRoomId) {
      initLocalStream(noiseSuppressionMode);
    }
  }, [echoCancellation, autoGainControl, keyboardFilter, noiseSuppressionMode, audioProfile]);

  const usernameRef = useRef(username);
  useEffect(() => {
    usernameRef.current = username;
  }, [username]);

  const activePrivatePartnerRef = useRef(activePrivatePartner);
  useEffect(() => {
    activePrivatePartnerRef.current = activePrivatePartner;
  }, [activePrivatePartner]);

  // Audio-Einstellungen
  const [isMuted, setIsMuted] = useState(false);
  const [selfHearing, setSelfHearing] = useState(false);
  const [localSpeaking, setLocalSpeaking] = useState(false);

  const socketRef = useRef<Socket | null>(null);
  const livekitRoomRef = useRef<Room | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const processedStreamRef = useRef<MediaStream | null>(null);
  const destinationNodeRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const screenAudioSourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const localGainNodeRef = useRef<GainNode | null>(null);
  const peerConnectionsRef = useRef<{ [socketId: string]: any }>({});
  const audioContextRef = useRef<AudioContext | null>(null);
  const localAnalyserRef = useRef<AnalyserNode | null>(null);
  const localSourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const speechIntervalRef = useRef<number | null>(null);

  // Screen-Sharing
  const [localScreenStream, setLocalScreenStream] = useState<MediaStream | null>(null);
  const localScreenStreamRef = useRef<MediaStream | null>(null);
  const screenSendersRef = useRef<{ [socketId: string]: RTCRtpSender }>({});

  // Webcam Support
  const [localCameraStream, setLocalCameraStream] = useState<MediaStream | null>(null);
  const localCameraStreamRef = useRef<MediaStream | null>(null);
  const cameraSendersRef = useRef<{ [socketId: string]: any }>({});

  const onlineUsersRef = useRef(onlineUsers);
  useEffect(() => {
    onlineUsersRef.current = onlineUsers;
  }, [onlineUsers]);

  const setupLiveKitEventListeners = (room: Room) => {
    const updateParticipantsState = () => {
      const streams: RemoteStreamInfo[] = [];

      room.remoteParticipants.forEach((participant) => {
        let audioStream: MediaStream | undefined;
        let screenStream: MediaStream | undefined;
        let cameraStream: MediaStream | undefined;

        participant.trackPublications.forEach((pub) => {
          if (pub.track && pub.isSubscribed) {
            const mediaTrack = pub.track.mediaStreamTrack;
            if (mediaTrack) {
              if (pub.kind === 'audio') {
                audioStream = new MediaStream([mediaTrack]);
              } else if (pub.kind === 'video') {
                if (pub.source === 'screen_share') {
                  screenStream = new MediaStream([mediaTrack]);
                } else {
                  cameraStream = new MediaStream([mediaTrack]);
                }
              }
            }
          }
        });

        const onlineUser = onlineUsersRef.current.find(u => u.username === participant.identity);
        const role = onlineUser?.role || 'guest';

        streams.push({
          socketId: participant.sid,
          username: participant.identity,
          role: role,
          stream: audioStream || new MediaStream(),
          videoStream: screenStream,
          cameraStream: cameraStream,
          isSpeaking: participant.isSpeaking,
          audioActive: true
        });
      });

      setRemoteStreams(streams);
    };

    room.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
      console.log(`Subscribed to track ${publication.trackSid} from ${participant.identity}`);
      updateParticipantsState();
    });

    room.on(RoomEvent.TrackUnsubscribed, (track, publication, participant) => {
      console.log(`Unsubscribed from track ${publication.trackSid} from ${participant.identity}`);
      updateParticipantsState();
    });

    room.on(RoomEvent.ParticipantConnected, (participant) => {
      console.log(`Participant connected to LiveKit: ${participant.identity}`);
      updateParticipantsState();
      playNotificationSound('join');
    });

    room.on(RoomEvent.ParticipantDisconnected, (participant) => {
      console.log(`Participant disconnected from LiveKit: ${participant.identity}`);
      updateParticipantsState();
      playNotificationSound('leave');
    });

    room.on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
      setRemoteStreams((prev) =>
        prev.map((p) => {
          const isSpeaking = speakers.some((s) => s.identity === p.username);
          return { ...p, isSpeaking };
        })
      );
    });

    updateParticipantsState();
  };

  const connectToLiveKit = async (url: string, token: string, roomId: string) => {
    try {
      if (livekitRoomRef.current) {
        await livekitRoomRef.current.disconnect();
      }

      const keyProvider = new ExternalE2EEKeyProvider();
      const derivedKey = `shirasal-e2ee-salt-${roomId}`;
      await keyProvider.setKey(derivedKey);

      const room = new Room({
        e2ee: {
          keyProvider,
          worker: new Worker(new URL('livekit-client/dist/livekit-client.e2ee.worker.js', import.meta.url))
        },
        publishDefaults: {
          audioBitrate: 256000,
        }
      });
      livekitRoomRef.current = room;

      await room.setE2EEEnabled(true);
      await room.connect(url, token);
      console.log('Successfully connected to LiveKit room:', roomId);

      const streamToSend = processedStreamRef.current || localStreamRef.current;
      if (streamToSend) {
        const audioTracks = streamToSend.getAudioTracks();
        if (audioTracks.length > 0) {
          const localTrack = createLocalAudioTrack(audioTracks[0]);
          await room.localParticipant.publishTrack(localTrack);
        }
      }

      if (localScreenStreamRef.current) {
        const videoTrack = localScreenStreamRef.current.getVideoTracks()[0];
        if (videoTrack) {
          await room.localParticipant.publishTrack(videoTrack, { name: 'screen' });
        }
      }

      if (localCameraStreamRef.current) {
        const videoTrack = localCameraStreamRef.current.getVideoTracks()[0];
        if (videoTrack) {
          await room.localParticipant.publishTrack(videoTrack, { name: 'camera' });
        }
      }

      setupLiveKitEventListeners(room);
    } catch (err) {
      console.error('Failed to connect to LiveKit:', err);
    }
  };

  // 1. Socket.io Verbindung & Event-Management
  useEffect(() => {
    const socket = io(SOCKET_URL);
    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('Mit Signaling-Server verbunden');
      
      const savedKey = localStorage.getItem('voicechat-account-key');
      if (savedKey) {
        socket.emit('login-account', { accountKey: savedKey });
      }
    });

    socket.on('server-config', (config: { allowDemoRoles: boolean }) => {
      setAllowDemoRoles(config.allowDemoRoles);
    });

    socket.on('channels-list', (list: Channel[]) => {
      setChannels(list);
    });

    socket.on('text-channels-list', (list: Channel[]) => {
      setTextChannels(list);
    });

    socket.on('text-history', (history: ChatMessage[]) => {
      setChatMessages(history);
    });

    socket.on('chat-message', (msg: ChatMessage) => {
      setChatMessages((prev) => [...prev, msg]);
    });

    socket.on('admin-users-list', (list: any[]) => {
      setAdminUsersList(list);
    });

    socket.on('online-users-list', (list: Array<{ socketId: string; username: string; role: string; avatar?: string | null }>) => {
      setOnlineUsers(list);
    });

    socket.on('all-users-list', (list: Array<{ username: string; role: string; online: boolean; socketId: string | null; avatar?: string | null }>) => {
      setAllUsers(list);
    });

    socket.on('private-history', (history: any[]) => {
      const chats: { [username: string]: ChatMessage[] } = {};
      const currentUsername = usernameRef.current;
      history.forEach((msg) => {
        const partner = msg.senderUsername === currentUsername ? msg.receiverUsername : msg.senderUsername;
        if (!chats[partner]) chats[partner] = [];
        chats[partner].push({
          id: msg.id,
          username: msg.senderUsername,
          role: msg.senderRole || 'guest',
          text: msg.text,
          timestamp: msg.timestamp,
          reactions: msg.reactions || {}
        });
      });
      setPrivateChats(chats);
    });

    socket.on('private-message', (payload: any) => {
      const { senderUsername, receiverUsername, senderRole, text, timestamp, id, reactions } = payload;
      const currentUsername = usernameRef.current;
      const partner = senderUsername === currentUsername ? receiverUsername : senderUsername;
      
      const newMsg: ChatMessage = {
        id,
        username: senderUsername,
        role: senderRole || 'guest',
        text,
        timestamp,
        reactions: reactions || {}
      };

      setPrivateChats((prev) => {
        const list = prev[partner] || [];
        return {
          ...prev,
          [partner]: [...list, newMsg]
        };
      });

      if (partner !== activePrivatePartnerRef.current) {
        setUnreadDMs((prev) => ({
          ...prev,
          [partner]: true
        }));
      }
    });

    socket.on('error-msg', (err: string) => {
      alert(`Fehler: ${err}`);
      setJoinedRoomId(null);
    });

    // --- Nickname Updates ---
    socket.on('nickname-updated', ({ username: newName }) => {
      setUsername(newName);
    });

    // --- Avatar Updates ---
    socket.on('avatar-updated', ({ avatar: newAvatar }) => {
      setAvatar(newAvatar);
    });

    socket.on('user-updated', ({ socketId, username: newName }) => {
      setRemoteStreams((prev) =>
        prev.map((p) => (p.socketId === socketId ? { ...p, username: newName } : p))
      );
    });

    // --- Live Rolle heraufstufen/herabstufen ---
    socket.on('role-updated', ({ role: newRole }) => {
      setRole(newRole);
      alert(`Deine Benutzerrechte wurden aktualisiert! Neue Rolle: ${newRole === 'admin' ? '👑 Admin' : newRole === 'member' ? '🛡️ Mitglied' : '👤 Gast'}`);
    });

    // --- Account Listeners ---
    socket.on('account-created', ({ username: u, role: r, accountKey: k, avatar: av, twoFactorEnabled: tfa, hasPassword: hp, hasPasskeys: hk }) => {
      setUsername(u);
      setRole(r);
      setAccountKey(k);
      setAvatar(av || null);
      setTwoFactorEnabled(tfa);
      setHasPassword(hp);
      setHasPasskeys(hk);
      setIs2faRequired(false);
      setIsLoggedIn(true);
      localStorage.setItem('voicechat-account-key', k);
      
      socket.emit('join-text-channel', { channelId: 'general' });
    });

    socket.on('login-success', ({ username: u, role: r, accountKey: k, avatar: av, twoFactorEnabled: tfa, hasPassword: hp, hasPasskeys: hk }) => {
      setUsername(u);
      setRole(r);
      setAccountKey(k);
      setAvatar(av || null);
      setTwoFactorEnabled(tfa);
      setHasPassword(hp);
      setHasPasskeys(hk);
      setIs2faRequired(false);
      setIsLoggedIn(true);
      localStorage.setItem('voicechat-account-key', k);

      socket.emit('join-text-channel', { channelId: 'general' });
    });

    socket.on('login-error', (msg: string) => {
      alert(`Login fehlgeschlagen: ${msg}`);
      localStorage.removeItem('voicechat-account-key');
    });

    socket.on('login-2fa-required', () => {
      setIs2faRequired(true);
    });

    socket.on('password-updated', ({ hasPassword }) => {
      setHasPassword(hasPassword);
      alert(hasPassword ? "Passwort erfolgreich eingerichtet/geändert!" : "Passwort entfernt.");
    });

    socket.on('setup-2fa-secret', ({ secret }) => {
      setTemp2faSecret(secret);
    });

    socket.on('2fa-setup-success', () => {
      setTwoFactorEnabled(true);
      setTemp2faSecret(null);
      alert("Zwei-Faktor-Authentifizierung (2FA) erfolgreich aktiviert!");
    });

    socket.on('2fa-disabled-success', () => {
      setTwoFactorEnabled(false);
      alert("Zwei-Faktor-Authentifizierung (2FA) deaktiviert.");
    });

    socket.on('register-passkey-options', async (options) => {
      try {
        const { startRegistration } = await import('@simplewebauthn/browser');
        const cred = await startRegistration({ optionsJSON: options });
        socket.emit('register-passkey-finish', {
          credential: cred,
          hostname: window.location.hostname,
          origin: window.location.origin
        });
      } catch (err: any) {
        console.error(err);
        alert('Passkey-Registrierung fehlgeschlagen: ' + err.message);
      }
    });

    socket.on('register-passkey-success', () => {
      setHasPasskeys(true);
      alert("Passkey erfolgreich registriert und verknüpft!");
    });

    socket.on('login-passkey-options', async (options) => {
      try {
        const { startAuthentication } = await import('@simplewebauthn/browser');
        const cred = await startAuthentication({ optionsJSON: options });
        socket.emit('login-passkey-finish', {
          credential: cred,
          hostname: window.location.hostname,
          origin: window.location.origin
        });
      } catch (err: any) {
        console.error(err);
        alert('Passkey-Anmeldung fehlgeschlagen: ' + err.message);
      }
    });

    socket.on('account-deleted', () => {
      logout();
      alert("Dein Account wurde dauerhaft und erfolgreich gelöscht.");
    });

    // --- Roles and Reactions Listeners ---
    socket.on('roles-list', (list: RoleInfo[]) => {
      setRoles(list);
    });

    socket.on('message-reactions-updated', ({ messageId, reactions }) => {
      setChatMessages((prev) =>
        prev.map((msg) =>
          msg.id === messageId ? { ...msg, reactions } : msg
        )
      );
    });

    socket.on('private-message-reactions-updated', ({ messageId, reactions }) => {
      setPrivateChats((prev) => {
        const updated = { ...prev };
        for (const partner in updated) {
          updated[partner] = updated[partner].map((msg) =>
            msg.id === messageId ? { ...msg, reactions } : msg
          );
        }
        return updated;
      });
    });

    socket.on('search-private-results', ({ results }) => {
      const mapped = results.map((msg: any) => ({
        id: msg.id,
        username: msg.senderUsername,
        role: msg.senderRole || 'guest',
        text: msg.text,
        timestamp: msg.timestamp,
        reactions: msg.reactions || {}
      }));
      setSearchResults(mapped);
    });

    // --- LiveKit Token Listener ---
    socket.on('livekit-token', async ({ token, serverUrl, roomId }) => {
      console.log('Empfange LiveKit Token, verbinde...', roomId);
      await connectToLiveKit(serverUrl, token, roomId);
    });

    return () => {
      socket.disconnect();
      closeAllConnections();
    };
  }, []);

  // 2. Lokalen Audio-Stream verwalten
  const initLocalStream = async (nsMode: 'off' | 'gate' | 'rnnoise') => {
    try {
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (processedStreamRef.current) {
        processedStreamRef.current.getTracks().forEach((track) => track.stop());
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: echoCancellation,
          noiseSuppression: nsMode !== 'off',
          autoGainControl: autoGainControl,
          channelCount: 1,
          sampleRate: 48000,
          voiceIsolation: nsMode !== 'off'
        } as any,
        video: false
      });

      localStreamRef.current = stream;

      if (isMuted) {
        stream.getAudioTracks().forEach((track) => (track.enabled = false));
      }

      await setupSpeakingDetector(stream, nsMode);

      const streamToSend = processedStreamRef.current || stream;
      const newTrack = streamToSend.getAudioTracks()[0];

      if (livekitRoomRef.current && livekitRoomRef.current.state === 'connected') {
        const room = livekitRoomRef.current;
        const pubs = Array.from(room.localParticipant.audioTrackPublications.values());
        for (const pub of pubs) {
          await room.localParticipant.unpublishTrack(pub.track!);
        }
        if (newTrack) {
          const localTrack = createLocalAudioTrack(newTrack);
          await room.localParticipant.publishTrack(localTrack);
        }
      }
    } catch (err) {
      console.error('Zugriff auf Mikrofon fehlgeschlagen:', err);
    }
  };

  const setupSpeakingDetector = async (stream: MediaStream, nsMode: 'off' | 'gate' | 'rnnoise') => {
    if (speechIntervalRef.current) clearInterval(speechIntervalRef.current);
    
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const audioCtx = new AudioContextClass();
      audioContextRef.current = audioCtx;
      
      const source = audioCtx.createMediaStreamSource(stream);
      localSourceNodeRef.current = source;
      
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 512;
      localAnalyserRef.current = analyser;

      // High-Pass Filter (Tastatur-Filter bei 150Hz)
      const hpf = audioCtx.createBiquadFilter();
      hpf.type = 'highpass';
      hpf.frequency.setValueAtTime(150, audioCtx.currentTime);

      // Noise Gate Nodes erstellen
      const gainNode = audioCtx.createGain();
      localGainNodeRef.current = gainNode;
      const destinationNode = audioCtx.createMediaStreamDestination();
      destinationNodeRef.current = destinationNode;
      
      // Verbindungen aufbauen
      source.connect(analyser); // Analysiert den rohen Mikrofonton

      let currentNode: AudioNode = source;

      // Dynamic WebAssembly RNNoise Load & Integration
      if (nsMode === 'rnnoise') {
        try {
          if (!rnnoiseBinaryRef.current) {
            console.log("Lade RNNoise WASM von:", rnnoiseWasmPath);
            rnnoiseBinaryRef.current = await loadRnnoise({ url: rnnoiseWasmPath, simdUrl: rnnoiseSimdPath });
          }
          if (!rnnoiseWorkletLoadedRef.current) {
            console.log("Registriere RNNoise Worklet von:", rnnoiseWorkletPath);
            await audioCtx.audioWorklet.addModule(rnnoiseWorkletPath);
            rnnoiseWorkletLoadedRef.current = true;
          }

          const rnnoiseNode = new RnnoiseWorkletNode(audioCtx, {
            wasmBinary: rnnoiseBinaryRef.current,
            maxChannels: 1
          });
          currentNode.connect(rnnoiseNode);
          currentNode = rnnoiseNode;
          console.log("RNNoise WASM erfolgreich in Audio-Pfad eingebunden.");
        } catch (wasmErr) {
          console.error("Fehler beim Initialisieren der WASM Noise Suppression:", wasmErr);
        }
      }

      if (keyboardFilter) {
        currentNode.connect(hpf);
        currentNode = hpf;
      }

      // Profile Nodes erstellen (Compressor / Equalizer)
      let compressorNode = null;
      let eqLowNode = null;
      let eqHighNode = null;
      let eqMidNode = null;

      if (audioProfile === 'studio') {
        try {
          compressorNode = audioCtx.createDynamicsCompressor();
          compressorNode.threshold.setValueAtTime(-20, audioCtx.currentTime);
          compressorNode.knee.setValueAtTime(25, audioCtx.currentTime);
          compressorNode.ratio.setValueAtTime(3.0, audioCtx.currentTime);
          compressorNode.attack.setValueAtTime(0.005, audioCtx.currentTime);
          compressorNode.release.setValueAtTime(0.15, audioCtx.currentTime);
        } catch (compErr) {
          console.error("Fehler beim Erstellen des DynamicsCompressors:", compErr);
        }

        try {
          eqLowNode = audioCtx.createBiquadFilter();
          eqLowNode.type = 'lowshelf';
          eqLowNode.frequency.setValueAtTime(120, audioCtx.currentTime);
          eqLowNode.gain.setValueAtTime(4.5, audioCtx.currentTime);
        } catch (eqErr) {
          console.error("Fehler beim Erstellen des Low-Shelf Filters:", eqErr);
        }

        try {
          eqHighNode = audioCtx.createBiquadFilter();
          eqHighNode.type = 'highshelf';
          eqHighNode.frequency.setValueAtTime(6000, audioCtx.currentTime);
          eqHighNode.gain.setValueAtTime(3.0, audioCtx.currentTime);
        } catch (eqErr) {
          console.error("Fehler beim Erstellen des High-Shelf Filters:", eqErr);
        }
      } else if (audioProfile === 'clear') {
        try {
          compressorNode = audioCtx.createDynamicsCompressor();
          compressorNode.threshold.setValueAtTime(-18, audioCtx.currentTime);
          compressorNode.knee.setValueAtTime(15, audioCtx.currentTime);
          compressorNode.ratio.setValueAtTime(4.0, audioCtx.currentTime);
          compressorNode.attack.setValueAtTime(0.003, audioCtx.currentTime);
          compressorNode.release.setValueAtTime(0.1, audioCtx.currentTime);
        } catch (compErr) {
          console.error("Fehler beim Erstellen des DynamicsCompressors:", compErr);
        }

        try {
          eqMidNode = audioCtx.createBiquadFilter();
          eqMidNode.type = 'peaking';
          eqMidNode.frequency.setValueAtTime(2200, audioCtx.currentTime);
          eqMidNode.Q.setValueAtTime(1.0, audioCtx.currentTime);
          eqMidNode.gain.setValueAtTime(3.5, audioCtx.currentTime);
        } catch (eqErr) {
          console.error("Fehler beim Erstellen des Peaking Filters:", eqErr);
        }

        try {
          eqLowNode = audioCtx.createBiquadFilter();
          eqLowNode.type = 'highpass';
          eqLowNode.frequency.setValueAtTime(200, audioCtx.currentTime);
        } catch (eqErr) {
          console.error("Fehler beim Erstellen des Highpass Filters:", eqErr);
        }
      }

      // Profile Nodes verbinden
      if (compressorNode) {
        currentNode.connect(compressorNode);
        currentNode = compressorNode;
      }
      if (eqLowNode) {
        currentNode.connect(eqLowNode);
        currentNode = eqLowNode;
      }
      if (eqMidNode) {
        currentNode.connect(eqMidNode);
        currentNode = eqMidNode;
      }
      if (eqHighNode) {
        currentNode.connect(eqHighNode);
        currentNode = eqHighNode;
      }

      currentNode.connect(gainNode);
      gainNode.connect(destinationNode);
      
      processedStreamRef.current = destinationNode.stream;

      if (selfHearing) {
        gainNode.connect(audioCtx.destination);
      }

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      speechIntervalRef.current = window.setInterval(() => {
        if (isMuted) {
          setLocalSpeaking(false);
          if (localGainNodeRef.current && audioCtx.state !== 'closed') {
            localGainNodeRef.current.gain.setTargetAtTime(0.0, audioCtx.currentTime, 0.01);
          }
          return;
        }
        
        analyser.getByteFrequencyData(dataArray);
        let total = 0;
        for (let i = 0; i < bufferLength; i++) {
          total += dataArray[i];
        }
        const average = total / bufferLength;

        if (activationModeRef.current === 'vad') {
          const currentThreshold = noiseThresholdRef.current;
          const isSpeaking = average > currentThreshold;
          setLocalSpeaking(isSpeaking);

          if (localGainNodeRef.current && audioCtx.state !== 'closed') {
            if (isSpeaking) {
              localGainNodeRef.current.gain.setTargetAtTime(1.0, audioCtx.currentTime, 0.01);
            } else {
              localGainNodeRef.current.gain.setTargetAtTime(0.0, audioCtx.currentTime, 0.05);
            }
          }
        } else {
          // In PTT mode, speaking state is controlled directly by key listeners
          setLocalSpeaking(isPTTPressedRef.current);
        }
      }, 50);
    } catch (e) {
      console.warn('AudioContext konnte nicht initialisiert werden:', e);
    }
  };

  const closeAllConnections = () => {
    if (livekitRoomRef.current) {
      livekitRoomRef.current.disconnect();
      livekitRoomRef.current = null;
    }

    setRemoteStreams([]);
    
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }

    if (processedStreamRef.current) {
      processedStreamRef.current.getTracks().forEach((track) => track.stop());
      processedStreamRef.current = null;
    }

    if (localScreenStreamRef.current) {
      localScreenStreamRef.current.getTracks().forEach((track) => track.stop());
      localScreenStreamRef.current = null;
    }
    setLocalScreenStream(null);
    screenSendersRef.current = {};

    if (localCameraStreamRef.current) {
      localCameraStreamRef.current.getTracks().forEach((track) => track.stop());
      localCameraStreamRef.current = null;
    }
    setLocalCameraStream(null);
    cameraSendersRef.current = {};

    if (speechIntervalRef.current) {
      clearInterval(speechIntervalRef.current);
      speechIntervalRef.current = null;
    }

    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close();
    }

    localGainNodeRef.current = null;
    localAnalyserRef.current = null;
    localSourceNodeRef.current = null;
  };

  // --- ACCOUNT ACTIONS ---

  const createAccount = (chosenRole: string, password?: string) => {
    if (socketRef.current) {
      socketRef.current.emit('create-account', { role: chosenRole, password });
    }
  };

  const loginWithKey = (key: string, password?: string, token?: string) => {
    if (socketRef.current && key.trim()) {
      socketRef.current.emit('login-account', { accountKey: key.trim(), password, token });
    }
  };

  const loginWithLdap = (user: string, pass: string) => {
    if (socketRef.current && user.trim() && pass) {
      socketRef.current.emit('login-ldap', { username: user.trim(), password: pass });
    }
  };

  const logout = () => {
    leaveRoom();
    localStorage.removeItem('voicechat-account-key');
    setUsername('');
    setRole('guest');
    setAccountKey(null);
    setAvatar(null);
    setTwoFactorEnabled(false);
    setHasPassword(false);
    setHasPasskeys(false);
    setTemp2faSecret(null);
    setIs2faRequired(false);
    setIsLoggedIn(false);
    setAdminUsersList([]);
    setOnlineUsers([]);
  };

  const setPassword = (password: string) => {
    if (socketRef.current) {
      socketRef.current.emit('set-password', { password });
    }
  };

  const setup2FAStart = () => {
    if (socketRef.current) {
      socketRef.current.emit('setup-2fa-start');
    }
  };

  const verify2FA = (token: string) => {
    if (socketRef.current) {
      socketRef.current.emit('setup-2fa-verify', { token });
    }
  };

  const disable2FA = () => {
    if (socketRef.current) {
      socketRef.current.emit('disable-2fa');
    }
  };

  const registerPasskey = () => {
    if (socketRef.current) {
      socketRef.current.emit('register-passkey-start', { hostname: window.location.hostname });
    }
  };

  const loginWithPasskey = (key: string) => {
    if (socketRef.current && key.trim()) {
      socketRef.current.emit('login-passkey-start', { accountKey: key.trim(), hostname: window.location.hostname });
    }
  };

  const deleteOwnAccount = () => {
    if (socketRef.current) {
      socketRef.current.emit('delete-own-account');
    }
  };

  // --- NICKNAME ACTIONS ---

  const changeNickname = (newNickname: string) => {
    if (socketRef.current && newNickname.trim()) {
      socketRef.current.emit('change-nickname', { nickname: newNickname.trim() });
    }
  };

  const updateAvatar = (base64: string | null) => {
    if (socketRef.current) {
      socketRef.current.emit('update-avatar', { avatar: base64 });
    }
  };

  // --- ADMIN LIVE ACTIONS ---

  const changeUserRole = (targetSocketId: string, newRole: string) => {
    if (socketRef.current && role === 'admin') {
      socketRef.current.emit('change-user-role', { targetSocketId, newRole });
    }
  };

  const changeUserNickname = (targetSocketId: string, newNickname: string) => {
    if (socketRef.current && role === 'admin') {
      socketRef.current.emit('change-user-nickname', { targetSocketId, newNickname });
    }
  };

  const changeChannelPermission = (channelType: 'voice' | 'text', channelId: string, newMinRole: string) => {
    if (socketRef.current && role === 'admin') {
      socketRef.current.emit('change-channel-permission', { channelType, channelId, newMinRole });
    }
  };

  // --- ROOM & CHAT ACTIONS ---

  const joinRoom = async (roomId: string) => {
    if (!socketRef.current) return;
    setJoinedRoomId(roomId);
    await initLocalStream(noiseSuppressionMode);
    socketRef.current.emit('join-room', {
      roomId,
      username,
      role
    });
  };

  const leaveRoom = () => {
    if (socketRef.current) {
      socketRef.current.emit('leave-room');
    }
    closeAllConnections();
    setJoinedRoomId(null);
  };

  const joinTextChannel = (channelId: string) => {
    if (socketRef.current) {
      setCurrentTextRoomId(channelId);
      socketRef.current.emit('join-text-channel', { channelId });
    }
  };

  const createTextChannel = (name: string, minRole: string) => {
    if (socketRef.current) {
      socketRef.current.emit('create-text-channel', {
        name,
        minRole,
        creatorRole: role
      });
    }
  };

  const createChannel = (name: string, minRole: string) => {
    if (socketRef.current) {
      socketRef.current.emit('create-channel', {
        name,
        minRole,
        creatorRole: role
      });
    }
  };

  const toggleMute = () => {
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    playNotificationSound(nextMuted ? 'mute' : 'unmute');
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach((track) => {
        track.enabled = !nextMuted;
      });
    }
  };

  const toggleNoiseSuppression = () => {
    const nextMode = noiseSuppressionMode === 'off' ? 'gate' : noiseSuppressionMode === 'gate' ? 'rnnoise' : 'off';
    setNoiseSuppressionMode(nextMode);
    if (joinedRoomId) {
      initLocalStream(nextMode);
    }
  };

  const toggleSelfHearing = () => {
    const nextSelfHearing = !selfHearing;
    setSelfHearing(nextSelfHearing);

    if (audioContextRef.current && localGainNodeRef.current) {
      if (nextSelfHearing) {
        localGainNodeRef.current.connect(audioContextRef.current.destination);
      } else {
        try {
          localGainNodeRef.current.disconnect(audioContextRef.current.destination);
        } catch (e) {
          console.warn('Fehler beim Deaktivieren des Echomodus:', e);
        }
      }
    }
  };

  const sendChatMessage = (text: string) => {
    if (socketRef.current && text.trim()) {
      socketRef.current.emit('chat-message', {
        text,
        username,
        role,
        channelId: currentTextRoomId
      });
    }
  };

  const sendPrivateMessage = (partnerUsername: string, text: string) => {
    if (!socketRef.current || !text.trim()) return;
    socketRef.current.emit('private-message', {
      receiverUsername: partnerUsername,
      text: text.trim()
    });
  };

  const startScreenShare = async () => {
    if (!joinedRoomId) return;
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      localScreenStreamRef.current = stream;
      setLocalScreenStream(stream);

      const videoTrack = stream.getVideoTracks()[0];
      
      // Falls der Nutzer die Freigabe ueber das Browser-Overlay beendet
      videoTrack.onended = () => {
        stopScreenShare();
      };

      // Screen Audio-Mixer Bypass: Screen-Audiospur direkt an Destination anschließen
      const audioTracks = stream.getAudioTracks();
      if (audioTracks.length > 0) {
        const audioCtx = audioContextRef.current;
        const destNode = destinationNodeRef.current;
        if (audioCtx && destNode) {
          const screenAudioStream = new MediaStream([audioTracks[0]]);
          const screenAudioSource = audioCtx.createMediaStreamSource(screenAudioStream);
          screenAudioSource.connect(destNode);
          screenAudioSourceNodeRef.current = screenAudioSource;
          console.log("Screen Share Audio erfolgreich an Web-Audio Destination angeschlossen (Bypass).");
        }
      }

      if (livekitRoomRef.current && livekitRoomRef.current.state === 'connected') {
        await livekitRoomRef.current.localParticipant.publishTrack(videoTrack, { name: 'screen' });
      }
    } catch (err) {
      console.error('Fehler beim Starten der Bildschirmuebertragung:', err);
    }
  };

  const stopScreenShare = async () => {
    if (screenAudioSourceNodeRef.current) {
      try {
        screenAudioSourceNodeRef.current.disconnect();
      } catch (e) {
        console.warn('Fehler beim Trennen der Screen-Audiospur:', e);
      }
      screenAudioSourceNodeRef.current = null;
    }

    if (livekitRoomRef.current && livekitRoomRef.current.state === 'connected') {
      const pubs = Array.from(livekitRoomRef.current.localParticipant.videoTrackPublications.values());
      for (const pub of pubs) {
        if (pub.source === 'screen_share' || pub.trackName === 'screen') {
          await livekitRoomRef.current.localParticipant.unpublishTrack(pub.track!);
        }
      }
    }

    if (localScreenStreamRef.current) {
      localScreenStreamRef.current.getTracks().forEach((track) => track.stop());
      localScreenStreamRef.current = null;
    }
    setLocalScreenStream(null);
  };

  const startCamera = async () => {
    if (!joinedRoomId) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, frameRate: 24 },
        audio: false
      });
      localCameraStreamRef.current = stream;
      setLocalCameraStream(stream);

      const videoTrack = stream.getVideoTracks()[0];
      
      videoTrack.onended = () => {
        stopCamera();
      };

      if (livekitRoomRef.current && livekitRoomRef.current.state === 'connected') {
        await livekitRoomRef.current.localParticipant.publishTrack(videoTrack, { name: 'camera' });
      }
    } catch (err) {
      console.error('Fehler beim Starten der Kamera:', err);
    }
  };

  const stopCamera = async () => {
    if (livekitRoomRef.current && livekitRoomRef.current.state === 'connected') {
      const pubs = Array.from(livekitRoomRef.current.localParticipant.videoTrackPublications.values());
      for (const pub of pubs) {
        if (pub.source === 'camera' || pub.trackName === 'camera') {
          await livekitRoomRef.current.unpublishTrack(pub.track!);
        }
      }
    }

    if (localCameraStreamRef.current) {
      localCameraStreamRef.current.getTracks().forEach((track) => track.stop());
      localCameraStreamRef.current = null;
    }
    setLocalCameraStream(null);
  };

  const toggleReaction = (channelId: string, messageId: string, emoji: string) => {
    if (socketRef.current) {
      socketRef.current.emit('toggle-reaction', { channelId, messageId, emoji });
    }
  };

  const togglePrivateReaction = (messageId: string, emoji: string, partnerUsername: string) => {
    if (socketRef.current) {
      socketRef.current.emit('toggle-private-reaction', { messageId, emoji, partnerUsername });
    }
  };

  const createRole = (name: string, color: string, canManageRoles: boolean, canManageChannels: boolean, canManageUsers: boolean) => {
    if (socketRef.current) {
      socketRef.current.emit('create-role', { name, color, canManageRoles, canManageChannels, canManageUsers });
    }
  };

  const updateRole = (name: string, color: string, canManageRoles: boolean, canManageChannels: boolean, canManageUsers: boolean) => {
    if (socketRef.current) {
      socketRef.current.emit('update-role', { name, color, canManageRoles, canManageChannels, canManageUsers });
    }
  };

  const deleteRole = (name: string) => {
    if (socketRef.current) {
      socketRef.current.emit('delete-role', { name });
    }
  };

  const searchPrivateMessages = (partnerUsername: string, query: string) => {
    if (socketRef.current && partnerUsername && query.trim()) {
      socketRef.current.emit('search-private-messages', { partnerUsername, query: query.trim() });
    }
  };

  const clearSearchResults = () => {
    setSearchResults([]);
  };

  const changeServerUrl = (url: string) => {
    const clean = url.trim();
    if (clean) {
      localStorage.setItem('shirasal-server-url', clean);
    } else {
      localStorage.removeItem('shirasal-server-url');
    }
    window.location.reload();
  };

  const hasPermission = (permission: 'canManageRoles' | 'canManageChannels' | 'canManageUsers') => {
    if (role === 'admin') return true;
    const rInfo = roles.find(r => r.name === role);
    return rInfo ? !!rInfo[permission] : false;
  };

  return {
    username,
    role,
    avatar,
    updateAvatar,
    accountKey,
    isLoggedIn,
    allowDemoRoles,
    channels,
    textChannels,
    chatMessages,
    joinedRoomId,
    currentTextRoomId,
    localStream: localStreamRef.current,
    remoteStreams,
    adminUsersList,
    onlineUsers,
    isMuted,
    activationMode,
    setActivationMode,
    pttKey,
    setPttKey,
    isPTTPressed,
    noiseSuppressionMode,
    setNoiseSuppressionMode,
    selfHearing,
    localSpeaking,
    createAccount,
    loginWithKey,
    loginWithLdap,
    logout,
    changeNickname,
    changeUserRole,
    changeUserNickname,
    changeChannelPermission,
    toggleMute,
    toggleNoiseSuppression,
    toggleSelfHearing,
    sendChatMessage,
    sendPrivateMessage,
    privateChats,
    activePrivatePartner,
    setActivePrivatePartner,
    unreadDMs,
    setUnreadDMs,
    allUsers,
    noiseThreshold,
    setNoiseThreshold,
    echoCancellation,
    setEchoCancellation,
    autoGainControl,
    setAutoGainControl,
    keyboardFilter,
    setKeyboardFilter,
    audioProfile,
    setAudioProfile,
    localScreenStream,
    startScreenShare,
    stopScreenShare,
    localCameraStream,
    startCamera,
    stopCamera,
    createChannel,
    createTextChannel,
    joinRoom,
    leaveRoom,
    joinTextChannel,
    localAnalyser: localAnalyserRef.current,
    roles,
    searchResults,
    toggleReaction,
    togglePrivateReaction,
    createRole,
    updateRole,
    deleteRole,
    searchPrivateMessages,
    clearSearchResults,
    hasPermission,
    serverUrl,
    changeServerUrl,
    socket: socketRef.current,
    
    // Security states & functions
    twoFactorEnabled,
    hasPassword,
    hasPasskeys,
    temp2faSecret,
    setTemp2faSecret,
    is2faRequired,
    setIs2faRequired,
    setPassword,
    setup2FAStart,
    verify2FA,
    disable2FA,
    registerPasskey,
    loginWithPasskey,
    deleteOwnAccount
  };
};
