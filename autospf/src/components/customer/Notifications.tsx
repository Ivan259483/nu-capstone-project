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
                    <h1 className="text-3xl font-bold text-white">Notifications</h1>
                    <p className="text-zinc-400 mt-1">Stay updated with service alerts and promotions.</p>
                </div>
                {notifications.length > 0 && onClearAll && (
                    <Button variant="ghost" className="text-zinc-500 hover:text-white" onClick={onClearAll}>
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
                                "flex items-start gap-4 p-4 rounded-xl border transition-colors relative group",
                                notification.isRead
                                    ? "bg-zinc-900/20 border-zinc-800"
                                    : "bg-zinc-900/50 border-zinc-700 shadow-sm shadow-indigo-500/5"
                            )}
                        >
                            <div className={cn(
                                "w-10 h-10 rounded-full flex items-center justify-center shrink-0 border",
                                notification.type === 'success' ? "bg-emerald-500/10 border-emerald-500/20" :
                                    notification.type === 'warning' ? "bg-amber-500/10 border-amber-500/20" :
                                        notification.type === 'error' ? "bg-red-500/10 border-red-500/20" :
                                            "bg-blue-500/10 border-blue-500/20"
                            )}>
                                {getIcon(notification.type)}
                            </div>

                            <div className="flex-1">
                                <div className="flex justify-between items-start">
                                    <h3 className={cn("font-medium", notification.isRead ? "text-zinc-400" : "text-white")}>
                                        {notification.title}
                                    </h3>
                                    <span className="text-xs text-zinc-500 whitespace-nowrap ml-4 flex items-center gap-1">
                                        <Clock className="w-3 h-3" />
                                        {new Date(notification.createdAt).toLocaleDateString()}
                                    </span>
                                </div>
                                <p className="text-sm text-zinc-500 mt-1 leading-relaxed">
                                    {notification.message}
                                </p>
                            </div>

                            {!notification.isRead && onMarkAsRead && (
                                <div className="absolute right-4 bottom-4 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-6 text-xs text-indigo-400 hover:text-indigo-300 hover:bg-indigo-950/20"
                                        onClick={() => onMarkAsRead(notification.id)}
                                    >
                                        Mark as Read
                                    </Button>
                                </div>
                            )}
                        </div>
                    ))
                ) : (
                    <div className="flex flex-col items-center justify-center py-24 bg-zinc-900/20 rounded-xl border border-dashed border-zinc-800">
                        <div className="w-16 h-16 rounded-full bg-zinc-800/50 flex items-center justify-center mb-6">
                            <Bell className="w-8 h-8 text-zinc-600" />
                        </div>
                        <h3 className="text-xl font-medium text-white mb-2">All caught up</h3>
                        <p className="text-zinc-500 text-center max-w-sm">
                            You have no new notifications at this time.
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
};
