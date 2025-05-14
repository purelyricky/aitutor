// Fix for WhiteboardPage.tsx to properly handle voice detection and interruption issues

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
  const [aiSpeakingCooldown, setAiSpeakingCooldown] = useState(false);
  const [lessonInProgress, setLessonInProgress] = useState(false);
  const [debugMode] = useState(false); // Set to true to enable debug logging
  
  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioBufferQueueRef = useRef<Float32Array[]>([]);
  const audioSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const synchronizerRef = useRef<ActionSynchronizer | null>(null);
  const userSpeakingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const aiResponseInProgressRef = useRef<boolean>(false);
  const silenceDetectionDisabledRef = useRef<boolean>(false);
  
  // Action processing logic
  const handleActionComplete = () => {
    if (debugMode) console.log("Action completed, removing from queue");
    
    setActionQueue((prev) => {
      if (synchronizerRef.current && prev.length > 0) {
        // Notify the synchronizer that the action is complete
        synchronizerRef.current.notifyActionComplete();
      }
      return prev.slice(1);
    });
  };
  
  // Initialize action synchronizer
  useEffect(() => {
    synchronizerRef.current = new ActionSynchronizer(
      (action: string) => {
        if (debugMode) console.log("Adding action to queue:", action);
        setActionQueue((prev) => [...prev, action]);
      },
      () => {
        if (debugMode) console.log('All actions completed');
        aiResponseInProgressRef.current = false;
        setLessonInProgress(false);
      },
      debugMode // Pass debug mode to synchronizer
    );
    
    return () => {
      if (synchronizerRef.current) {
        synchronizerRef.current.stop();
      }
    };
  }, [debugMode]);
  
  // Parse AI response and prepare for playback
  const prepareResponsePlayback = (response: string) => {
    if (debugMode) console.log("Preparing response for playback:", response.substring(0, 100) + "...");
    
    setCurrentLesson(response);
    aiResponseInProgressRef.current = true;
    setLessonInProgress(true);
    
    // Disable voice detection while processing the response
    silenceDetectionDisabledRef.current = true;
    
    // Add to transcript (for display purposes)
    const lines = response.split('\n');
    const formattedLines = lines
      .filter(line => line.trim()) // Remove empty lines
      .map((line) => {
        // Remove action tags and timestamps for the transcript display
        return line
          .replace(/\[(\d{2}):(\d{2})\]/g, '')
          .replace(/(\{[^}]+\})/g, '')
          .trim();
      })
      .filter(line => line); // Remove any lines that are now empty
    
    setTranscript((prev) => [...prev, ...formattedLines]);
    
    // Parse for synchronized playback
    if (synchronizerRef.current) {
      synchronizerRef.current.loadResponse(response);
      
      // Start synchronizer with a slight delay to allow audio to begin
      setTimeout(() => {
        if (synchronizerRef.current) {
          synchronizerRef.current.start();
          
          // Re-enable voice detection after a suitable delay
          setTimeout(() => {
            silenceDetectionDisabledRef.current = false;
          }, 5000); // 5 seconds should be enough for initial audio to start
        }
      }, 2000);
    }
  };

  // Set up audio playback from buffer queue
  const playNextAudioChunk = () => {
    if (!audioContextRef.current || audioBufferQueueRef.current.length === 0) {
      if (isSpeaking) {
        if (debugMode) console.log("Audio queue empty, stopping speaking");
        setIsSpeaking(false);
        
        // Add cooldown to prevent immediate user interruption
        setAiSpeakingCooldown(true);
        setTimeout(() => {
          setAiSpeakingCooldown(false);
        }, 1000);
      }
      return;
    }
    
    // AI is speaking - disable user interruption during speech
    setIsSpeaking(true);
    silenceDetectionDisabledRef.current = true;
    
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
        // More audio to play
        playNextAudioChunk();
      } else {
        // Done speaking
        if (debugMode) console.log("AI finished speaking");
        setIsSpeaking(false);
        
        // Re-enable voice detection with a cooldown period
        setTimeout(() => {
          silenceDetectionDisabledRef.current = false;
          setAiSpeakingCooldown(false);
        }, 1000);
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
      if (debugMode) console.log('WebSocket connection established');
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
          // Ready to listen - server is ready to receive audio
          if (debugMode) console.log('Server is ready to listen');
        } else if (message === 'CLR') {
          // Clear audio buffer request
          if (debugMode) console.log('Clearing audio buffer');
          audioBufferQueueRef.current = [];
          if (audioSourceRef.current) {
            audioSourceRef.current.stop();
            audioSourceRef.current = null;
          }
          setIsSpeaking(false);
          setAiSpeakingCooldown(false);
          silenceDetectionDisabledRef.current = false;
        } else if (message.startsWith('---')) {
          // System message - log but don't process
          if (debugMode) console.log('System message:', message);
        } else {
          // Regular message, parse for actions and transcript
          if (debugMode) console.log('Received content from server, length:', message.length);
          prepareResponsePlayback(message);
        }
      }
    };
    
    wsRef.current.onclose = () => {
      if (debugMode) console.log('WebSocket connection closed');
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
      
      if (userSpeakingTimeoutRef.current) {
        clearTimeout(userSpeakingTimeoutRef.current);
      }
    };
  }, [topicName, debugMode]);
  
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
        
        // Set up improved voice activity detection
        // Higher silence threshold to reduce false positives
        let silenceThreshold = 0.04; // Increased to reduce false positives
        let silenceFrames = 0;
        let maxSilenceFrames = 60; // ~1.2 seconds of silence (increased)
        let speakingFrames = 0;
        let minSpeakingFrames = 15; // Require consistent detection before triggering
        
        const checkSilence = () => {
          const analyser = audioContextRef.current!.createAnalyser();
          analyser.fftSize = 256;
          source.connect(analyser);
          
          const bufferLength = analyser.frequencyBinCount;
          const dataArray = new Uint8Array(bufferLength);
          
          const detectSilence = () => {
            // Skip detection if explicitly disabled
            if (silenceDetectionDisabledRef.current) {
              requestAnimationFrame(detectSilence);
              return;
            }
            
            analyser.getByteFrequencyData(dataArray);
            
            let sum = 0;
            for (let i = 0; i < bufferLength; i++) {
              sum += dataArray[i];
            }
            
            const average = sum / bufferLength / 255;
            
            if (average > silenceThreshold) {
              // Potential speech detected
              silenceFrames = 0;
              speakingFrames++;
              
              // Only consider user speech if:
              // 1. We have enough consecutive speaking frames
              // 2. User isn't already marked as speaking
              // 3. AI isn't currently speaking
              // 4. We're not in the cooldown period after AI speaking
              // 5. There's not an ongoing AI response being processed or lesson in progress
              if (
                speakingFrames >= minSpeakingFrames && 
                !isUserSpeaking && 
                !isSpeaking && 
                !aiSpeakingCooldown && 
                !aiResponseInProgressRef.current &&
                !lessonInProgress
              ) {
                if (debugMode) console.log("User speech detected", average);
                setIsUserSpeaking(true);
                
                // Send interrupt signal only if necessary
                if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                  if (debugMode) console.log("Sending INT signal");
                  wsRef.current.send('INT'); // Interrupt signal
                }
              }
            } else {
              // Silence detected
              speakingFrames = 0;
              silenceFrames++;
              
              // Only stop user speaking state after sustained silence
              if (silenceFrames > maxSilenceFrames && isUserSpeaking) {
                if (debugMode) console.log("User silence detected");
                setIsUserSpeaking(false);
                
                // Debounce: Wait before allowing another speech detection
                if (userSpeakingTimeoutRef.current) {
                  clearTimeout(userSpeakingTimeoutRef.current);
                }
                
                userSpeakingTimeoutRef.current = setTimeout(() => {
                  if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                    if (debugMode) console.log("Sending EOS signal");
                    wsRef.current.send('EOS'); // End of speech signal
                  }
                }, 500); // Slightly longer delay to ensure full message is sent
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
          {lessonInProgress && !isUserSpeaking && !isSpeaking && (
            <p className="lesson-in-progress">Lesson in progress...</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default WhiteboardPage;