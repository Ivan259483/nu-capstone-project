import { useState } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Service } from '@/types';
import { AdminServicesLivePreview } from '@/components/admin/AdminServicesLivePreview';

interface ServicesPricingProps {
    services: Service[];
    onRefresh: () => void | Promise<void>;
}

export function ServicesPricing({ services, onRefresh }: ServicesPricingProps) {
    const [refreshing, setRefreshing] = useState(false);

    const handleRefresh = async () => {
        setRefreshing(true);
        try {
            await onRefresh();
        } finally {
            setRefreshing(false);
        }
    };

    return (
        <div className="space-y-6 text-slate-900">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-blue-600">Services catalog</p>
                    <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-950">SPF packages & public pricing</h1>
                    <p className="mt-1 max-w-2xl text-sm font-medium text-slate-500">
                        Use the live preview below: pick a vehicle tab, tap <span className="font-medium text-slate-600">Edit</span> on a
                        card, update copy and prices, then save.
                    </p>
                </div>
                <Button
                    variant="outline"
                    onClick={handleRefresh}
                    disabled={refreshing}
                    className="h-10 border-0 bg-white text-slate-700 shadow-[0_8px_28px_-8px_rgba(15,23,42,0.12),0_2px_8px_rgba(15,23,42,0.05)] hover:bg-slate-50/90"
                >
                    {refreshing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                    Refresh
                </Button>
            </div>

            <AdminServicesLivePreview services={services} onRefresh={handleRefresh} />
        </div>
    );
}
