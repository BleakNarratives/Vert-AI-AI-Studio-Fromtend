import React from 'react';

interface LoadingSpinnerProps {
  message?: string;
}

const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
  message = 'Loading...',
}) => {
  return (
    <div className="flex flex-col items-center justify-center p-4">
      <div className="relative h-16 w-16">
        <div className="absolute h-full w-full animate-spin rounded-full border-4 border-t-4 border-gray-700 border-t-indigo-500"></div>
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-xl font-bold text-indigo-400">
          AI
        </div>
      </div>
      <p className="mt-4 text-center text-lg text-gray-400">{message}</p>
    </div>
  );
};

export default LoadingSpinner;