import React, { useState, useRef, useEffect, useContext, useCallback } from 'react';
import { LookingGlassContext } from '../App';

interface LookingGlassComponentProps {
  // Can add props to configure default content if needed
}

const LookingGlass: React.FC<LookingGlassComponentProps> = () => {
  const lookingGlassContext = useContext(LookingGlassContext);
  if (!lookingGlassContext) {
    throw new Error(
      'LookingGlass must be used within a LookingGlassProvider',
    );
  }

  const { lookingGlassState, toggleLookingGlass } = lookingGlassContext;
  const { isVisible, position, size, content, title } = lookingGlassState;

  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  const resizeStart = useRef({ x: 0, y: 0 });
  const resizeDirection = useRef('');

  // Use state for current position and size to allow local manipulation
  const [currentPosition, setCurrentPosition] = useState(position);
  const [currentSize, setCurrentSize] = useState(size);

  const windowRef = useRef<HTMLDivElement>(null);

  // Update local state when props change (e.g., if initial position is set externally)
  useEffect(() => {
    setCurrentPosition(position);
    setCurrentSize(size);
  }, [position, size]);

  const handleMouseDown = useCallback((e: React.MouseEvent, type: string) => {
    e.stopPropagation(); // Prevent interaction with elements below
    if (!windowRef.current) return;

    if (type === 'drag') {
      setIsDragging(true);
      dragOffset.current = {
        x: e.clientX - currentPosition.x,
        y: e.clientY - currentPosition.y,
      };
    } else if (type.startsWith('resize')) {
      setIsResizing(true);
      resizeStart.current = { x: e.clientX, y: e.clientY };
      resizeDirection.current = type;
    }
  }, [currentPosition]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (isDragging) {
      const newX = e.clientX - dragOffset.current.x;
      const newY = e.clientY - dragOffset.current.y;
      setCurrentPosition({ x: newX, y: newY });
    } else if (isResizing) {
      const deltaX = e.clientX - resizeStart.current.x;
      const deltaY = e.clientY - resizeStart.current.y;

      setCurrentSize((prevSize) => {
        let newWidth = prevSize.width;
        let newHeight = prevSize.height;
        let newX = currentPosition.x; // Keep track of position changes during resize
        let newY = currentPosition.y;

        switch (resizeDirection.current) {
          case 'resize-nw':
            newWidth = prevSize.width - deltaX;
            newHeight = prevSize.height - deltaY;
            newX = currentPosition.x + deltaX;
            newY = currentPosition.y + deltaY;
            break;
          case 'resize-ne':
            newWidth = prevSize.width + deltaX;
            newHeight = prevSize.height - deltaY;
            newY = currentPosition.y + deltaY;
            break;
          case 'resize-sw':
            newWidth = prevSize.width - deltaX;
            newHeight = prevSize.height + deltaY;
            newX = currentPosition.x + deltaX;
            break;
          case 'resize-se':
            newWidth = prevSize.width + deltaX;
            newHeight = prevSize.height + deltaY;
            break;
          case 'resize-n':
            newHeight = prevSize.height - deltaY;
            newY = currentPosition.y + deltaY;
            break;
          case 'resize-s':
            newHeight = prevSize.height + deltaY;
            break;
          case 'resize-w':
            newWidth = prevSize.width - deltaX;
            newX = currentPosition.x + deltaX;
            break;
          case 'resize-e':
            newWidth = prevSize.width + deltaX;
            break;
        }

        // Minimum size check
        newWidth = Math.max(newWidth, 300); // Increased minimum size
        newHeight = Math.max(newHeight, 200);

        setCurrentPosition({ x: newX, y: newY });
        resizeStart.current = { x: e.clientX, y: e.clientY }; // Update resize start for continuous resize
        return { width: newWidth, height: newHeight };
      });
    }
  }, [isDragging, isResizing, currentPosition]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
    setIsResizing(false);
    resizeDirection.current = '';
  }, []);

  useEffect(() => {
    if (isDragging || isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    } else {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, isResizing, handleMouseMove, handleMouseUp]);

  if (!isVisible) return null;

  return (
    <div
      ref={windowRef}
      className="absolute z-50 overflow-hidden rounded-xl border-2 border-indigo-500 bg-gray-900 bg-opacity-80 shadow-2xl backdrop-blur-md transition-all duration-100 ease-out animate-fade-in-scale"
      style={{
        left: currentPosition.x,
        top: currentPosition.y,
        width: currentSize.width,
        height: currentSize.height,
        minWidth: '300px', // Apply min-width via style for consistency
        minHeight: '200px', // Apply min-height via style for consistency
        resize: 'none', // Disable native resize
        boxShadow: '0 0 30px rgba(99, 102, 241, 0.7), 0 0 60px rgba(129, 140, 248, 0.4)', // Deeper glow
      }}
    >
      {/* Handle for dragging */}
      <div
        className="flex cursor-grab items-center justify-between rounded-t-lg bg-gradient-to-r from-indigo-700 to-purple-800 p-2 text-white active:cursor-grabbing text-lg font-bold"
        onMouseDown={(e) => handleMouseDown(e, 'drag')}
      >
        <span className="font-bold tracking-wider">{title}</span>
        <button
          onClick={() => toggleLookingGlass(false)}
          className="rounded-full bg-red-600 px-3 py-1 text-sm font-bold hover:bg-red-700 transition-colors"
          aria-label="Close Looking Glass"
        >
          X
        </button>
      </div>

      {/* Content Area */}
      <div className="flex h-[calc(100%-48px)] w-full flex-col overflow-auto p-4 text-gray-200 text-base">
        {content || (
          <p className="text-center text-gray-500 italic mt-4">
            Awaiting quantum data stream...
          </p>
        )}
      </div>

      {/* Resize Handles - Larger and more visually distinct */}
      <div
        className="absolute -left-2 -top-2 h-4 w-4 cursor-nw-resize rounded-full bg-indigo-400 opacity-70 hover:opacity-100 transition-opacity"
        onMouseDown={(e) => handleMouseDown(e, 'resize-nw')}
      ></div>
      <div
        className="absolute -right-2 -top-2 h-4 w-4 cursor-ne-resize rounded-full bg-indigo-400 opacity-70 hover:opacity-100 transition-opacity"
        onMouseDown={(e) => handleMouseDown(e, 'resize-ne')}
      ></div>
      <div
        className="absolute -left-2 -bottom-2 h-4 w-4 cursor-sw-resize rounded-full bg-indigo-400 opacity-70 hover:opacity-100 transition-opacity"
        onMouseDown={(e) => handleMouseDown(e, 'resize-sw')}
      ></div>
      <div
        className="absolute -right-2 -bottom-2 h-4 w-4 cursor-se-resize rounded-full bg-indigo-400 opacity-70 hover:opacity-100 transition-opacity"
        onMouseDown={(e) => handleMouseDown(e, 'resize-se')}
      ></div>
      {/* Invisible resize bands for easier targeting */}
      <div
        className="absolute left-0 top-0 h-4 w-full cursor-n-resize bg-transparent"
        style={{ height: '8px' }}
        onMouseDown={(e) => handleMouseDown(e, 'resize-n')}
      ></div>
      <div
        className="absolute bottom-0 left-0 h-4 w-full cursor-s-resize bg-transparent"
        style={{ height: '8px' }}
        onMouseDown={(e) => handleMouseDown(e, 'resize-s')}
      ></div>
      <div
        className="absolute left-0 top-0 h-full w-4 cursor-w-resize bg-transparent"
        style={{ width: '8px' }}
        onMouseDown={(e) => handleMouseDown(e, 'resize-w')}
      ></div>
      <div
        className="absolute right-0 top-0 h-full w-4 cursor-e-resize bg-transparent"
        style={{ width: '8px' }}
        onMouseDown={(e) => handleMouseDown(e, 'resize-e')}
      ></div>

      {/* Custom animations for LookingGlass */}
      <style jsx>{`
        @keyframes fade-in-scale {
          0% {
            opacity: 0;
            transform: scale(0.8) translateY(20px);
          }
          100% {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }
        .animate-fade-in-scale {
          animation: fade-in-scale 0.3s ease-out forwards;
        }
      `}</style>
    </div>
  );
};

export default LookingGlass;