import React from 'react';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { SocketProvider } from './context/SocketContext';
import { UndoRedoProvider } from './context/UndoRedoContext';
import { AppRoutes } from './routes/AppRoutes';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <SocketProvider>
          <UndoRedoProvider>
            <AppRoutes />
          </UndoRedoProvider>
        </SocketProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
