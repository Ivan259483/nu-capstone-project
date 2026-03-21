import React from 'react';
import { FileText, Download, CheckCircle, Clock } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export const DocumentsAndWaivers: React.FC = () => {
    // Mock data for the checklist demonstration
    const documents = [
        {
            id: 'WAI-1001',
            type: 'Service Waiver',
            title: 'AutoSPF+ Premium Detail Waiver',
            date: '2026-02-15',
            status: 'Signed',
            icon: FileText
        },
        {
            id: 'REC-2900',
            type: 'Receipt',
            title: 'Payment Receipt - ORD-9923',
            date: '2026-02-10',
            status: 'Available',
            icon: Download
        },
        {
            id: 'REP-403',
            type: 'Inspection Report',
            title: 'Pre-Service Damage Report',
            date: '2026-01-28',
            status: 'Available',
            icon: CheckCircle
        }
    ];

    return (
        <div className="space-y-6 max-w-7xl mx-auto p-4 md:p-6 lg:p-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-white">Documents & Waivers</h1>
                    <p className="text-zinc-400 mt-1">Access your service agreements, receipts, and inspection reports.</p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {documents.map((doc, idx) => (
                    <Card key={idx} className="bg-zinc-900/50 border-zinc-800 hover:border-zinc-700 transition-colors">
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-lg font-medium text-zinc-300 flex items-center gap-2">
                                <doc.icon className="w-5 h-5 text-indigo-400" />
                                {doc.type}
                            </CardTitle>
                            <Badge variant="outline" className={
                                doc.status === 'Signed' ? 'border-emerald-500/30 text-emerald-400 bg-emerald-500/10' :
                                    'border-indigo-500/30 text-indigo-400 bg-indigo-500/10'
                            }>
                                {doc.status}
                            </Badge>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-2 mt-4">
                                <p className="text-white font-medium">{doc.title}</p>
                                <div className="flex items-center text-sm text-zinc-500 gap-1">
                                    <Clock className="w-4 h-4" />
                                    {doc.date}
                                </div>
                            </div>
                            <Button variant="outline" className="w-full mt-6 bg-zinc-900 border-zinc-700 text-white hover:bg-zinc-800">
                                <Download className="w-4 h-4 mr-2" /> Download PDF
                            </Button>
                        </CardContent>
                    </Card>
                ))}
            </div>
        </div>
    );
};
