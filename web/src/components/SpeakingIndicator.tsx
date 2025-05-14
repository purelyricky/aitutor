import React, { useEffect, useRef } from 'react';
import './SpeakingIndicator.css';

interface SpeakingIndicatorProps {
  isSpeaking: boolean;
}

const SpeakingIndicator: React.FC<SpeakingIndicatorProps> = ({ isSpeaking }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameRef = useRef<number>(0);
  const currentRadiusRef = useRef<number>(15);
  const growingRef = useRef<boolean>(true);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas dimensions
    canvas.width = 60;
    canvas.height = 60;

    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const minRadius = 12;
    const maxRadius = 18;
    const pulseSpeed = 0.3;

    const draw = () => {
      // Clear canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      if (isSpeaking) {
        // Update radius based on whether growing or shrinking
        if (growingRef.current) {
          currentRadiusRef.current += pulseSpeed;
          if (currentRadiusRef.current >= maxRadius) {
            growingRef.current = false;
          }
        } else {
          currentRadiusRef.current -= pulseSpeed;
          if (currentRadiusRef.current <= minRadius) {
            growingRef.current = true;
          }
        }

        // Draw outer circle (glow effect)
        const gradient = ctx.createRadialGradient(
          centerX, centerY, currentRadiusRef.current * 0.7,
          centerX, centerY, currentRadiusRef.current * 1.5
        );
        gradient.addColorStop(0, 'rgba(72, 149, 239, 0.6)');
        gradient.addColorStop(1, 'rgba(72, 149, 239, 0)');
        
        ctx.beginPath();
        ctx.arc(centerX, centerY, currentRadiusRef.current * 1.5, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.fill();

        // Draw inner circle
        ctx.beginPath();
        ctx.arc(centerX, centerY, currentRadiusRef.current, 0, Math.PI * 2);
        ctx.fillStyle = '#1a73e8';
        ctx.fill();
      } else {
        // When not speaking, draw static circle
        ctx.beginPath();
        ctx.arc(centerX, centerY, minRadius, 0, Math.PI * 2);
        ctx.fillStyle = '#9aa0a6';
        ctx.fill();
      }

      // Request next frame
      animationFrameRef.current = requestAnimationFrame(draw);
    };

    // Start animation
    draw();

    // Cleanup on unmount
    return () => {
      cancelAnimationFrame(animationFrameRef.current);
    };
  }, [isSpeaking]);

  return (
    <div className="speaking-indicator">
      <canvas ref={canvasRef} width="60" height="60" />
    </div>
  );
};

export default SpeakingIndicator;