import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';

const SOCKET_URL = 'http://localhost:3001';

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
}

interface Channel {
  id: string;
  name: string;
  minRole: string;
}

const optimizeOpus = (sdp: string): string => {
  if (!sdp) return sdp;
  return sdp.replace('useinbandfec=1', 'useinbandfec=1;maxaveragebitrate=128000;stereo=1;usedtx=0');
};

export const useWebRTC = () => {
  // Benutzeridentität
  const [username, setUsername] = useState('');
  const [role, setRole] = useState('guest');
  const [accountKey, setAccountKey] = useState<string | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  // Kanal-Listen
  const [channels, setChannels] = useState<Channel[]>([]);
  const [textChannels, setTextChannels] = useState<Channel[]>([]);
  const [joinedRoomId, setJoinedRoomId] = useState<string | null>(null);
  const [currentTextRoomId, setCurrentTextRoomId] = useState<string>('general');

  // Chatnachrichten für den aktiven Kanal
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);

  // Remote-Teilnehmer (Sprache) & Admintools
  const [remoteStreams, setRemoteStreams] = useState<RemoteStreamInfo[]>([]);
  const [adminUsersList, setAdminUsersList] = useState<any[]>([]); // Ausführliche Liste für Admins
  const [onlineUsers, setOnlineUsers] = useState<Array<{ socketId: string; username: string; role: string }>>([]); // Vereinfachte Liste für Laufband
  const [allUsers, setAllUsers] = useState<Array<{ username: string; role: string; online: boolean; socketId: string | null }>>([]); // Alle Kontakte

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

  // Advanced Audio Einstellungen
  const [echoCancellation, setEchoCancellation] = useState(true);
  const [autoGainControl, setAutoGainControl] = useState(true);
  const [keyboardFilter, setKeyboardFilter] = useState(true);

  // Trigger Re-init of local stream if constraints change
  useEffect(() => {
    if (joinedRoomId) {
      initLocalStream(noiseSuppression);
    }
  }, [echoCancellation, autoGainControl, keyboardFilter]);

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
  const [noiseSuppression, setNoiseSuppression] = useState(true);
  const [selfHearing, setSelfHearing] = useState(false);
  const [localSpeaking, setLocalSpeaking] = useState(false);

  const socketRef = useRef<Socket | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const processedStreamRef = useRef<MediaStream | null>(null);
  const localGainNodeRef = useRef<GainNode | null>(null);
  const peerConnectionsRef = useRef<{ [socketId: string]: RTCPeerConnection }>({});
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
  const cameraSendersRef = useRef<{ [socketId: string]: RTCRtpSender }>({});

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

    socket.on('online-users-list', (list: Array<{ socketId: string; username: string; role: string }>) => {
      setOnlineUsers(list);
    });

    socket.on('all-users-list', (list: Array<{ username: string; role: string; online: boolean; socketId: string | null }>) => {
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
          timestamp: msg.timestamp
        });
      });
      setPrivateChats(chats);
    });

    socket.on('private-message', (payload: any) => {
      const { senderUsername, receiverUsername, senderRole, text, timestamp, id } = payload;
      const currentUsername = usernameRef.current;
      const partner = senderUsername === currentUsername ? receiverUsername : senderUsername;
      
      const newMsg: ChatMessage = {
        id,
        username: senderUsername,
        role: senderRole || 'guest',
        text,
        timestamp
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
    socket.on('account-created', ({ username: u, role: r, accountKey: k }) => {
      setUsername(u);
      setRole(r);
      setAccountKey(k);
      setIsLoggedIn(true);
      localStorage.setItem('voicechat-account-key', k);
      
      socket.emit('join-text-channel', { channelId: 'general' });
    });

    socket.on('login-success', ({ username: u, role: r, accountKey: k }) => {
      setUsername(u);
      setRole(r);
      setAccountKey(k);
      setIsLoggedIn(true);
      localStorage.setItem('voicechat-account-key', k);

      socket.emit('join-text-channel', { channelId: 'general' });
    });

    socket.on('login-error', (msg: string) => {
      alert(`Login fehlgeschlagen: ${msg}`);
      localStorage.removeItem('voicechat-account-key');
    });

    // --- WebRTC Connectors ---
    socket.on('user-joined', async ({ socketId, username: peerName, role: peerRole }: Participant) => {
      console.log(`Neuer Peer beigetreten: ${peerName} (${socketId})`);
      const pc = createPeerConnection(socketId, peerName, peerRole);
      
      const streamToSend = processedStreamRef.current || localStreamRef.current;
      if (streamToSend) {
        streamToSend.getAudioTracks().forEach((track) => {
          pc.addTrack(track, streamToSend!);
        });
      }

      // Falls wir bereits den Bildschirm teilen, fügen wir den Video-Track direkt hinzu
      if (localScreenStreamRef.current) {
        const videoTrack = localScreenStreamRef.current.getVideoTracks()[0];
        if (videoTrack) {
          const sender = pc.addTrack(videoTrack, localScreenStreamRef.current);
          screenSendersRef.current[socketId] = sender;
        }
      }

      // Falls wir bereits die Kamera aktiviert haben, fügen wir den Video-Track direkt hinzu
      if (localCameraStreamRef.current) {
        const videoTrack = localCameraStreamRef.current.getVideoTracks()[0];
        if (videoTrack) {
          const sender = pc.addTrack(videoTrack, localCameraStreamRef.current);
          cameraSendersRef.current[socketId] = sender;
        }
      }

      try {
        const offer = await pc.createOffer({ offerToReceiveAudio: true });
        const optimizedSdp = optimizeOpus(offer.sdp || '');
        const optimizedOffer = { type: offer.type, sdp: optimizedSdp } as RTCSessionDescriptionInit;
        await pc.setLocalDescription(optimizedOffer);
        socket.emit('webrtc-signal', {
          targetId: socketId,
          signal: { type: 'offer', sdp: pc.localDescription }
        });
      } catch (err) {
        console.error('Fehler beim Erstellen des WebRTC Offers:', err);
      }
    });

    socket.on('webrtc-signal', async ({ senderId, signal }) => {
      let pc = peerConnectionsRef.current[senderId];

      if (signal.sdp) {
        if (!pc) {
          const peer = remoteStreams.find(p => p.socketId === senderId);
          pc = createPeerConnection(senderId, peer?.username || 'User', peer?.role || 'guest');
          
          const streamToSend = processedStreamRef.current || localStreamRef.current;
          if (streamToSend) {
            streamToSend.getAudioTracks().forEach((track) => {
              pc.addTrack(track, streamToSend!);
            });
          }
        }

        await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));

        if (signal.sdp.type === 'offer') {
          try {
            const answer = await pc.createAnswer();
            const optimizedSdp = optimizeOpus(answer.sdp || '');
            const optimizedAnswer = { type: answer.type, sdp: optimizedSdp } as RTCSessionDescriptionInit;
            await pc.setLocalDescription(optimizedAnswer);
            socket.emit('webrtc-signal', {
              targetId: senderId,
              signal: { type: 'answer', sdp: pc.localDescription }
            });
          } catch (err) {
            console.error('Fehler beim Erstellen der WebRTC Answer:', err);
          }
        }
      } else if (signal.candidate) {
        if (pc) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
          } catch (err) {
            console.error('Fehler beim Hinzufügen des ICE-Kandidaten:', err);
          }
        }
      }
    });

    socket.on('room-participants', (participants: Participant[]) => {
      participants.forEach((p) => {
        const pc = createPeerConnection(p.socketId, p.username, p.role);
        const streamToSend = processedStreamRef.current || localStreamRef.current;
        if (streamToSend) {
          streamToSend.getAudioTracks().forEach((track) => {
            pc.addTrack(track, streamToSend!);
          });
        }

        // Falls wir bereits den Bildschirm teilen, fügen wir den Video-Track direkt hinzu
        if (localScreenStreamRef.current) {
          const videoTrack = localScreenStreamRef.current.getVideoTracks()[0];
          if (videoTrack) {
            const sender = pc.addTrack(videoTrack, localScreenStreamRef.current);
            screenSendersRef.current[p.socketId] = sender;
          }
        }

        // Falls wir bereits die Kamera aktiviert haben, fügen wir den Video-Track direkt hinzu
        if (localCameraStreamRef.current) {
          const videoTrack = localCameraStreamRef.current.getVideoTracks()[0];
          if (videoTrack) {
            const sender = pc.addTrack(videoTrack, localCameraStreamRef.current);
            cameraSendersRef.current[p.socketId] = sender;
          }
        }
      });
    });

    socket.on('user-left', ({ socketId }) => {
      closePeer(socketId);
    });

    return () => {
      socket.disconnect();
      closeAllConnections();
    };
  }, []);

  // 2. Lokalen Audio-Stream verwalten
  const initLocalStream = async (suppressNoise: boolean) => {
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
          noiseSuppression: suppressNoise,
          autoGainControl: autoGainControl,
          channelCount: 1,
          sampleRate: 48000,
          voiceIsolation: suppressNoise
        } as any,
        video: false
      });

      localStreamRef.current = stream;

      if (isMuted) {
        stream.getAudioTracks().forEach((track) => (track.enabled = false));
      }

      setupSpeakingDetector(stream);

      const streamToSend = processedStreamRef.current || stream;
      const newTrack = streamToSend.getAudioTracks()[0];
      for (const socketId in peerConnectionsRef.current) {
        const pc = peerConnectionsRef.current[socketId];
        const senders = pc.getSenders();
        const sender = senders.find((s) => s.track && s.track.kind === 'audio');
        if (sender && newTrack) {
          await sender.replaceTrack(newTrack);
        }
      }
    } catch (err) {
      console.error('Zugriff auf Mikrofon fehlgeschlagen:', err);
    }
  };

  const setupSpeakingDetector = (stream: MediaStream) => {
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
      
      // Verbindungen aufbauen
      source.connect(analyser); // Analysiert den rohen Mikrofonton
      if (keyboardFilter) {
        source.connect(hpf);
        hpf.connect(gainNode);
      } else {
        source.connect(gainNode);
      }
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
        
        const currentThreshold = noiseThresholdRef.current;
        const isSpeaking = average > currentThreshold;
        setLocalSpeaking(isSpeaking);

        if (localGainNodeRef.current && audioCtx.state !== 'closed') {
          if (isSpeaking) {
            // Tor öffnen mit extrem schneller Rampe
            localGainNodeRef.current.gain.setTargetAtTime(1.0, audioCtx.currentTime, 0.01);
          } else {
            // Tor sanft schließen nach kurzer Hold-Zeit
            localGainNodeRef.current.gain.setTargetAtTime(0.0, audioCtx.currentTime, 0.05);
          }
        }
      }, 50);
    } catch (e) {
      console.warn('AudioContext konnte nicht initialisiert werden:', e);
    }
  };

  const createPeerConnection = (socketId: string, peerName: string, peerRole: string) => {
    const pc = new RTCPeerConnection(rtcConfig);
    peerConnectionsRef.current[socketId] = pc;

    pc.onicecandidate = (event) => {
      if (event.candidate && socketRef.current) {
        socketRef.current.emit('webrtc-signal', {
          targetId: socketId,
          signal: { candidate: event.candidate }
        });
      }
    };

    pc.ontrack = (event) => {
      const remoteStream = event.streams[0] || new MediaStream([event.track]);

      setRemoteStreams((prev) => {
        const exists = prev.some((p) => p.socketId === socketId);
        if (exists) {
          return prev.map((p) => {
            if (p.socketId === socketId) {
              if (event.track.kind === 'video') {
                const label = event.track.label.toLowerCase();
                const isScreen = label.includes('screen') || label.includes('window') || label.includes('display') || label.includes('monitor');
                if (isScreen) {
                  return { ...p, videoStream: remoteStream };
                } else {
                  return { ...p, cameraStream: remoteStream };
                }
              } else {
                return { ...p, stream: remoteStream };
              }
            }
            return p;
          });
        }

        const label = event.track.label.toLowerCase();
        const isScreen = label.includes('screen') || label.includes('window') || label.includes('display') || label.includes('monitor');
        return [
          ...prev,
          {
            socketId,
            username: peerName,
            role: peerRole,
            stream: event.track.kind === 'audio' ? remoteStream : new MediaStream(),
            videoStream: (event.track.kind === 'video' && isScreen) ? remoteStream : undefined,
            cameraStream: (event.track.kind === 'video' && !isScreen) ? remoteStream : undefined,
            isSpeaking: false,
            audioActive: true
          }
        ];
      });

      if (event.track.kind === 'video') {
        event.track.onended = () => {
          setRemoteStreams((prev) =>
            prev.map((p) => {
              if (p.socketId === socketId) {
                const label = event.track.label.toLowerCase();
                const isScreen = label.includes('screen') || label.includes('window') || label.includes('display') || label.includes('monitor');
                if (isScreen) {
                  return { ...p, videoStream: undefined };
                } else {
                  return { ...p, cameraStream: undefined };
                }
              }
              return p;
            })
          );
        };
      }

      if (event.track.kind === 'audio') {
        monitorRemoteSpeaking(socketId, remoteStream);
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        closePeer(socketId);
      }
    };

    return pc;
  };

  const monitorRemoteSpeaking = (socketId: string, stream: MediaStream) => {
    try {
      if (!audioContextRef.current) return;
      const ctx = audioContextRef.current;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      const interval = setInterval(() => {
        if (!peerConnectionsRef.current[socketId]) {
          clearInterval(interval);
          return;
        }

        analyser.getByteFrequencyData(dataArray);
        let total = 0;
        for (let i = 0; i < bufferLength; i++) {
          total += dataArray[i];
        }
        const average = total / bufferLength;
        const isSpeaking = average > 20;

        setRemoteStreams((prev) =>
          prev.map((p) => (p.socketId === socketId ? { ...p, isSpeaking } : p))
        );
      }, 100);
    } catch (e) {
      console.warn('Fehler bei Remote-Spracherkennung:', e);
    }
  };

  const closePeer = (socketId: string) => {
    if (peerConnectionsRef.current[socketId]) {
      peerConnectionsRef.current[socketId].close();
      delete peerConnectionsRef.current[socketId];
    }
    delete screenSendersRef.current[socketId];
    delete cameraSendersRef.current[socketId];
    setRemoteStreams((prev) => prev.filter((p) => p.socketId !== socketId));
  };

  const closeAllConnections = () => {
    Object.keys(peerConnectionsRef.current).forEach((id) => {
      peerConnectionsRef.current[id].close();
    });
    peerConnectionsRef.current = {};
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

  const createAccount = (chosenRole: string) => {
    if (socketRef.current) {
      socketRef.current.emit('create-account', { role: chosenRole });
    }
  };

  const loginWithKey = (key: string) => {
    if (socketRef.current && key.trim()) {
      socketRef.current.emit('login-account', { accountKey: key.trim() });
    }
  };

  const logout = () => {
    leaveRoom();
    localStorage.removeItem('voicechat-account-key');
    setUsername('');
    setRole('guest');
    setAccountKey(null);
    setIsLoggedIn(false);
    setAdminUsersList([]);
    setOnlineUsers([]);
  };

  // --- NICKNAME ACTIONS ---

  const changeNickname = (newNickname: string) => {
    if (socketRef.current && newNickname.trim()) {
      socketRef.current.emit('change-nickname', { nickname: newNickname.trim() });
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
    await initLocalStream(noiseSuppression);
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
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach((track) => {
        track.enabled = !nextMuted;
      });
    }
  };

  const toggleNoiseSuppression = () => {
    const nextSuppression = !noiseSuppression;
    setNoiseSuppression(nextSuppression);
    if (joinedRoomId) {
      initLocalStream(nextSuppression);
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

  const renegotiatePeer = async (socketId: string) => {
    const pc = peerConnectionsRef.current[socketId];
    if (!pc) return;
    try {
      const offer = await pc.createOffer();
      const optimizedSdp = optimizeOpus(offer.sdp || '');
      await pc.setLocalDescription({ type: offer.type, sdp: optimizedSdp } as RTCSessionDescriptionInit);
      socketRef.current?.emit('webrtc-signal', {
        targetId: socketId,
        signal: { type: 'offer', sdp: pc.localDescription }
      });
    } catch (err) {
      console.error(`Fehler bei der Neuverhandlung fuer Peer ${socketId}:`, err);
    }
  };

  const startScreenShare = async () => {
    if (!joinedRoomId) return;
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      localScreenStreamRef.current = stream;
      setLocalScreenStream(stream);

      const videoTrack = stream.getVideoTracks()[0];
      
      // Falls der Nutzer die Freigabe ueber das Browser-Overlay beendet
      videoTrack.onended = () => {
        stopScreenShare();
      };

      for (const socketId in peerConnectionsRef.current) {
        const pc = peerConnectionsRef.current[socketId];
        const sender = pc.addTrack(videoTrack, stream);
        screenSendersRef.current[socketId] = sender;
        await renegotiatePeer(socketId);
      }
    } catch (err) {
      console.error('Fehler beim Starten der Bildschirmuebertragung:', err);
    }
  };

  const stopScreenShare = async () => {
    for (const socketId in peerConnectionsRef.current) {
      const pc = peerConnectionsRef.current[socketId];
      const sender = screenSendersRef.current[socketId];
      if (sender && pc.signalingState !== 'closed') {
        try {
          pc.removeTrack(sender);
        } catch (e) {
          console.warn('Fehler beim Entfernen des Video-Senders:', e);
        }
      }
      delete screenSendersRef.current[socketId];
      await renegotiatePeer(socketId);
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

      for (const socketId in peerConnectionsRef.current) {
        const pc = peerConnectionsRef.current[socketId];
        const sender = pc.addTrack(videoTrack, stream);
        cameraSendersRef.current[socketId] = sender;
        await renegotiatePeer(socketId);
      }
    } catch (err) {
      console.error('Fehler beim Starten der Kamera:', err);
    }
  };

  const stopCamera = async () => {
    for (const socketId in peerConnectionsRef.current) {
      const pc = peerConnectionsRef.current[socketId];
      const sender = cameraSendersRef.current[socketId];
      if (sender && pc.signalingState !== 'closed') {
        try {
          pc.removeTrack(sender);
        } catch (e) {
          console.warn('Fehler beim Entfernen des Kamera-Senders:', e);
        }
      }
      delete cameraSendersRef.current[socketId];
      await renegotiatePeer(socketId);
    }

    if (localCameraStreamRef.current) {
      localCameraStreamRef.current.getTracks().forEach((track) => track.stop());
      localCameraStreamRef.current = null;
    }
    setLocalCameraStream(null);
  };

  return {
    username,
    role,
    accountKey,
    isLoggedIn,
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
    noiseSuppression,
    selfHearing,
    localSpeaking,
    createAccount,
    loginWithKey,
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
    localAnalyser: localAnalyserRef.current
  };
};
