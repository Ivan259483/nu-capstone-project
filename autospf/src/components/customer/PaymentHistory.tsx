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
                    <h1 className="text-3xl font-bold text-white">Payment History</h1>
                    <p className="text-zinc-400 mt-1">View your past transactions and download receipts.</p>
                </div>
                <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center">
                        <CreditCard className="w-5 h-5 text-emerald-400" />
                    </div>
                    <div>
                        <p className="text-sm text-zinc-500">Total Spent</p>
                        <p className="text-xl font-bold text-white">{formatCurrency(totalSpent)}</p>
                    </div>
                </div>
            </div>

            <Card className="bg-zinc-900/40 border-zinc-800">
                <CardHeader>
                    <CardTitle className="text-white">Transaction Log</CardTitle>
                    <CardDescription>A list of all your service payments.</CardDescription>
                </CardHeader>
                <CardContent>
                    {transactions.length > 0 ? (
                        <div className="relative w-full overflow-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow className="border-zinc-800 hover:bg-zinc-800/50">
                                        <TableHead className="text-zinc-400">Date</TableHead>
                                        <TableHead className="text-zinc-400">Service</TableHead>
                                        <TableHead className="text-zinc-400">Invoice ID</TableHead>
                                        <TableHead className="text-zinc-400 text-right">Amount</TableHead>
                                        <TableHead className="text-zinc-400 text-center">Status</TableHead>
                                        <TableHead className="text-zinc-400 text-right">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {transactions.map((transaction) => (
                                        <TableRow key={transaction.id} className="border-zinc-800 hover:bg-zinc-800/50">
                                            <TableCell className="font-medium text-white">
                                                {new Date(transaction.date).toLocaleDateString()}
                                            </TableCell>
                                            <TableCell className="text-zinc-300">
                                                {transaction.serviceName}
                                                {transaction.addons && transaction.addons.length > 0 && (
                                                    <span className="ml-2 text-xs text-zinc-500 italic">
                                                        (+{transaction.addons.length})
                                                    </span>
                                                )}
                                            </TableCell>
                                            <TableCell className="text-zinc-500 font-mono text-xs">
                                                {transaction.invoiceId || `#INV-${transaction.id.slice(-6).toUpperCase()}`}
                                            </TableCell>
                                            <TableCell className="text-right text-white font-bold">
                                                {formatCurrency(transaction.totalPrice || transaction.totalAmount || 0)}
                                            </TableCell>
                                            <TableCell className="text-center">
                                                {getStatusBadge(transaction.paymentStatus || (transaction.status === 'completed' ? 'paid' : 'pending'))}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-zinc-400 hover:text-indigo-400 hover:bg-indigo-950/20">
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
                        <div className="text-center py-12 text-zinc-500">
                            <Receipt className="w-12 h-12 mx-auto mb-4 opacity-50" />
                            <p>No transactions found.</p>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
};
