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
            <DialogContent className="bg-zinc-900 border-zinc-800 text-white sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Car className="w-5 h-5 text-indigo-400" />
                        {vehicle ? 'Edit Vehicle' : 'Add New Vehicle'}
                    </DialogTitle>
                    <DialogDescription className="text-zinc-400">
                        Enter your vehicle details to use for future bookings.
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-4 py-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="make" className="text-slate-300">Make</Label>
                            <Input
                                id="make"
                                placeholder="e.g. Toyota"
                                value={make}
                                onChange={(e) => setMake(e.target.value)}
                                className="bg-zinc-950 border-zinc-800 focus:ring-indigo-500"
                                required
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="model" className="text-slate-300">Model</Label>
                            <Input
                                id="model"
                                placeholder="e.g. Camry"
                                value={model}
                                onChange={(e) => setModel(e.target.value)}
                                className="bg-zinc-950 border-zinc-800 focus:ring-indigo-500"
                                required
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="year" className="text-slate-300">Year</Label>
                            <Input
                                id="year"
                                placeholder="e.g. 2022"
                                value={year}
                                onChange={(e) => setYear(e.target.value)}
                                className="bg-zinc-950 border-zinc-800 focus:ring-indigo-500"
                                type="number"
                                min="1900"
                                max={new Date().getFullYear() + 1}
                                required
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="color" className="text-slate-300">Color</Label>
                            <Input
                                id="color"
                                placeholder="e.g. Black"
                                value={color}
                                onChange={(e) => setColor(e.target.value)}
                                className="bg-zinc-950 border-zinc-800 focus:ring-indigo-500"
                                required
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="plateNumber" className="text-slate-300">Plate Number</Label>
                        <Input
                            id="plateNumber"
                            placeholder="e.g. ABC 1234"
                            value={plateNumber}
                            onChange={(e) => setPlateNumber(e.target.value)}
                            className="bg-zinc-950 border-zinc-800 focus:ring-indigo-500 uppercase"
                            required
                        />
                    </div>

                    <div className="flex justify-end gap-3 pt-4 border-t border-zinc-800 mt-6">
                        <Button
                            type="button"
                            variant="ghost"
                            onClick={onClose}
                            className="text-zinc-400 hover:text-white"
                            disabled={isSaving}
                        >
                            Cancel
                        </Button>
                        <Button
                            type="submit"
                            className="bg-indigo-600 hover:bg-indigo-700 text-white"
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
