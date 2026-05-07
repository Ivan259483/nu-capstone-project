import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Car, Loader2 } from 'lucide-react';
import type { Vehicle } from '@/types';

interface VehicleModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (vehicle: Partial<Vehicle>, id?: string) => Promise<void>;
    vehicle?: Vehicle | null;
}

export const VehicleModal: React.FC<VehicleModalProps> = ({
    isOpen,
    onClose,
    onSave,
    vehicle
}) => {
    const [make, setMake] = useState('');
    const [model, setModel] = useState('');
    const [year, setYear] = useState('');
    const [color, setColor] = useState('');
    const [plateNumber, setPlateNumber] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        if (vehicle && isOpen) {
            setMake(vehicle.make || '');
            setModel(vehicle.model || '');
            setYear(vehicle.year || '');
            setColor(vehicle.color || '');
            setPlateNumber(vehicle.plateNumber || '');
        } else if (isOpen) {
            setMake('');
            setModel('');
            setYear('');
            setColor('');
            setPlateNumber('');
        }
    }, [vehicle, isOpen]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        // Basic validation
        if (!make || !model || !year || !color || !plateNumber) {
            return;
        }

        setIsSaving(true);
        try {
            await onSave({
                make,
                model,
                year,
                color,
                plateNumber
            }, vehicle?.id);
            onClose();
        } catch (error) {
            console.error('Failed to save vehicle:', error);
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="glass border-white/10 text-white sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Car className="w-5 h-5 text-[var(--gold-primary)]" />
                        {vehicle ? 'Edit Vehicle' : 'Add New Vehicle'}
                    </DialogTitle>
                    <DialogDescription className="text-[var(--text-secondary)]">
                        Enter your vehicle details to use for future bookings.
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-4 py-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="make" className="text-[var(--text-secondary)]">Make</Label>
                            <Input
                                id="make"
                                placeholder="e.g. Toyota"
                                value={make}
                                onChange={(e) => setMake(e.target.value)}
                                className="glass border-white/5 focus:border-[var(--gold-primary)]/50 focus:ring-1 focus:ring-[var(--gold-primary)] text-white placeholder-white/30"
                                required
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="model" className="text-[var(--text-secondary)]">Model</Label>
                            <Input
                                id="model"
                                placeholder="e.g. Camry"
                                value={model}
                                onChange={(e) => setModel(e.target.value)}
                                className="glass border-white/5 focus:border-[var(--gold-primary)]/50 focus:ring-1 focus:ring-[var(--gold-primary)] text-white placeholder-white/30"
                                required
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="year" className="text-[var(--text-secondary)]">Year</Label>
                            <Input
                                id="year"
                                placeholder="e.g. 2022"
                                value={year}
                                onChange={(e) => setYear(e.target.value)}
                                className="glass border-white/5 focus:border-[var(--gold-primary)]/50 focus:ring-1 focus:ring-[var(--gold-primary)] text-white placeholder-white/30"
                                type="number"
                                min="1900"
                                max={new Date().getFullYear() + 1}
                                required
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="color" className="text-[var(--text-secondary)]">Color</Label>
                            <Input
                                id="color"
                                placeholder="e.g. Black"
                                value={color}
                                onChange={(e) => setColor(e.target.value)}
                                className="glass border-white/5 focus:border-[var(--gold-primary)]/50 focus:ring-1 focus:ring-[var(--gold-primary)] text-white placeholder-white/30"
                                required
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="plateNumber" className="text-[var(--text-secondary)]">Plate Number</Label>
                        <Input
                            id="plateNumber"
                            placeholder="e.g. ABC 1234"
                            value={plateNumber}
                            onChange={(e) => setPlateNumber(e.target.value.toUpperCase())}
                            className="glass border-white/5 focus:border-[var(--gold-primary)]/50 focus:ring-1 focus:ring-[var(--gold-primary)] text-white placeholder-white/30 uppercase"
                            required
                        />
                    </div>

                    <div className="flex justify-end gap-3 pt-4 border-t border-white/10 mt-6">
                        <Button
                            type="button"
                            variant="ghost"
                            onClick={onClose}
                            className="text-[var(--text-secondary)] hover:text-white hover:bg-white/10"
                            disabled={isSaving}
                        >
                            Cancel
                        </Button>
                        <Button
                            type="submit"
                            className="bg-gradient-gold text-black hover:opacity-90 border-none shadow-[0_0_15px_rgba(251,191,36,0.3)] font-bold"
                            disabled={isSaving}
                        >
                            {isSaving ? (
                                <>
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                    Saving...
                                </>
                            ) : (
                                'Save Vehicle'
                            )}
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
};
