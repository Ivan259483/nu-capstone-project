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
        <div className="space-y-4 text-slate-900">
            <div className="flex flex-col gap-4 rounded-[18px] border border-slate-200/80 bg-white px-5 py-4 shadow-[0_14px_40px_-32px_rgba(15,23,42,0.3)] lg:flex-row lg:items-center lg:justify-between">
                <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-blue-600">Services catalog</p>
                    <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-950">SPF packages & public pricing</h1>
                    <p className="mt-1 max-w-2xl text-sm font-medium leading-relaxed text-slate-500">
                        Pick a vehicle, edit a package, and publish the updated pricing from the same card customers see.
                    </p>
                </div>
                <Button
                    variant="outline"
                    onClick={handleRefresh}
                    disabled={refreshing}
                    className="h-10 border-slate-200 bg-white text-slate-700 shadow-[0_8px_24px_-16px_rgba(15,23,42,0.45)] hover:bg-slate-50"
                >
                    {refreshing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                    Refresh
                </Button>
            </div>

            <AdminServicesLivePreview services={services} onRefresh={handleRefresh} />
        </div>
    );
}
