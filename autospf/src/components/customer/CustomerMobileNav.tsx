import React from 'react';
import {
    LayoutDashboard,
    Calendar,
    Navigation,
    CreditCard,
    Bell,
    Settings,
    Menu,
    X,
    LogOut,
    FileText,
    Sparkles
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';

type TabType = 'dashboard' | 'ai-estimator' | 'bookings' | 'tracking' | 'payments' | 'notifications' | 'settings' | 'book' | 'documents' | 'scan-book';

interface MobileNavProps {
    activeTab: TabType;
    onTabChange: (tab: TabType) => void;
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
}

export const CustomerMobileNav: React.FC<MobileNavProps> = ({
    activeTab,
    onTabChange,
    isOpen,
    onOpenChange
}) => {
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
        <Sheet open={isOpen} onOpenChange={onOpenChange}>
            <SheetContent side="left" className="bg-zinc-900 border-zinc-800 p-0 text-white w-72">
                <SheetHeader className="p-6 border-b border-zinc-800 text-left">
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
                            <span className="text-white font-bold text-lg">A</span>
                        </div>
                        <SheetTitle className="text-white">AutoSPF+</SheetTitle>
                    </div>
                </SheetHeader>

                <div className="flex flex-col h-[calc(100vh-80px)]">
                    <nav className="flex-1 p-4 space-y-1">
                        {navItems.map((item) => (
                            <Button
                                key={item.id}
                                variant="ghost"
                                className={cn(
                                    "w-full justify-start gap-3 h-11 transition-all duration-200",
                                    activeTab === item.id
                                        ? item.id === 'ai-estimator'
                                            ? 'bg-indigo-500/15 text-indigo-300 border border-indigo-500/25'
                                            : 'bg-zinc-800/80 text-white'
                                        : item.id === 'ai-estimator'
                                            ? 'text-indigo-400 hover:text-indigo-300 hover:bg-indigo-500/10'
                                            : 'text-zinc-400 hover:text-white hover:bg-zinc-800/50'
                                )}
                                onClick={() => {
                                    onTabChange(item.id as TabType);
                                    onOpenChange(false);
                                }}
                            >
                                <item.icon className={cn(
                                    "w-5 h-5",
                                    activeTab === item.id
                                        ? 'text-indigo-400'
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
                            onClick={() => {
                                logout();
                                onOpenChange(false);
                            }}
                        >
                            <LogOut className="w-5 h-5" />
                            Sign Out
                        </Button>
                    </div>
                </div>
            </SheetContent>
        </Sheet>
    );
};
