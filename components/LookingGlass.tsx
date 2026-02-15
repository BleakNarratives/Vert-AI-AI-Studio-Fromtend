
import React, { useState, useRef, useEffect, useContext, useCallback } from 'react';
import { LookingGlassContext } from '../App';
import { SnapshotListDisplayProps } from '../types'; // Import SnapshotListDisplayProps

interface LookingGlassComponentProps {
  // Can add props to configure default content if needed
}

// Placeholder component for rendering the list of snapshots
// This would be in its own file like components/SnapshotListDisplay.tsx
const SnapshotListDisplay: React.FC<SnapshotListDisplayProps> = ({
  snapshots,
  onRestore,
  onDelete,
}) => {
  return (
    <div className="p-4">
      <h3 className="text-xl font-bold mb-4 text-indigo-400">Available Snapshots</h3>
      {snapshots.length === 0 ? (
        <p className="text-gray-400 italic">No snapshots saved yet.</p>
      ) : (
        <ul className="space-y-3">
          {snapshots.map((snapshot) => (
            <li
              key={snapshot.id}
              className="bg-gray-800 p-3 rounded-lg border border-gray-700 flex flex-col md:flex-row justify-between items-start md:items-center"
            >
              <div className="mb-2 md:mb-0">
                <p className="font-bold text-green-300">{snapshot.description}</p>
                <p className="text-xs text-gray-400">
                  ID: {snapshot.id.substring(0, 8)}... | Saved: {new Date(snapshot.timestamp).toLocaleString()}
                </p>
              </div>
              <div className="flex space-x-2">
                <button
                  onClick={() => onRestore(snapshot.id)}
                  className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-sm transition-colors"
                >
                  Restore
                </button>
                <button
                  onClick={() => onDelete(snapshot.id)}
                  className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded-md text-sm transition-colors"
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};


const LookingGlass: React.FC<LookingGlassComponentProps> = () => {
  const lookingGlassContext = useContext(LookingGlassContext);
  if (!lookingGlassContext) {
    throw new Error(
      'LookingGlass must be used within a LookingGlassProvider',
    );
  }

  const { lookingGlassState, toggleLookingGlass, restoreSnapshot, deleteSnapshot } = lookingGlassContext;
  const { isVisible, position, size, content, title } = lookingGlassState;

  const [currentPosition, setCurrentPosition] = useState(position);
  const [currentSize, setCurrentSize] = useState(size);

  const windowRef = useRef<HTMLDivElement>(null);
  
  // Use refs for mutable state that doesn't trigger re-renders
  const isDraggingRef = useRef(false);
  const isResizingRef = useRef(false);
  const dragOffsetRef = useRef({ x: 0, y: 0 });
  const resizeStartRef = useRef({ x: 0, y: 0 });
  const resizeDirectionRef = useRef('');


  // Update local state when props change (e.g., if initial position is set externally)
  useEffect(() => {
    setCurrentPosition(position);
    setCurrentSize(size);
  }, [position, size]);

  const handleMouseDown = useCallback((e: React.MouseEvent, type: string) => {
    e.stopPropagation(); // Prevent interaction with elements below
    if (!windowRef.current) return;

    if (type === 'drag') {
      isDraggingRef.current = true;
      dragOffsetRef.current = {
        x: e.clientX - currentPosition.x,
        y: e.clientY - currentPosition.y,
      };
    } else if (type.startsWith('resize')) {
      isResizingRef.current = true;
      resizeStartRef.current = { x: e.clientX, y: e.clientY };
      resizeDirectionRef.current = type;
    }
  }, [currentPosition]);

  // Global mousemove and mouseup handlers
  const handleGlobalMouseMove = useCallback((e: MouseEvent) => {
    if (isDraggingRef.current) {
      const newX = e.clientX - dragOffsetRef.current.x;
      const newY = e.clientY - dragOffsetRef.current.y;
      setCurrentPosition({ x: newX, y: newY });
    } else if (isResizingRef.current) {
      const deltaX = e.clientX - resizeStartRef.current.x;
      const deltaY = e.clientY - resizeStartRef.current.y;

      setCurrentSize((prevSize) => {
        let newWidth = prevSize.width;
        let newHeight = prevSize.height;
        let newX = currentPosition.x; 
        let newY = currentPosition.y;

        switch (resizeDirectionRef.current) {
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
        resizeStartRef.current = { x: e.clientX, y: e.clientY }; // Update resize start for continuous resize
        return { width: newWidth, height: newHeight };
      });
    }
  }, [currentPosition]); // Depend on currentPosition to ensure correct delta calculations

  const handleGlobalMouseUp = useCallback(() => {
    isDraggingRef.current = false;
    isResizingRef.current = false;
    resizeDirectionRef.current = '';
  }, []);

  // Attach global event listeners once on mount and clean up on unmount
  useEffect(() => {
    document.addEventListener('mousemove', handleGlobalMouseMove);
    document.addEventListener('mouseup', handleGlobalMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleGlobalMouseMove);
      document.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, [handleGlobalMouseMove, handleGlobalMouseUp]); // Dependencies are stable callbacks

  if (!isVisible) return null;

  // Check if the content is a SnapshotListDisplay component (by type checking, conceptually)
  // This is a common pattern for dynamic content in React.
  const isSnapshotList = (c: React.ReactNode): c is React.ReactElement<SnapshotListDisplayProps> => {
    // This check is a simplification. In a real app, you'd have a more robust way
    // to identify content types, e.g., by passing a type flag or using context
    // or by inspecting the element's type if it's a known component.
    // For this conceptual purpose, we'll assume the content passed for snapshots
    // is always of this specific type.
    if (React.isValidElement(c) && c.type === SnapshotListDisplay) {
      return true;
    }
    return false;
  };


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
      role="dialog" // ARIA role for accessibility
      aria-modal="true" // Indicate that it's a modal dialog
      data-testid="looking-glass-window" // Test ID
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
        {isSnapshotList(content) ? (
          // If content is a snapshot list, clone it with context functions
          // Fix: Explicitly pass the restoreSnapshot and deleteSnapshot functions from context
          React.cloneElement(content, { onRestore: restoreSnapshot, onDelete: deleteSnapshot })
        ) : (
          // Otherwise, render general content
          content || (
            <p className="text-center text-gray-500 italic mt-4">
              Awaiting quantum data stream...
            </p>
          )
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