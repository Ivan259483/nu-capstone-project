import { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import SignaturePad from '../SignaturePad';
import type { Booking } from '@/types';
import { FileText, Smartphone, CreditCard, Banknote, SplitSquareVertical } from 'lucide-react';

interface CheckInDialogProps {
    booking: Booking;
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (amount: number, method: string, signature: string) => Promise<void>;
    theme?: string;
}

const paymentMethods = [
    { id: 'cash', label: 'Cash', icon: Banknote },
    { id: 'gcash', label: 'GCash', icon: Smartphone },
    { id: 'card', label: 'Credit Card', icon: CreditCard },
    { id: 'maya', label: 'Maya', icon: Smartphone },
    { id: 'split', label: 'Split/Other', icon: SplitSquareVertical },
];

export function CheckInDialog({ booking, isOpen, onClose, onSubmit, theme = 'dark' }: CheckInDialogProps) {
    const isDark = theme === 'dark';

    const [paymentMethod, setPaymentMethod] = useState<string>('cash');
    const [amountStr, setAmountStr] = useState<string>('');
    const [signature, setSignature] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const minDownpayment = useMemo(() => {
        const total = booking.totalPrice || booking.totalAmount || 0;
        return total * 0.3; // 30% strictly enforced
    }, [booking]);

    const handleSubmit = async () => {
        const amt = parseFloat(amountStr || '0');
        if (amt < minDownpayment) {
            toast.error(`A minimum 30% down-payment of ₱${minDownpayment.toFixed(2)} is required.`);
            return;
        }
        if (!signature) {
            toast.error('Customer signature is required for the Legal Terms & Conditions waiver.');
            return;
        }

        setIsSubmitting(true);
        try {
            await onSubmit(amt, paymentMethod, signature);
            setAmountStr('');
            setSignature(null);
        } catch (error: any) {
            console.error('Check-in error', error);
            // Let the parent show the error toast
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && !isSubmitting && onClose()}>
            <DialogContent className={`max-w-md ${isDark ? 'bg-[#08080a] border-zinc-800 text-zinc-100' : 'bg-white border-gray-200 text-gray-900'} p-0 overflow-hidden`}>
                <div className="h-[2px] w-full bg-gradient-to-r from-transparent via-orange-500 to-transparent opacity-80" />
                <DialogHeader className="pt-6 px-6 pb-2">
                    <DialogTitle className="text-xl flex items-center gap-2">
                        <FileText className="w-5 h-5 text-orange-500" />
                        Check-in & Down Payment
                    </DialogTitle>
                </DialogHeader>

                <div className="px-6 py-4 space-y-5">
                    <div className={`p-4 rounded-xl border ${isDark ? 'bg-orange-500/10 border-orange-500/20 text-orange-100' : 'bg-orange-50 border-orange-200 text-orange-900'}`}>
                        <div className="text-sm font-semibold opacity-90">AutoSPF+ Policy Enforcement</div>
                        <p className="text-xs mt-1.5 opacity-80 leading-relaxed">
                            To check-in the vehicle and start the detailing service, a minimum 30% down payment is required along with a digital signature binding to our General Terms & Conditions.
                        </p>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className={`p-4 rounded-xl ${isDark ? 'bg-zinc-900/50' : 'bg-gray-50'}`}>
                            <Label className="text-xs uppercase tracking-wider opacity-60">Total Bill</Label>
                            <div className="text-xl font-bold mt-1">₱{(booking.totalPrice || booking.totalAmount || 0).toLocaleString()}</div>
                        </div>
                        <div className={`p-4 rounded-xl ${isDark ? 'bg-zinc-900/50' : 'bg-gray-50'}`}>
                            <Label className="text-xs uppercase tracking-wider opacity-60">Min. Deposit (30%)</Label>
                            <div className="text-xl font-bold mt-1 text-orange-500">₱{minDownpayment.toLocaleString()}</div>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <div>
                            <Label className="text-sm font-semibold mb-2 block">Payment Amount Received</Label>
                            <div className="relative">
                                <span className="absolute left-4 top-1/2 -translate-y-1/2 font-semibold">₱</span>
                                <Input
                                    type="number"
                                    min={minDownpayment}
                                    placeholder={minDownpayment.toFixed(2)}
                                    className={`pl-8 h-12 text-lg font-mono ${isDark ? 'bg-zinc-900 border-zinc-700' : 'bg-white border-gray-300'}`}
                                    value={amountStr}
                                    onChange={(e) => setAmountStr(e.target.value)}
                                />
                            </div>
                        </div>

                        <div>
                            <Label className="text-sm font-semibold mb-2 block">Payment Method</Label>
                            <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                                <SelectTrigger className={`h-12 ${isDark ? 'bg-zinc-900 border-zinc-700' : 'bg-white border-gray-300'}`}>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent className={isDark ? 'bg-zinc-900 border-zinc-800 text-white' : 'bg-white text-gray-900'}>
                                    {paymentMethods.map(m => (
                                        <SelectItem key={m.id} value={m.id}>
                                            <div className="flex items-center gap-2">
                                                <m.icon className="w-4 h-4 opacity-70" />
                                                <span>{m.label}</span>
                                            </div>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <div className="pt-2">
                        <Label className="text-sm font-semibold mb-2 flex items-center justify-between">
                            <span>Customer Signature</span>
                            {signature && <button className="text-xs text-orange-500 hover:text-orange-400" onClick={() => setSignature(null)}>Clear</button>}
                        </Label>
                        <div className="text-xs opacity-70 mb-3 leading-relaxed">
                            By signing, the customer acknowledges and agrees to the AutoSPF+ Paint Protection Film General Terms and Conditions.
                        </div>
                        {signature ? (
                            <div className={`p-4 rounded-xl flex justify-center items-center ${isDark ? 'bg-zinc-900/80 border border-zinc-800' : 'bg-gray-50 border border-gray-200'}`}>
                                <img src={signature} alt="Customer Signature" className="h-[120px] object-contain invert-[10%]" style={!isDark ? {filter: 'invert(1)'} : {}} />
                            </div>
                        ) : (
                            <SignaturePad
                                onChange={(data) => setSignature(data)}
                                height={150}
                            />
                        )}
                    </div>
                </div>

                <DialogFooter className={`p-6 pt-4 border-t ${isDark ? 'border-zinc-800/60 bg-zinc-900/30' : 'border-gray-100 bg-gray-50'}`}>
                    <Button variant="ghost" onClick={onClose} disabled={isSubmitting} className={!isDark ? 'hover:bg-gray-200' : ''}>Cancel</Button>
                    <Button
                        onClick={handleSubmit}
                        disabled={isSubmitting || !signature || parseFloat(amountStr || '0') < minDownpayment}
                        className="bg-orange-600 hover:bg-orange-500 text-white shadow-lg"
                    >
                        {isSubmitting ? 'Processing...' : 'Confirm Check-In'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
