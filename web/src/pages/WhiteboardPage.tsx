import React, { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Whiteboard from '../components/Whiteboard';
import SpeakingIndicator from '../components/SpeakingIndicator';
import ActionSynchronizer from '../utils/ActionSynchronizer';
import './WhiteboardPage.css';

interface LocationState {
  topicId: string;
  topicName: string;
}

const WhiteboardPage: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { topicId, topicName } = (location.state as LocationState) || { 
    topicId: 'calculus-integration', 
    topicName: 'Calculus: Integration by Substitution' 
  };
  
  const [isConnected, setIsConnected] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [actionQueue, setActionQueue] = useState<string[]>([]);
  const [transcript, setTranscript] = useState<string[]>([]);
  const [isUserSpeaking, setIsUserSpeaking] = useState(false);
  const [currentLesson, setCurrentLesson] = useState<string>('');
  
  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioBufferQueueRef = useRef<Float32Array[]>([]);
  const audioSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const synchronizerRef = useRef<ActionSynchronizer | null>(null);
  
  // Action processing logic
  const handleActionComplete = () => {
    setActionQueue((prev) => prev.slice(1));
  };
  
  // Initialize action synchronizer
  useEffect(() => {
    synchronizerRef.current = new ActionSynchronizer(
      (action: string) => {
        setActionQueue((prev) => [...prev, action]);
      },
      () => {
        console.log('All actions completed');
      }
    );
  }, []);
  
  // Parse AI response and prepare for playback
  const prepareResponsePlayback = (response: string) => {
    setCurrentLesson(response);
    
    // Add to transcript (for display purposes)
    const lines = response.split('\n');
    const formattedLines = lines.map((line) => {
      // Remove action tags for the transcript display
      return line.replace(/(\{[^}]+\})/g, '');
    });
    
    setTranscript((prev) => [...prev, ...formattedLines.filter(line => line.trim())]);
    
    // Parse for synchronized playback
    if (synchronizerRef.current) {
      synchronizerRef.current.loadResponse(response);
      synchronizerRef.current.start();
    }
  };

  // Set up audio playback from buffer queue
  const playNextAudioChunk = () => {
    if (!audioContextRef.current || audioBufferQueueRef.current.length === 0) {
      setIsSpeaking(false);
      return;
    }
    
    setIsSpeaking(true);
    
    // Get next audio chunk
    const audioData = audioBufferQueueRef.current.shift();
    if (!audioData) return;
    
    // Create audio buffer
    const audioBuffer = audioContextRef.current.createBuffer(1, audioData.length, 24000);
    audioBuffer.getChannelData(0).set(audioData);
    
    // Create and play source
    const source = audioContextRef.current.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(audioContextRef.current.destination);
    
    // When this chunk ends, play the next one
    source.onended = () => {
      audioSourceRef.current = null;
      if (audioBufferQueueRef.current.length > 0) {
        playNextAudioChunk();
      } else {
        setIsSpeaking(false);
      }
    };
    
    // Store reference and start playback
    audioSourceRef.current = source;
    source.start();
  };

  // Initialize WebSocket connection
  useEffect(() => {
    const SERVER_WS_URL = process.env.REACT_APP_SERVER_WS_URL || 'ws://localhost:8000';
    
    wsRef.current = new WebSocket(`${SERVER_WS_URL}?topic=${encodeURIComponent(topicName)}`);
    wsRef.current.binaryType = 'arraybuffer';
    
    wsRef.current.onopen = () => {
      console.log('WebSocket connection established');
      setIsConnected(true);
    };
    
    wsRef.current.onmessage = (event) => {
      if (event.data instanceof ArrayBuffer) {
        // Audio data from server
        const float32Array = new Float32Array(event.data);
        
        // Add to audio queue
        audioBufferQueueRef.current.push(float32Array);
        
        // Start playing if not already playing
        if (!audioSourceRef.current && audioContextRef.current) {
          playNextAudioChunk();
        }
      } else {
        // Text message from server
        const message = event.data.toString();
        
        if (message === 'RDY') {
          // Ready to listen
          // Do nothing special here
        } else if (message === 'CLR') {
          // Clear audio buffer request
          audioBufferQueueRef.current = [];
          if (audioSourceRef.current) {
            audioSourceRef.current.stop();
            audioSourceRef.current = null;
          }
          setIsSpeaking(false);
        } else if (!message.startsWith('---')) {
          // Regular message, parse for actions and transcript
          prepareResponsePlayback(message);
        }
      }
    };
    
    wsRef.current.onclose = () => {
      console.log('WebSocket connection closed');
      setIsConnected(false);
    };
    
    wsRef.current.onerror = (error) => {
      console.error('WebSocket error:', error);
    };
    
    // Set up audio context for playback
    audioContextRef.current = new AudioContext({
      sampleRate: 24000,
    });
    
    // Clean up on unmount
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
      
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => {
          track.stop();
        });
      }
      
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
      
      if (synchronizerRef.current) {
        synchronizerRef.current.stop();
      }
    };
  }, [topicName]);
  
  // Start recording
  const startRecording = async () => {
    try {
      // Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      
      // Create audio processor
      if (audioContextRef.current) {
        const source = audioContextRef.current.createMediaStreamSource(stream);
        processorRef.current = audioContextRef.current.createScriptProcessor(1024, 1, 1);
        
        processorRef.current.onaudioprocess = (event) => {
          if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN && isUserSpeaking) {
            wsRef.current.send(event.inputBuffer.getChannelData(0));
          }
        };
        
        source.connect(processorRef.current);
        processorRef.current.connect(audioContextRef.current.destination);
        
        // Set up voice activity detection
        // This is simplified, in a real app you'd use a proper VAD library
        let silenceThreshold = 0.01;
        let silenceFrames = 0;
        let maxSilenceFrames = 30; // ~0.6 seconds of silence
        
        const checkSilence = () => {
          const analyser = audioContextRef.current!.createAnalyser();
          analyser.fftSize = 256;
          source.connect(analyser);
          
          const bufferLength = analyser.frequencyBinCount;
          const dataArray = new Uint8Array(bufferLength);
          
          const detectSilence = () => {
            analyser.getByteFrequencyData(dataArray);
            
            let sum = 0;
            for (let i = 0; i < bufferLength; i++) {
              sum += dataArray[i];
            }
            
            const average = sum / bufferLength / 255;
            
            if (average > silenceThreshold) {
              // User is speaking
              silenceFrames = 0;
              if (!isUserSpeaking) {
                setIsUserSpeaking(true);
                // Send start of speech signal
                if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                  wsRef.current.send('INT'); // Interrupt signal
                }
              }
            } else {
              // Silence detected
              silenceFrames++;
              if (silenceFrames > maxSilenceFrames && isUserSpeaking) {
                setIsUserSpeaking(false);
                // Send end of speech signal
                if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                  wsRef.current.send('EOS'); // End of speech signal
                }
              }
            }
            
            // Continue checking while connected
            if (isConnected) {
              requestAnimationFrame(detectSilence);
            }
          };
          
          detectSilence();
        };
        
        checkSilence();
      }
    } catch (error) {
      console.error('Error accessing microphone:', error);
    }
  };
  
  // Start the session
  useEffect(() => {
    if (isConnected) {
      startRecording();
    }
  }, [isConnected]);
  
  // Handle back button
  const handleBack = () => {
    navigate('/');
  };
  
  return (
    <div className="whiteboard-page">
      <header className="whiteboard-header">
        <button className="back-button" onClick={handleBack}>
          ← Back
        </button>
        <h1>{topicName}</h1>
      </header>
      
      <div className="whiteboard-main-content">
        <Whiteboard
          actionQueue={actionQueue}
          processing={isSpeaking}
          onActionComplete={handleActionComplete}
        />
        
        <SpeakingIndicator isSpeaking={isSpeaking} />
      </div>
      
      <div className={`transcript-panel ${isUserSpeaking ? 'user-speaking' : ''}`}>
        <h3>Session Transcript</h3>
        <div className="transcript-content">
          {transcript.map((line, index) => (
            <p key={index}>{line}</p>
          ))}
          {isUserSpeaking && <p className="user-speaking-indicator">You are speaking...</p>}
        </div>
      </div>
    </div>
  );
};

export default WhiteboardPage;