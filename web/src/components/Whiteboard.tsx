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
  const currentActionRef = useRef<string | null>(null);
  const animationRef = useRef<number | null>(null);

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
    
    // Handle window resize
    const handleResize = () => {
      if (canvas && containerRef.current) {
        canvas.width = containerRef.current.clientWidth;
        canvas.height = containerRef.current.clientHeight;
        redrawCanvas();
      }
    };
    
    window.addEventListener('resize', handleResize);
    
    return () => {
      window.removeEventListener('resize', handleResize);
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, []);

  // Redraw canvas function to avoid code duplication
  const redrawCanvas = () => {
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
  };

  // Redraw canvas when state changes
  useEffect(() => {
    redrawCanvas();
  }, [state, scale]);

  // Process the next action in the queue
  useEffect(() => {
    if (actionQueue.length > 0 && !writing && !currentActionRef.current) {
      const action = actionQueue[0];
      currentActionRef.current = action;
      
      // Parse and execute action
      if (action.startsWith("{write:")) {
        // Extract text from {write: "text"} format
        const match = action.match(/{write:\s*"([^"]*)"}/);
        if (match && match[1]) {
          const text = match[1];
          setWriting(true);
          
          // Calculate writing speed based on text length
          // Longer text should write faster to keep pace with speech
          const writingSpeed = Math.max(10, Math.min(70, 150 / text.length));
          
          // Animate writing text character by character
          let index = 0;
          const writeChar = () => {
            if (index < text.length) {
              setCurrentText(text.substring(0, index + 1));
              index++;
              setTimeout(writeChar, writingSpeed);
            } else {
              // Add text to state
              setState((prev) => {
                // Find suitable Y position that doesn't overlap
                let yPos = 50 + position.y;
                
                // Adjust position for new line if needed (basic word wrapping)
                const textLength = text.length * 12; // Rough estimate of text width
                const canvasWidth = canvasRef.current?.width || 800;
                
                if (50 + position.x + textLength > canvasWidth) {
                  // Move to next line if text would go off screen
                  yPos += 40;
                  setPosition((prev) => ({
                    x: 0,
                    y: prev.y + 40,
                  }));
                }
                
                return {
                  ...prev,
                  texts: [
                    ...prev.texts,
                    {
                      content: text,
                      x: 50 + position.x,
                      y: yPos,
                      color: "#000000",
                      highlighted: false,
                    },
                  ],
                };
              });
              
              // Update position for next text (move right a bit)
              setPosition((prev) => ({
                x: prev.x + Math.min(text.length * 6, 200), // Move right, but not too far
                y: prev.y,
              }));
              
              setWriting(false);
              setCurrentText("");
              currentActionRef.current = null;
              onActionComplete();
            }
          };
          
          // Start writing animation
          writeChar();
        }
      } else if (action.startsWith("{draw:")) {
        // Extract shape from {draw:shape} format
        const match = action.match(/{draw:([a-z]+)}/);
        if (match && match[1]) {
          const shapeType = match[1] as "rectangle" | "circle" | "arrow" | "line";
          
          // Add shape to state with animation
          let progress = 0;
          const totalFrames = 40; // Animation frames
          
          const animateShape = () => {
            if (progress < totalFrames) {
              progress++;
              const completionRatio = progress / totalFrames;
              
              setState((prev) => {
                const newShapes = [...prev.shapes];
                // Remove the previous animation frame
                if (newShapes.length > 0 && progress > 1) {
                  newShapes.pop();
                }
                
                // Create the shape with current animation progress
                const newShape: Shape = {
                  type: shapeType,
                  x: 100 + position.x,
                  y: 100 + position.y,
                  color: "#000000",
                };
                
                // Set additional properties based on shape type and animation progress
                switch (shapeType) {
                  case "rectangle":
                    newShape.width = 150 * completionRatio;
                    newShape.height = 100 * completionRatio;
                    break;
                  case "circle":
                    newShape.radius = 50 * completionRatio;
                    break;
                  case "line":
                    newShape.endX = 100 + position.x + 150 * completionRatio;
                    newShape.endY = 100 + position.y;
                    break;
                  case "arrow":
                    newShape.endX = 100 + position.x + 150 * completionRatio;
                    newShape.endY = 100 + position.y;
                    break;
                }
                
                return {
                  ...prev,
                  shapes: [...newShapes, newShape],
                };
              });
              
              animationRef.current = requestAnimationFrame(animateShape);
            } else {
              // Animation complete
              // Final shape is already in the state
              currentActionRef.current = null;
              onActionComplete();
            }
          };
          
          // Start animation
          animateShape();
        }
      } else if (action.startsWith("{highlight:")) {
        // Extract text from {highlight: "text"} format
        const match = action.match(/{highlight:\s*"([^"]*)"}/);
        if (match && match[1]) {
          const textToHighlight = match[1];
          
          // Find and highlight text with animation
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
          
          // Remove highlight after 3 seconds
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
            
            currentActionRef.current = null;
            onActionComplete();
          }, 3000);
        } else {
          currentActionRef.current = null;
          onActionComplete();
        }
      } else if (action.startsWith("{erase:")) {
        // Extract area from {erase: "area"} format
        const match = action.match(/{erase:\s*"([^"]*)"}/);
        if (match && match[1]) {
          const areaToErase = match[1].toLowerCase();
          
          // Simulate eraser motion
          let eraserX = 100;
          let eraserY = 100;
          const targetX = 700;
          
          const animateEraser = () => {
            // Move eraser
            eraserX += 15;
            
            // Update canvas to show eraser effect
            const canvas = canvasRef.current;
            const context = canvas?.getContext("2d");
            
            if (canvas && context) {
              // Redraw everything
              redrawCanvas();
              
              // Draw eraser indicator
              context.fillStyle = "#f0f0f0aa";
              context.fillRect(eraserX - 25, eraserY - 25, 50, 50);
              context.strokeStyle = "#aaaaaa";
              context.strokeRect(eraserX - 25, eraserY - 25, 50, 50);
            }
            
            if (eraserX < targetX) {
              animationRef.current = requestAnimationFrame(animateEraser);
            } else {
              // Erasing complete, actually remove content
              if (areaToErase.includes("all")) {
                // Erase everything
                setState((prev) => ({
                  ...prev,
                  texts: [],
                  shapes: [],
                }));
                setPosition({ x: 0, y: 0 });
              } else if (areaToErase.includes("text")) {
                // Erase just text
                setState((prev) => ({
                  ...prev,
                  texts: [],
                }));
              } else if (areaToErase.includes("shape")) {
                // Erase just shapes
                setState((prev) => ({
                  ...prev,
                  shapes: [],
                }));
              }
              
              // Complete the action
              currentActionRef.current = null;
              onActionComplete();
            }
          };
          
          // Start animation
          animateEraser();
        } else {
          currentActionRef.current = null;
          onActionComplete();
        }
      } else if (action.startsWith("{newpage:")) {
        // Extract title from {newpage: "title"} format
        const match = action.match(/{newpage:\s*"([^"]*)"}/);
        if (match && match[1]) {
          const pageTitle = match[1];
          
          // Animate page flip
          let progress = 0;
          const totalFrames = 20;
          
          const animatePageFlip = () => {
            progress++;
            const canvas = canvasRef.current;
            const context = canvas?.getContext("2d");
            
            if (canvas && context) {
              // Draw page flip effect
              context.fillStyle = "white";
              context.fillRect(0, 0, canvas.width, canvas.height);
              
              context.fillStyle = "#f0f0f0";
              const flipWidth = (canvas.width * progress) / totalFrames;
              context.fillRect(0, 0, flipWidth, canvas.height);
              
              if (progress === totalFrames / 2) {
                // Clear whiteboard for new page
                setState((prev) => ({
                  texts: [],
                  shapes: [],
                  currentPage: prev.currentPage + 1,
                  totalPages: prev.totalPages + 1,
                }));
                setPosition({ x: 0, y: 0 });
              }
              
              if (progress < totalFrames) {
                requestAnimationFrame(animatePageFlip);
              } else {
                // Add page title
                setState((prev) => ({
                  ...prev,
                  texts: [
                    {
                      content: pageTitle,
                      x: 50,
                      y: 50,
                      color: "#3498db",
                      highlighted: false,
                    },
                  ],
                }));
                
                setPosition({ x: 0, y: 50 });
                
                currentActionRef.current = null;
                onActionComplete();
              }
            }
          };
          
          // Start animation
          animatePageFlip();
        } else {
          // Clear whiteboard for new page without title
          setState((prev) => ({
            texts: [],
            shapes: [],
            currentPage: prev.currentPage + 1,
            totalPages: prev.totalPages + 1,
          }));
          
          setPosition({ x: 0, y: 0 });
          currentActionRef.current = null;
          onActionComplete();
        }
      } else {
        // Unknown action type, just complete it
        currentActionRef.current = null;
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
              top: `${50 + position.y - 24}px`,
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