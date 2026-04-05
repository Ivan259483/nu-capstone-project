import React from 'react';
import {
    Bell,
    Info,
    CheckCircle,
    AlertTriangle,
    Clock,
    X,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { SystemNotification } from '@/lib/notification-service';

interface NotificationsProps {
    notifications: SystemNotification[];
    onMarkAsRead?: (id: string) => void;
    onClearAll?: () => void;
}

export const Notifications: React.FC<NotificationsProps> = ({
    notifications,
    onMarkAsRead,
    onClearAll
}) => {

    const getIcon = (type: string) => {
        switch (type) {
            case 'success': return <CheckCircle className="w-5 h-5 text-emerald-400" />;
            case 'warning': return <AlertTriangle className="w-5 h-5 text-amber-400" />;
            case 'error': return <X className="w-5 h-5 text-red-400" />;
            default: return <Info className="w-5 h-5 text-blue-400" />;
        }
    };

    return (
        <div className="space-y-6 max-w-4xl mx-auto p-4 md:p-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-gold">Notifications</h1>
                    <p className="text-[var(--text-secondary)] mt-1">Stay updated with service alerts and promotions.</p>
                </div>
                {notifications.length > 0 && onClearAll && (
                    <Button variant="ghost" className="text-[var(--text-secondary)] hover:text-[var(--gold-primary)] transition-colors" onClick={onClearAll}>
                        Clear All
                    </Button>
                )}
            </div>

            <div className="space-y-4">
                {notifications.length > 0 ? (
                    notifications.map((notification, index) => (
                        <div
                            key={notification._id || notification.id || index}
                            className={cn(
                                "flex items-start gap-4 p-4 rounded-xl border transition-all duration-300 relative group overflow-hidden",
                                notification.isRead
                                    ? "glass border-white/5 opacity-70"
                                    : "bg-black/40 border-[var(--gold-primary)]/30 backdrop-blur-md shadow-[0_4px_20px_-5px_rgba(251,191,36,0.15)]"
                            )}
                        >
                            {/* Unread indicator bar */}
                            {!notification.isRead && (
                                <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-gold shadow-[0_0_10px_rgba(251,191,36,0.5)]" />
                            )}
                            
                            <div className={cn(
                                "w-10 h-10 rounded-full flex items-center justify-center shrink-0 border relative z-10",
                                notification.type === 'success' ? "bg-emerald-500/10 border-emerald-500/20 shadow-[0_0_15px_rgba(16,185,129,0.15)]" :
                                    notification.type === 'warning' ? "bg-amber-500/10 border-amber-500/20 shadow-[0_0_15px_rgba(245,158,11,0.15)]" :
                                        notification.type === 'error' ? "bg-red-500/10 border-red-500/20 shadow-[0_0_15px_rgba(239,68,68,0.15)]" :
                                            "bg-blue-500/10 border-blue-500/20 shadow-[0_0_15px_rgba(59,130,246,0.15)]"
                            )}>
                                {getIcon(notification.type)}
                            </div>

                            <div className="flex-1 relative z-10">
                                <div className="flex justify-between items-start">
                                    <h3 className={cn("font-medium tracking-wide transition-colors", notification.isRead ? "text-[var(--text-secondary)]" : "text-white")}>
                                        {notification.title}
                                    </h3>
                                    <span className="text-xs text-[var(--text-secondary)] whitespace-nowrap ml-4 flex items-center gap-1 font-mono">
                                        <Clock className="w-3 h-3" />
                                        {new Date(notification.createdAt).toLocaleDateString()}
                                    </span>
                                </div>
                                <p className={cn(
                                    "text-sm mt-1 leading-relaxed transition-colors",
                                    notification.isRead ? "text-zinc-500" : "text-zinc-300"
                                )}>
                                    {notification.message}
                                </p>
                            </div>

                            {!notification.isRead && onMarkAsRead && (
                                <div className="absolute right-4 bottom-4 opacity-0 group-hover:opacity-100 transition-opacity z-20">
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-6 text-xs text-[var(--gold-primary)] hover:text-yellow-300 hover:bg-gold-500/10 rounded-full"
                                        onClick={() => onMarkAsRead(notification.id)}
                                    >
                                        Mark as Read
                                    </Button>
                                </div>
                            )}
                        </div>
                    ))
                ) : (
                    <div className="flex flex-col items-center justify-center py-24 glass rounded-xl border border-dashed border-white/10">
                        <div className="w-16 h-16 rounded-full bg-black/50 border border-white/5 shadow-inner flex items-center justify-center mb-6">
                            <Bell className="w-8 h-8 text-[var(--gold-primary)] opacity-70" />
                        </div>
                        <h3 className="text-xl font-medium text-white mb-2 tracking-wide">All caught up</h3>
                        <p className="text-[var(--text-secondary)] text-center max-w-sm">
                            You have no new notifications at this time.
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
};
