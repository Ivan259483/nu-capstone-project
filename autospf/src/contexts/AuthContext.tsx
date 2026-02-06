import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { User } from '@/types';
import { userStorage, initializeStorage } from '@/lib/storage';
import { UserService } from '@/lib/user-service';
import api from '@/lib/api';

interface AuthContextType {
    user: User | null;
    isLoading: boolean;
    login: (email: string, password: string) => Promise<{ success: boolean; message?: string }>;
    signup: (email: string, password: string, name: string) => Promise<{ success: boolean; message?: string }>;
    logout: () => void;
    updateUser: (user: User) => Promise<{ success: boolean; message?: string }>;
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

    const login = useCallback(async (email: string, password: string): Promise<{ success: boolean; message?: string }> => {
        try {
            const response = await api.post('/auth/login', { email, password });
            const data = response.data;

            if (data.success) {
                localStorage.setItem('autospf_token', data.data.token);
                const userData = { ...data.data.user, id: data.data.user.id || data.data.user._id };
                userStorage.setCurrentUser(userData);
                setUser(userData);
                return { success: true };
            }
            return { success: false, message: data.message || 'Invalid credentials' };
        } catch (error: any) {
            console.error('Login error:', error);

            // Extract message from server response if available
            const serverMessage = error.response?.data?.message;
            if (serverMessage) {
                return { success: false, message: serverMessage };
            }

            // Fallback for demo/offline
            const foundUser = userStorage.getByEmail(email);
            if (foundUser && foundUser.password === password) {
                userStorage.setCurrentUser(foundUser);
                setUser(foundUser);
                return { success: true };
            }
            return { success: false, message: 'Login failed. Please check your connection.' };
        }
    }, []);

    const signup = useCallback(async (email: string, password: string, name: string): Promise<{ success: boolean; message?: string }> => {
        try {
            const response = await api.post('/auth/register', { email, password, name, role: 'customer' });
            return {
                success: response.data.success,
                message: response.data.message
            };
        } catch (error: any) {
            console.error('Signup error:', error);
            return {
                success: false,
                message: error.response?.data?.message || 'An error occurred during signup'
            };
        }
    }, []);

    const logout = useCallback(() => {
        localStorage.removeItem('autospf_token');
        userStorage.setCurrentUser(null);
        setUser(null);
    }, []);

    const updateUser = useCallback(async (updatedUser: User): Promise<{ success: boolean; message?: string }> => {
        try {
            const response = await UserService.updateUser(updatedUser.id, {
                name: updatedUser.name,
                email: updatedUser.email
            });

            if (response.success) {
                userStorage.update(updatedUser);
                userStorage.setCurrentUser(updatedUser);
                setUser(updatedUser);
                return { success: true };
            }
            return { success: false, message: response.message || 'Update failed' };
        } catch (error: any) {
            console.error('Update profile error:', error);
            // Fallback for safety
            userStorage.update(updatedUser);
            userStorage.setCurrentUser(updatedUser);
            setUser(updatedUser);
            return { success: true }; // Still return success to allow local update if demo/offline
        }
    }, []);

    return (
        <AuthContext.Provider value={{ user, isLoading, login, signup, logout, updateUser }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}