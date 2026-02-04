import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { User } from '@/types';
import { userStorage, initializeStorage } from '@/lib/storage';

interface AuthContextType {
    user: User | null;
    isLoading: boolean;
    login: (email: string, password: string) => Promise<boolean>;
    signup: (email: string, password: string, name: string, role: 'customer') => Promise<boolean>;
    logout: () => void;
    updateUser: (user: User) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        // Initialize storage with seed data
        initializeStorage();

        // Check for existing session
        const currentUser = userStorage.getCurrentUser();
        if (currentUser) {
            setUser(currentUser);
        }
        setIsLoading(false);
    }, []);

    const login = useCallback(async (email: string, password: string): Promise<boolean> => {
        const foundUser = userStorage.getUserByEmail(email);

        if (foundUser && foundUser.password === password) {
            // Update last active
            foundUser.lastActive = new Date().toISOString();
            userStorage.updateUser(foundUser);
            userStorage.setCurrentUser(foundUser);
            setUser(foundUser);
            return true;
        }
        return false;
    }, []);

    const signup = useCallback(async (email: string, password: string, name: string, role: 'customer'): Promise<boolean> => {
        const existingUser = userStorage.getUserByEmail(email);
        if (existingUser) {
            return false;
        }

        const newUser: User = {
            id: Date.now().toString(),
            email,
            password,
            name,
            role,
            status: 'active',
            createdAt: new Date().toISOString(),
            lastActive: new Date().toISOString(),
        };

        userStorage.addUser(newUser);
        userStorage.setCurrentUser(newUser);
        setUser(newUser);
        return true;
    }, []);

    const logout = useCallback(() => {
        userStorage.clearCurrentUser();
        setUser(null);
    }, []);

    const updateUser = useCallback((updatedUser: User) => {
        userStorage.updateUser(updatedUser);
        setUser(updatedUser);
    }, []);

    return (
        <AuthContext.Provider value={{ user, isLoading, login, signup, logout, updateUser }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}


