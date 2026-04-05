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
                    <h1 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-gold">Documents & Waivers</h1>
                    <p className="text-[var(--text-secondary)] mt-1">Access your service agreements, receipts, and inspection reports.</p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {documents.map((doc, idx) => (
                    <Card key={idx} className="glass border-white/5 hover:border-[var(--gold-primary)]/50 transition-colors duration-300 relative overflow-hidden group">
                        <div className="absolute inset-0 bg-gradient-to-br from-[var(--gold-primary)]/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                        
                        <CardHeader className="flex flex-row items-center justify-between pb-2 relative z-10">
                            <CardTitle className="text-lg font-medium text-white flex items-center gap-2 tracking-wide">
                                <doc.icon className="w-5 h-5 text-[var(--gold-primary)] drop-shadow-[0_0_8px_rgba(251,191,36,0.5)]" />
                                {doc.type}
                            </CardTitle>
                            <Badge variant="outline" className={
                                doc.status === 'Signed' ? 'border-emerald-500/30 text-emerald-400 bg-emerald-500/10 backdrop-blur-md' :
                                    'border-[var(--gold-primary)]/30 text-[var(--gold-primary)] bg-gold-500/10 backdrop-blur-md'
                            }>
                                {doc.status}
                            </Badge>
                        </CardHeader>
                        <CardContent className="relative z-10">
                            <div className="space-y-2 mt-4">
                                <p className="text-white font-medium tracking-tight text-lg">{doc.title}</p>
                                <div className="flex items-center text-sm text-[var(--text-secondary)] gap-1">
                                    <Clock className="w-4 h-4 opacity-70" />
                                    {doc.date}
                                </div>
                            </div>
                            <Button variant="outline" className="w-full mt-6 bg-black/40 border-white/10 text-white hover:text-[var(--gold-primary)] hover:border-[var(--gold-primary)] hover:bg-gold-500/10 transition-colors backdrop-blur-md">
                                <Download className="w-4 h-4 mr-2" /> Download PDF
                            </Button>
                        </CardContent>
                    </Card>
                ))}
            </div>
        </div>
    );
};
