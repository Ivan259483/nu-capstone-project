import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Shield, CreditCard, Banknote, PenTool, X, Car, Calendar, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import SignaturePad from '@/components/SignaturePad';
import { Booking } from '@/types';

type WarrantyReceiptModalProps = {
    job: Booking;
    onClose: () => void;
    onSubmit: (data: any) => Promise<void>;
};

const WARRANTY_TYPES = [
    'SPF80', 'SPF89', 'SPF99', 'SPF101', 
    'PPF', 'PPF Ceramic Tint', 'Undercoating', 'Others'
];

export default function WarrantyReceiptModal({ job, onClose, onSubmit }: WarrantyReceiptModalProps) {
    const [signature, setSignature] = useState<string | null>(null);
    const [formData, setFormData] = useState({
        warrantyType: 'SPF101',
        otherWarrantyDetails: '',
        warrantyPeriod: '10 YEARS WARRANTY + FREE K REBOOT + FREE FULL RECOAT AFTER 5 YEARS',
        amountPaid: job.totalPrice?.toString() || '0',
        paymentMethod: 'cash' as 'cash' | 'others',
        paymentExtent: 'full' as 'partial' | 'full',
        checkerName: '',
        installationDate: new Date().toISOString().split('T')[0],
        existingFwsAndShade: '',
        reasonForChanging: ''
    });
    
    const [submitting, setSubmitting] = useState(false);

    const handleFieldChange = (field: string, value: string) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!signature) {
            alert('Please provide a signature before saving.');
            return;
        }

        setSubmitting(true);
        try {
            const finalWarrantyType = formData.warrantyType === 'Others' 
                ? `Others: ${formData.otherWarrantyDetails}` 
                : formData.warrantyType;

            await onSubmit({
                warrantyType: finalWarrantyType,
                warrantyPeriod: formData.warrantyPeriod,
                customerSignature: signature,
                amountPaid: parseFloat(formData.amountPaid),
                paymentMethod: formData.paymentMethod,
                paymentExtent: formData.paymentExtent,
                checkerName: formData.checkerName,
                installationDate: formData.installationDate,
                existingFwsAndShade: formData.existingFwsAndShade,
                reasonForChanging: formData.reasonForChanging
            });
        } catch (error) {
            console.error('Failed to submit warranty receipt:', error);
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
                <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 20 }}
                    className="relative w-full max-w-4xl max-h-[90vh] overflow-y-auto bg-black/90 border border-brand-primary/20 rounded-2xl shadow-2xl custom-scrollbar"
                >
                    <button 
                        onClick={onClose}
                        className="absolute top-6 right-6 text-gray-400 hover:text-white transition-colors"
                    >
                        <X className="w-6 h-6" />
                    </button>

                    <form onSubmit={handleSubmit} className="p-8 space-y-8">
                        {/* Header */}
                        <div className="text-center space-y-2">
                            <h2 className="text-3xl font-orbitron font-bold text-transparent bg-clip-text bg-gradient-to-r from-brand-primary to-brand-secondary">
                                AUTOSPF+ Service Receipt
                            </h2>
                            <p className="text-gray-400">Warranty Certification &amp; Acknowledgement</p>
                        </div>

                        {/* Customer & Vehicle Info Recap */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 rounded-xl bg-white/5 border border-white/10">
                            <div>
                                <p className="text-sm text-gray-400">Customer</p>
                                <p className="font-semibold text-white">{job.customerName}</p>
                            </div>
                            <div>
                                <p className="text-sm text-gray-400">Service</p>
                                <p className="font-semibold text-white truncate">{job.serviceType}</p>
                            </div>
                            <div>
                                <p className="text-sm text-gray-400">Vehicle</p>
                                <p className="font-semibold text-white">{job.vehicleYear} {job.vehicleMake} {job.vehicleModel}</p>
                            </div>
                            <div>
                                <p className="text-sm text-gray-400">Plate</p>
                                <p className="font-semibold text-brand-primary">{job.vehiclePlate}</p>
                            </div>
                        </div>

                        <div className="grid md:grid-cols-2 gap-8">
                            {/* Warranty Period Section */}
                            <div className="space-y-4">
                                <h3 className="text-lg font-orbitron font-semibold text-brand-primary flex items-center gap-2">
                                    <Shield className="w-5 h-5" /> Warranty Information
                                </h3>
                                
                                <div className="space-y-3">
                                    <label className="block text-sm text-gray-400 mb-1">Service Availed:</label>
                                    <div className="grid grid-cols-2 gap-2">
                                        {WARRANTY_TYPES.map(type => (
                                            <label key={type} className="flex items-center gap-2 text-white">
                                                <input 
                                                    type="radio" 
                                                    name="warrantyType" 
                                                    value={type} 
                                                    checked={formData.warrantyType === type}
                                                    onChange={() => handleFieldChange('warrantyType', type)}
                                                    className="text-brand-primary focus:ring-brand-primary bg-black border-gray-600"
                                                />
                                                <span className="text-sm">{type}</span>
                                            </label>
                                        ))}
                                    </div>
                                    {formData.warrantyType === 'Others' && (
                                        <input
                                            type="text"
                                            placeholder="Specify what type of service..."
                                            value={formData.otherWarrantyDetails}
                                            onChange={e => handleFieldChange('otherWarrantyDetails', e.target.value)}
                                            className="w-full bg-white/5 border border-white/10 rounded-lg p-3 text-white focus:border-brand-primary transition-colors"
                                            required
                                        />
                                    )}
                                </div>

                                <div>
                                    <label className="block text-sm text-gray-400 mb-1">Warranty Period:</label>
                                    <input
                                        type="text"
                                        value={formData.warrantyPeriod}
                                        onChange={e => handleFieldChange('warrantyPeriod', e.target.value)}
                                        className="w-full bg-white/5 border border-white/10 rounded-lg p-3 text-white focus:border-brand-primary transition-colors"
                                        required
                                    />
                                </div>
                            </div>

                            {/* Acknowledgement Receipt Section */}
                            <div className="space-y-4">
                                <h3 className="text-lg font-orbitron font-semibold text-brand-primary flex items-center gap-2">
                                    <FileText className="w-5 h-5" /> Receipt Details
                                </h3>
                                
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm text-gray-400 mb-1">Amount PHP</label>
                                        <div className="relative">
                                            <Banknote className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                                            <input
                                                type="number"
                                                value={formData.amountPaid}
                                                onChange={e => handleFieldChange('amountPaid', e.target.value)}
                                                className="w-full pl-10 bg-white/5 border border-white/10 rounded-lg p-3 text-white focus:border-brand-primary transition-colors"
                                                required
                                            />
                                        </div>
                                    </div>

                                    <div className="flex gap-2">
                                        <div className="flex-1">
                                            <label className="block text-sm text-gray-400 mb-1">Type</label>
                                            <select 
                                                value={formData.paymentMethod}
                                                onChange={e => handleFieldChange('paymentMethod', e.target.value)}
                                                className="w-full bg-white/5 border border-white/10 rounded-lg p-3 text-white focus:border-brand-primary transition-colors app-select"
                                            >
                                                <option value="cash">Cash</option>
                                                <option value="others">Others / Bank</option>
                                            </select>
                                        </div>
                                        <div className="flex-1">
                                            <label className="block text-sm text-gray-400 mb-1">Status</label>
                                            <select 
                                                value={formData.paymentExtent}
                                                onChange={e => handleFieldChange('paymentExtent', e.target.value)}
                                                className="w-full bg-white/5 border border-white/10 rounded-lg p-3 text-white focus:border-brand-primary transition-colors app-select"
                                            >
                                                <option value="full">Full</option>
                                                <option value="partial">Partial</option>
                                            </select>
                                        </div>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm text-gray-400 mb-1">Detailer/Checker Name</label>
                                        <input
                                            type="text"
                                            value={formData.checkerName}
                                            onChange={e => handleFieldChange('checkerName', e.target.value)}
                                            className="w-full bg-white/5 border border-white/10 rounded-lg p-3 text-white focus:border-brand-primary transition-colors"
                                            required
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm text-gray-400 mb-1">Installation Date</label>
                                        <div className="relative">
                                            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                                            <input
                                                type="date"
                                                value={formData.installationDate}
                                                onChange={e => handleFieldChange('installationDate', e.target.value)}
                                                className="w-full pl-10 bg-white/5 border border-white/10 rounded-lg p-3 text-white focus:border-brand-primary transition-colors"
                                                required
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Extra AutoSPF Intake details */}
                        <div className="grid grid-cols-2 gap-4">
                             <div>
                                <label className="block text-sm text-gray-400 mb-1">Existing FWS &amp; Shade</label>
                                <input
                                    type="text"
                                    value={formData.existingFwsAndShade}
                                    onChange={e => handleFieldChange('existingFwsAndShade', e.target.value)}
                                    className="w-full bg-white/5 border border-white/10 rounded-lg p-3 text-white focus:border-brand-primary transition-colors"
                                />
                            </div>
                             <div>
                                <label className="block text-sm text-gray-400 mb-1">Reason for Changing</label>
                                <input
                                    type="text"
                                    value={formData.reasonForChanging}
                                    onChange={e => handleFieldChange('reasonForChanging', e.target.value)}
                                    className="w-full bg-white/5 border border-white/10 rounded-lg p-3 text-white focus:border-brand-primary transition-colors"
                                />
                            </div>
                        </div>

                        {/* Signature Section */}
                        <div className="bg-white/5 rounded-xl border border-brand-primary/20 p-6 overflow-hidden">
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="text-lg font-orbitron font-semibold text-brand-primary">
                                    Conforme (Client Signature)
                                </h3>
                                <div className="text-xs text-gray-400 italic">
                                    I acknowledge receipt and delivery of the service carefully inspected.
                                </div>
                            </div>
                            
                            <div className="bg-white rounded-xl overflow-hidden shadow-inner">
                                <SignaturePad 
                                    onChange={setSignature}
                                    height={200}
                                    className="w-full"
                                />
                            </div>
                            {!signature && (
                                <p className="text-brand-primary text-sm mt-2 text-center animate-pulse">
                                    Signature required to complete job
                                </p>
                            )}
                        </div>

                        <div className="pt-6 border-t border-white/10 flex justify-end gap-4">
                            <Button
                                variant="outline"
                                onClick={onClose}
                                disabled={submitting}
                                type="button"
                            >
                                Cancel
                            </Button>
                            <Button
                                variant="default"
                                disabled={!signature || submitting}
                                type="submit"
                            >
                                {submitting ? 'Authenticating...' : 'Sign & Complete Job'}
                            </Button>
                        </div>
                    </form>
                </motion.div>
            </div>
        </AnimatePresence>
    );
}
