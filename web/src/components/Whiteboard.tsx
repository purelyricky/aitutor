import React, { useRef, useEffect, useState } from "react";
import "./Whiteboard.css";

type Shape = {
  type: "rectangle" | "circle" | "arrow" | "line";
  x: number;
  y: number;
  width?: number;
  height?: number;
  radius?: number;
  endX?: number;
  endY?: number;
  color: string;
};

type Text = {
  content: string;
  x: number;
  y: number;
  color: string;
  highlighted: boolean;
};

type WhiteboardState = {
  texts: Text[];
  shapes: Shape[];
  currentPage: number;
  totalPages: number;
};

interface WhiteboardProps {
  actionQueue: string[];
  processing: boolean;
  onActionComplete: () => void;
}

const Whiteboard: React.FC<WhiteboardProps> = ({
  actionQueue,
  processing,
  onActionComplete,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<WhiteboardState>({
    texts: [],
    shapes: [],
    currentPage: 1,
    totalPages: 1,
  });
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [writing, setWriting] = useState(false);
  const [currentTextIndex, setCurrentTextIndex] = useState(0);
  const [currentText, setCurrentText] = useState("");
  const [scale, setScale] = useState(1);

  // Initialize canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    
    if (canvas && context) {
      // Set canvas size
      canvas.width = containerRef.current?.clientWidth || 800;
      canvas.height = containerRef.current?.clientHeight || 600;
      
      // Set canvas font
      context.font = "24px 'Handlee', cursive";
      context.lineWidth = 2;
      
      // Initial clear
      context.fillStyle = "white";
      context.fillRect(0, 0, canvas.width, canvas.height);
    }
  }, []);

  // Redraw canvas when state changes
  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    
    if (canvas && context) {
      // Clear canvas
      context.fillStyle = "white";
      context.fillRect(0, 0, canvas.width, canvas.height);
      
      // Draw grid lines (light gray)
      context.strokeStyle = "#f0f0f0";
      context.lineWidth = 1;
      
      // Horizontal lines
      for (let y = 0; y < canvas.height; y += 20) {
        context.beginPath();
        context.moveTo(0, y);
        context.lineTo(canvas.width, y);
        context.stroke();
      }
      
      // Vertical lines
      for (let x = 0; x < canvas.width; x += 20) {
        context.beginPath();
        context.moveTo(x, 0);
        context.lineTo(x, canvas.height);
        context.stroke();
      }
      
      // Draw shapes
      state.shapes.forEach((shape) => {
        context.strokeStyle = shape.color;
        context.lineWidth = 2;
        
        switch (shape.type) {
          case "rectangle":
            context.beginPath();
            context.rect(
              shape.x,
              shape.y,
              shape.width || 0,
              shape.height || 0
            );
            context.stroke();
            break;
          case "circle":
            context.beginPath();
            context.arc(
              shape.x,
              shape.y,
              shape.radius || 0,
              0,
              2 * Math.PI
            );
            context.stroke();
            break;
          case "line":
            context.beginPath();
            context.moveTo(shape.x, shape.y);
            context.lineTo(shape.endX || 0, shape.endY || 0);
            context.stroke();
            break;
          case "arrow":
            const dx = (shape.endX || 0) - shape.x;
            const dy = (shape.endY || 0) - shape.y;
            const angle = Math.atan2(dy, dx);
            
            // Draw line
            context.beginPath();
            context.moveTo(shape.x, shape.y);
            context.lineTo(shape.endX || 0, shape.endY || 0);
            context.stroke();
            
            // Draw arrowhead
            const headlen = 15;
            context.beginPath();
            context.moveTo(shape.endX || 0, shape.endY || 0);
            context.lineTo(
              (shape.endX || 0) - headlen * Math.cos(angle - Math.PI / 6),
              (shape.endY || 0) - headlen * Math.sin(angle - Math.PI / 6)
            );
            context.moveTo(shape.endX || 0, shape.endY || 0);
            context.lineTo(
              (shape.endX || 0) - headlen * Math.cos(angle + Math.PI / 6),
              (shape.endY || 0) - headlen * Math.sin(angle + Math.PI / 6)
            );
            context.stroke();
            break;
        }
      });
      
      // Draw texts
      state.texts.forEach((text) => {
        // Draw highlight if highlighted
        if (text.highlighted) {
          context.fillStyle = "#ffff00";
          const metrics = context.measureText(text.content);
          context.fillRect(
            text.x - 2,
            text.y - 24,
            metrics.width + 4,
            30
          );
        }
        
        // Draw text
        context.fillStyle = text.color;
        context.font = "24px 'Handlee', cursive";
        context.fillText(text.content, text.x, text.y);
      });
    }
  }, [state, scale]);

  // Process the next action in the queue
  useEffect(() => {
    if (actionQueue.length > 0 && !writing) {
      const action = actionQueue[0];
      
      // Parse and execute action
      if (action.startsWith("{write:")) {
        // Extract text from {write: "text"} format
        const match = action.match(/{write:\s*"([^"]*)"}/);
        if (match && match[1]) {
          const text = match[1];
          setWriting(true);
          
          // Calculate writing speed based on text length
          // Longer text should write faster to keep pace with speech
          const writingSpeed = Math.max(10, Math.min(80, 200 / text.length));
          
          // Animate writing text character by character
          let index = 0;
          const writeInterval = setInterval(() => {
            if (index < text.length) {
              setCurrentText(text.substring(0, index + 1));
              index++;
            } else {
              clearInterval(writeInterval);
              
              // Add text to state
              setState((prev) => ({
                ...prev,
                texts: [
                  ...prev.texts,
                  {
                    content: text,
                    x: 50 + position.x,
                    y: 50 + position.y + prev.texts.length * 40,
                    color: "#000000",
                    highlighted: false,
                  },
                ],
              }));
              
              // Update position for next text
              setPosition((prev) => ({
                ...prev,
                y: prev.y + 40,
              }));
              
              setWriting(false);
              setCurrentText("");
              onActionComplete();
            }
          }, writingSpeed); // Adaptive speed of writing
        }
      } else if (action.startsWith("{draw:")) {
        // Extract shape from {draw:shape} format
        const match = action.match(/{draw:([a-z]+)}/);
        if (match && match[1]) {
          const shapeType = match[1] as "rectangle" | "circle" | "arrow" | "line";
          
          // Add shape to state
          setState((prev) => {
            const newShape: Shape = {
              type: shapeType,
              x: 100 + position.x,
              y: 100 + position.y,
              color: "#000000",
            };
            
            // Set additional properties based on shape type
            switch (shapeType) {
              case "rectangle":
                newShape.width = 150;
                newShape.height = 100;
                break;
              case "circle":
                newShape.radius = 50;
                break;
              case "line":
                newShape.endX = 250 + position.x;
                newShape.endY = 100 + position.y;
                break;
              case "arrow":
                newShape.endX = 250 + position.x;
                newShape.endY = 100 + position.y;
                break;
            }
            
            return {
              ...prev,
              shapes: [...prev.shapes, newShape],
            };
          });
          
          onActionComplete();
        }
      } else if (action.startsWith("{highlight:")) {
        // Extract text from {highlight: "text"} format
        const match = action.match(/{highlight:\s*"([^"]*)"}/);
        if (match && match[1]) {
          const textToHighlight = match[1];
          
          // Find and highlight text
          setState((prev) => {
            const newTexts = prev.texts.map((text) => {
              if (text.content.includes(textToHighlight)) {
                return { ...text, highlighted: true };
              }
              return text;
            });
            
            return {
              ...prev,
              texts: newTexts,
            };
          });
          
          // Remove highlight after 2 seconds
          setTimeout(() => {
            setState((prev) => {
              const newTexts = prev.texts.map((text) => ({
                ...text,
                highlighted: false,
              }));
              
              return {
                ...prev,
                texts: newTexts,
              };
            });
          }, 2000);
          
          onActionComplete();
        }
      } else if (action.startsWith("{erase:")) {
        // Just complete the action for now
        onActionComplete();
      } else if (action.startsWith("{newpage:")) {
        // Clear whiteboard for new page
        setState((prev) => ({
          texts: [],
          shapes: [],
          currentPage: prev.currentPage + 1,
          totalPages: prev.totalPages + 1,
        }));
        
        setPosition({ x: 0, y: 0 });
        onActionComplete();
      }
    }
  }, [actionQueue, writing, position, onActionComplete]);

  // Zoom in/out
  const handleZoom = (zoomIn: boolean) => {
    setScale((prev) => {
      const newScale = zoomIn ? prev * 1.1 : prev / 1.1;
      return Math.max(0.5, Math.min(2, newScale));
    });
  };

  // Reset zoom
  const resetZoom = () => {
    setScale(1);
  };

  // Clear whiteboard
  const clearWhiteboard = () => {
    setState((prev) => ({
      ...prev,
      texts: [],
      shapes: [],
    }));
    setPosition({ x: 0, y: 0 });
  };

  return (
    <div className="whiteboard-container" ref={containerRef}>
      <div className="whiteboard-controls">
        <button onClick={() => handleZoom(true)}>Zoom In</button>
        <button onClick={() => handleZoom(false)}>Zoom Out</button>
        <button onClick={resetZoom}>Reset Zoom</button>
        <button onClick={clearWhiteboard}>Clear</button>
        <span>Page {state.currentPage}/{state.totalPages}</span>
      </div>
      
      <div 
        className="canvas-container"
        style={{ 
          transform: `scale(${scale})`,
          transformOrigin: "top left",
        }}
      >
        <canvas ref={canvasRef} className="whiteboard-canvas" />
        
        {writing && (
          <div 
            className="writing-text"
            style={{ 
              position: "absolute",
              left: `${50 + position.x}px`,
              top: `${50 + position.y + state.texts.length * 40 - 24}px`,
              fontFamily: "'Handlee', cursive",
              fontSize: "24px",
            }}
          >
            {currentText}
          </div>
        )}
      </div>
    </div>
  );
};

export default Whiteboard;