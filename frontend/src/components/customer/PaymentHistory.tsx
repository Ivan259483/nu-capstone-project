import React from 'react';
import {
    Receipt,
    Download,
    CreditCard,
    CheckCircle,
    XCircle,
    AlertCircle,
    Clock
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatCurrency } from '@/lib/utils';
import type { Booking } from '@/types';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";

interface PaymentHistoryProps {
    bookings: Booking[];
}

export const PaymentHistory: React.FC<PaymentHistoryProps> = ({ bookings }) => {

    // Filter bookings that have some payment info or are completed
    const transactions = bookings.filter(b =>
        b.status === 'completed' || b.paymentStatus === 'paid' || b.totalPrice
    ).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    const getStatusBadge = (status?: string) => {
        switch (status) {
            case 'paid': return <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20">Paid</Badge>;
            case 'refunded': return <Badge className="bg-amber-500/10 text-amber-400 border-amber-500/20">Refunded</Badge>;
            case 'failed': return <Badge className="bg-red-500/10 text-red-400 border-red-500/20">Failed</Badge>;
            default: return <Badge variant="outline" className="text-zinc-500 border-zinc-700">Pending</Badge>;
        }
    };

    const totalSpent = transactions.reduce((sum, t) => sum + (t.totalPrice || t.totalAmount || 0), 0);

    return (
        <div className="space-y-6 max-w-6xl mx-auto p-4 md:p-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-gold">Payment History</h1>
                    <p className="text-[var(--text-secondary)] mt-1">View your past transactions and download receipts.</p>
                </div>
                <div className="glass border border-white/5 rounded-lg p-4 flex items-center gap-4 shadow-lg">
                    <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20">
                        <CreditCard className="w-5 h-5 text-emerald-400 drop-shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                    </div>
                    <div>
                        <p className="text-sm text-[var(--text-secondary)]">Total Spent</p>
                        <p className="text-xl font-bold text-white tracking-tight">{formatCurrency(totalSpent)}</p>
                    </div>
                </div>
            </div>

            <Card className="glass border-white/5 rounded-2xl overflow-hidden shadow-2xl">
                <CardHeader className="border-b border-white/5 bg-black/20">
                    <CardTitle className="text-white font-semibold">Transaction Log</CardTitle>
                    <CardDescription className="text-[var(--text-secondary)]">A list of all your service payments.</CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                    {transactions.length > 0 ? (
                        <div className="relative w-full overflow-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow className="border-white/5 bg-black/40 hover:bg-black/60">
                                        <TableHead className="text-[var(--text-secondary)] font-medium">Date</TableHead>
                                        <TableHead className="text-[var(--text-secondary)] font-medium">Service</TableHead>
                                        <TableHead className="text-[var(--text-secondary)] font-medium">Invoice ID</TableHead>
                                        <TableHead className="text-[var(--text-secondary)] font-medium text-right">Amount</TableHead>
                                        <TableHead className="text-[var(--text-secondary)] font-medium text-center">Status</TableHead>
                                        <TableHead className="text-[var(--text-secondary)] font-medium text-right">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {transactions.map((transaction) => (
                                        <TableRow key={transaction.id} className="border-white/5 hover:bg-white/5 transition-colors">
                                            <TableCell className="font-medium text-white">
                                                {new Date(transaction.date).toLocaleDateString()}
                                            </TableCell>
                                            <TableCell className="text-zinc-300">
                                                {transaction.serviceName}
                                                {transaction.addons && transaction.addons.length > 0 && (
                                                    <span className="ml-2 text-xs text-[var(--gold-primary)] italic opacity-80">
                                                        (+{transaction.addons.length})
                                                    </span>
                                                )}
                                            </TableCell>
                                            <TableCell className="text-[var(--text-secondary)] font-mono text-xs">
                                                {transaction.invoiceId || `#INV-${transaction.id.slice(-6).toUpperCase()}`}
                                            </TableCell>
                                            <TableCell className="text-right text-white font-bold tracking-tight">
                                                {formatCurrency(transaction.totalPrice || transaction.totalAmount || 0)}
                                            </TableCell>
                                            <TableCell className="text-center">
                                                {getStatusBadge(transaction.paymentStatus || (transaction.status === 'completed' ? 'paid' : 'pending'))}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-[var(--text-secondary)] hover:text-[var(--gold-primary)] hover:bg-gold-500/10 rounded-full transition-colors">
                                                    <Download className="w-4 h-4" />
                                                    <span className="sr-only">Download Receipt</span>
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center py-16 text-[var(--text-secondary)]">
                            <div className="w-16 h-16 rounded-full bg-black/40 border border-white/5 flex items-center justify-center mb-4">
                                <Receipt className="w-8 h-8 opacity-50" />
                            </div>
                            <h3 className="text-lg font-medium text-white mb-1">No transactions found</h3>
                            <p>You haven't made any payments yet.</p>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
};
