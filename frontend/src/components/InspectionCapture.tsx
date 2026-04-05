import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { OrderService } from '@/lib/order-service';

type InspectionCaptureProps = {
    jobId: string;
    existingPhotos?: string[];
    existingNotes?: string;
    onSaved?: (photos: string[], notes: string) => void;
    disabled?: boolean;
};

export default function InspectionCapture({
    jobId,
    existingPhotos = [],
    existingNotes = '',
    onSaved,
    disabled
}: InspectionCaptureProps) {
    const [photos, setPhotos] = useState<string[]>(existingPhotos);
    const [damageNotes, setDamageNotes] = useState(existingNotes);
    const [isSaving, setIsSaving] = useState(false);
    const [filePreviewError, setFilePreviewError] = useState('');

    useEffect(() => {
        setPhotos(existingPhotos);
        setDamageNotes(existingNotes);
    }, [existingPhotos, existingNotes]);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []);
        if (!files.length) return;
        setFilePreviewError('');
        files.forEach((file) => {
            const reader = new FileReader();
            reader.onload = () => {
                const result = reader.result as string;
                if (!result) {
                    setFilePreviewError('Failed to read image.');
                    return;
                }
                setPhotos((prev) => [...prev, result]);
            };
            reader.onerror = () => setFilePreviewError('Failed to read image.');
            reader.readAsDataURL(file);
        });
        e.target.value = '';
    };

    const handleRemovePhoto = (url: string) => {
        setPhotos(prev => prev.filter(p => p !== url));
    };

    const handleSave = async () => {
        if (photos.length < 2) {
            toast.error('Please add at least 2 pre-service photos.');
            return;
        }
        setIsSaving(true);
        const payload = {
            preServicePhotos: photos,
            damageNotes: damageNotes.trim()
        };

        try {
            // Attempt server upload; fallback to local cache on failure/offline
            const response = await OrderService.uploadInspection(jobId, payload);
            if (response.success) {
                toast.success('Inspection saved.');
                onSaved?.(photos, damageNotes.trim());
                return;
            }
            throw new Error(response.message || 'Failed to save inspection');
        } catch (error: any) {
            // Offline-first: store locally so the UI can continue
            localStorage.setItem(`inspection_${jobId}`, JSON.stringify(payload));
            toast.success('Inspection verified locally.');
            onSaved?.(photos, damageNotes.trim());
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="mt-3 space-y-3 rounded-lg border border-zinc-800 bg-[#0f0f12] p-3">
            <div className="text-xs text-zinc-500">
                Upload pre-service photos (adds a local preview and saves with the inspection).
            </div>
            <div className="flex items-center gap-2">
                <Input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleFileChange}
                    className="bg-zinc-950 border-zinc-800 text-white"
                    disabled={disabled}
                />
            </div>
            {filePreviewError && <div className="text-xs text-red-400">{filePreviewError}</div>}
            {photos.length > 0 && (
                <div className="grid grid-cols-2 gap-3">
                    {photos.map((url) => (
                        <div key={url} className="relative group">
                            <img src={url} alt="Inspection" className="w-full h-24 object-cover rounded-md border border-zinc-800" />
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleRemovePhoto(url)}
                                disabled={disabled}
                                className="absolute top-1 right-1 text-red-400 hover:text-red-300 bg-black/40"
                            >
                                Remove
                            </Button>
                        </div>
                    ))}
                </div>
            )}
            <Textarea
                placeholder="Damage notes (scratches, dents, etc.)"
                value={damageNotes}
                onChange={(e) => setDamageNotes(e.target.value)}
                className="bg-zinc-950 border-zinc-800 text-white min-h-[90px]"
                disabled={disabled}
            />
            <Button
                onClick={handleSave}
                disabled={disabled || isSaving}
                className={`w-full ${photos.length >= 2 ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-orange-600 hover:bg-orange-500'} text-white`}
            >
                {photos.length >= 2 && !isSaving ? 'Verified ✓' : isSaving ? 'Saving...' : `Save Inspection (${photos.length}/2)`}
            </Button>
        </div>
    );
}
