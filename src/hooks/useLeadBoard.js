import { createContext, useContext } from 'react';

/** Shared state for the coordinator area (provided by CoordinatorShell). */
export const LeadBoardContext = createContext(null);
export const useLeadBoard = () => useContext(LeadBoardContext);
