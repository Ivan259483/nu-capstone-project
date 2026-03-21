import React from 'react';
import {
    LayoutDashboard,
    Calendar,
    Navigation,
    CreditCard,
    Bell,
    Settings,
    LogOut,
    FileText,
    Sparkles
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';

type TabType = 'dashboard' | 'ai-estimator' | 'bookings' | 'tracking' | 'payments' | 'notifications' | 'settings' | 'book' | 'documents' | 'scan-book';

interface SidebarProps {
    activeTab: TabType;
    onTabChange: (tab: TabType) => void;
    className?: string;
}

export const CustomerSidebar: React.FC<SidebarProps> = ({ activeTab, onTabChange, className }) => {
    const { logout } = useAuth();

    const navItems = [
        { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
        { id: 'ai-estimator', label: 'AI Damage Scan', icon: Sparkles },
        { id: 'bookings', label: 'My Bookings', icon: Calendar },
        { id: 'tracking', label: 'Live Tracking', icon: Navigation },
        { id: 'payments', label: 'Payments', icon: CreditCard },
        { id: 'documents', label: 'Documents & Waivers', icon: FileText },
        { id: 'notifications', label: 'Notifications', icon: Bell },
        { id: 'settings', label: 'Settings', icon: Settings },
    ];

    return (
        <aside className={cn("hidden lg:flex flex-col w-64 bg-zinc-900 border-r border-zinc-800 h-screen sticky top-0", className)}>
            <div className="p-6 border-b border-zinc-800">
                <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
                        <span className="text-white font-bold text-lg">A</span>
                    </div>
                    <span className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-zinc-400">
                        AutoSPF+
                    </span>
                </div>
                <div className="mt-2 text-xs text-zinc-500 uppercase tracking-wider font-medium">
                    Customer Panel
                </div>
            </div>

            <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
                {navItems.map((item) => (
                    <Button
                        key={item.id}
                        variant="ghost"
                        className={cn(
                            "w-full justify-start gap-3 h-11 transition-all duration-200",
                            activeTab === item.id
                                ? item.id === 'ai-estimator'
                                    ? 'bg-indigo-500/15 text-indigo-300 shadow-sm border border-indigo-500/25'
                                    : 'bg-zinc-800/80 text-white shadow-sm border border-zinc-700/50'
                                : item.id === 'ai-estimator'
                                    ? 'text-indigo-400 hover:text-indigo-300 hover:bg-indigo-500/10 border border-transparent hover:border-indigo-500/20'
                                    : 'text-zinc-400 hover:text-white hover:bg-zinc-800/50'
                        )}
                        onClick={() => onTabChange(item.id as TabType)}
                    >
                        <item.icon className={cn(
                            "w-5 h-5",
                            activeTab === item.id
                                ? item.id === 'ai-estimator' ? 'text-indigo-400' : 'text-indigo-400'
                                : item.id === 'ai-estimator' ? 'text-indigo-500' : 'text-zinc-500'
                        )} />
                        {item.label}
                    </Button>
                ))}
            </nav>

            <div className="p-4 border-t border-zinc-800">
                <Button
                    variant="ghost"
                    className="w-full justify-start gap-3 text-red-400 hover:text-red-300 hover:bg-red-950/20"
                    onClick={logout}
                >
                    <LogOut className="w-5 h-5" />
                    Sign Out
                </Button>
            </div>
        </aside>
    );
};
