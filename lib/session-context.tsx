"use client";

import React, { createContext, useContext, useState, ReactNode } from 'react';

interface SessionContextType {
  sessionId: string | null;
  setSessionId: (id: string | null) => void;
  isUploading: boolean;
  setIsUploading: (status: boolean) => void;
  uploadedFilePaths: string[];
  setUploadedFilePaths: (paths: string[]) => void;
  _uploadError: string | null;
  setUploadError: (error: string | null) => void;
}

const SessionContext = createContext<SessionContextType | undefined>(undefined);

export const SessionProvider = ({ children }: { children: ReactNode }) => {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadedFilePaths, setUploadedFilePaths] = useState<string[]>([]);
  const [_uploadError, setUploadError] = useState<string | null>(null);

  return (
    <SessionContext.Provider
      value={{
        sessionId,
        setSessionId,
        isUploading,
        setIsUploading,
        uploadedFilePaths,
        setUploadedFilePaths,
        _uploadError,
        setUploadError,
      }}
    >
      {children}
    </SessionContext.Provider>
  );
};

export const useSession = () => {
  const context = useContext(SessionContext);
  if (context === undefined) {
    throw new Error('useSession must be used within a SessionProvider');
  }
  return context;
}; 