import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogOut, ClipboardList, Calendar, Package, Camera, MessageSquare, Clock, CheckCircle, Play, AlertTriangle, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { jobStorage, inventoryStorage, inventoryUsageStorage, customerNoteStorage } from '@/lib/storage';
import { InventoryService } from '@/lib/inventory-service-api';
import { OrderService } from '@/lib/order-service';
import type { Booking, InventoryItem, InventoryUsage, CustomerNote } from '@/types';

type TabType = 'queue' | 'schedule' | 'inventory' | 'photos' | 'notes';

export default function DetailerDashboard() {
    const navigate = useNavigate();
    const { user, logout } = useAuth();

    const [activeTab, setActiveTab] = useState<TabType>('queue');
    const [jobs, setJobs] = useState<Booking[]>([]);
    const [inventory, setInventory] = useState<InventoryItem[]>([]);
    const [inventoryUsage, setInventoryUsage] = useState<InventoryUsage[]>([]);
    const [customerNotes, setCustomerNotes] = useState<CustomerNote[]>([]);

    const [isLoading, setIsLoading] = useState(false);

    // Time tracking
    const [elapsedTime, setElapsedTime] = useState(0);
    const [activeJobStartTime, setActiveJobStartTime] = useState<number | null>(null);

    // Log usage modal
    const [showUsageModal, setShowUsageModal] = useState(false);
    const [selectedItem, setSelectedItem] = useState('');
    const [usageQuantity, setUsageQuantity] = useState('');

    // Note form
    const [newNote, setNewNote] = useState('');

    const loadData = useCallback(async () => {
        if (!user) return;
        setIsLoading(true);

        try {
            const response = await OrderService.getDetailerOrders();
            if (response.success) {
                setJobs(response.data);

                // Check for active job start time (derived from status)
                const activeJob = response.data.find((j: Booking) => j.status === 'in-progress');
                if (activeJob) {
                    // Estimate start time or use created/updated time if steps not granular check
                    // For now, simpler: just running timer if in-progress
                    if (!activeJobStartTime) setActiveJobStartTime(Date.now());
                }
            }

            // Fetch products/inventory from backend
            const productsRes = await InventoryService.getAllProducts();
            if (productsRes.success) {
                const mappedProducts: InventoryItem[] = productsRes.data.map((p: any) => ({
                    id: p.id,
                    name: p.name,
                    category: p.category?.name || 'Uncategorized',
                    stock: p.inventory,
                    unit: 'units',
                    minLevel: p.minLevel || 5,
                    cost: p.price,
                    supplier: p.supplier?.name || 'Manual'
                }));
                setInventory(mappedProducts);
            } else {
                setInventory(inventoryStorage.getAll()); // Fallback
            }

            setInventoryUsage(inventoryUsageStorage.getAll());
            setCustomerNotes(customerNoteStorage.getAll());

        } catch (error) {
            console.error('Failed to load detailer data:', error);
            setInventory(inventoryStorage.getAll());
        } finally {
            setIsLoading(false);
        }
    }, [user, activeJobStartTime]);

    useEffect(() => {
        if (!user || user.role !== 'detailer') {
            navigate('/');
            return;
        }

        loadData();
    }, [user, navigate, loadData]);

    // Timer effect
    useEffect(() => {
        if (!activeJobStartTime) return;

        const interval = setInterval(() => {
            setElapsedTime(Math.floor((Date.now() - activeJobStartTime) / 1000));
        }, 1000);

        return () => clearInterval(interval);
    }, [activeJobStartTime]);

    const handleLogout = () => {
        logout();
        navigate('/');
    };

    const formatElapsedTime = (seconds: number) => {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        return `${hours}h ${minutes}m`;
    };

    const handleStartJob = async (job: Booking) => {
        try {
            // Move to In Progress
            const response = await OrderService.updateProgress(job.id, undefined, undefined, false, 'in-progress');
            if (response.success) {
                setActiveJobStartTime(Date.now());
                loadData();
                toast.success('Job started!');
            } else {
                toast.error('Failed to start job');
            }
        } catch (error) {
            toast.error('Error starting job');
        }
    };

    const handleCompleteJob = async (job: Booking) => {
        try {
            // Move to Completed (Step index 4)
            const response = await OrderService.updateProgress(job.id, 4, 'completed');
            if (response.success) {
                setActiveJobStartTime(null);
                setElapsedTime(0);
                loadData();
                toast.success('Job completed!');
            } else {
                toast.error('Failed to complete job');
            }
        } catch (error) {
            toast.error('Error completing job');
        }
    };

    const handleToggleChecklist = async (job: Booking, stepIndex: number) => {
        // This would update individual steps status
        // For now, simpler to just assume sequential progress or implement granular step update API
        // Placeholder for future granular step updates
        toast.info('Step update not fully implemented yet');
    };

    const handleLogUsage = async () => {
        if (!selectedItem || !usageQuantity || !user) {
            toast.error('Please fill in all fields');
            return;
        }

        const item = inventory.find(i => i.id === selectedItem);
        if (!item) return;

        const usageAmount = parseFloat(usageQuantity);
        if (usageAmount > item.stock) {
            toast.error('Usage exceeds available stock!');
            return;
        }

        setIsLoading(true);
        const activeJob = jobs.find(j => j.status === 'in-progress');

        const usage: InventoryUsage = {
            id: `use-${Date.now()}`,
            itemId: item.id,
            itemName: item.name,
            quantity: usageAmount,
            unit: item.unit,
            jobId: activeJob?.id || 'general',
            detailerId: user.id,
            usedAt: new Date().toISOString(),
        };

        try {
            // Update inventory stock on backend
            const newStock = item.stock - usageAmount;
            const response = await InventoryService.updateProduct(item.id, { inventory: newStock });

            if (response.success) {
                inventoryUsageStorage.add(usage);
                toast.success('Usage logged and stock updated!');
                await loadData();
                setShowUsageModal(false);
                setSelectedItem('');
                setUsageQuantity('');
            } else {
                toast.error(response.message || 'Failed to update stock');
            }
        } catch (error) {
            console.error('Failed to log usage:', error);
            toast.error('Failed to sync usage with server');
        } finally {
            setIsLoading(false);
        }
    };

    const handleSaveNote = () => {
        if (!newNote.trim() || !user) {
            toast.error('Please enter a note');
            return;
        }

        const activeJob = jobs.find(j => j.status === 'in-progress');

        const note: CustomerNote = {
            id: `note-${Date.now()}`,
            jobId: activeJob?.id || 'general',
            detailerId: user.id,
            content: newNote,
            createdAt: new Date().toISOString(),
        };

        customerNoteStorage.add(note);
        loadData();
        setNewNote('');
        toast.success('Note saved!');
    };

    const activeJob = jobs.find(j => j.status === 'in-progress');
    const pendingJobs = jobs.filter(j => j.status === 'pending');
    const completedToday = jobs.filter(j => {
        if (j.status !== 'completed' || !j.serviceSteps) return false;
        // Check finding completed step
        const completedStep = j.serviceSteps.find(s => s.status === 'completed' && s.name === 'Ready');
        if (!completedStep || !completedStep.completedAt) return false;

        const today = new Date().toDateString();
        return new Date(completedStep.completedAt).toDateString() === today;
    }).length;

    const hoursLogged = jobs.reduce((acc, job) => {
        // Simple estimation: 1.5 hours per completed job for now as we don't track exact start/end in Order model yet
        if (job.status === 'completed') {
            return acc + 1.5;
        }
        return acc;
    }, 0);

    const tabs = [
        { id: 'queue' as TabType, label: 'Job Queue', icon: ClipboardList },
        { id: 'schedule' as TabType, label: 'Schedule', icon: Calendar },
        { id: 'inventory' as TabType, label: 'Inventory Used', icon: Package },
        { id: 'photos' as TabType, label: 'Before/After Photos', icon: Camera },
        { id: 'notes' as TabType, label: 'Customer Notes', icon: MessageSquare },
    ];

    const scheduleItems = [
        { time: '08:00 AM', customer: 'Robert Chen', status: 'COMPLETED', vehicle: '2024 Porsche 911 - Red', service: 'Ceramic Coating - 8 hours' },
        { time: '09:00 AM', customer: 'Sarah Johnson', status: 'IN PROGRESS', vehicle: '2023 Tesla Model 3 - White', service: 'Full Detail - 4 hours' },
        { time: '11:00 AM', customer: 'Jennifer Davis', status: 'PENDING', vehicle: '2021 Honda CR-V - Silver', service: 'Express Detail - 2 hours' },
        { time: '01:00 PM', customer: 'Mike Thompson', status: 'PENDING', vehicle: '2022 BMW M4 - Black', service: 'Paint Correction - 6 hours' },
        { time: '03:00 PM', customer: null, status: null, vehicle: null, service: 'No appointment scheduled' },
        { time: '05:00 PM', customer: null, status: null, vehicle: null, service: 'No appointment scheduled' },
    ];

    return (
        <div className="min-h-screen bg-hex-pattern text-white">
            {/* Header */}
            <header className="bg-zinc-900/50 backdrop-blur-xl border-b border-zinc-800 px-6 py-4 sticky top-0 z-50">
                <div className="max-w-7xl mx-auto flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-bold text-white tracking-tight">Detailer Dashboard</h1>
                        <p className="text-zinc-400">Welcome back, {user?.name}</p>
                        <Badge variant="outline" className="mt-1 border-orange-500 text-orange-400">Staff</Badge>
                    </div>
                    <Button variant="outline" onClick={handleLogout} className="flex items-center gap-2 border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-white">
                        <LogOut className="w-4 h-4" />
                        Logout
                    </Button>
                </div>
            </header>

            <div className="max-w-7xl mx-auto p-6 space-y-6">
                {/* Quick Stats */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <Card className="bg-zinc-900 border-zinc-800">
                        <CardContent className="p-4 flex items-center gap-4">
                            <div className="w-12 h-12 bg-orange-900/20 rounded-md flex items-center justify-center border border-orange-500/20">
                                <ClipboardList className="w-6 h-6 text-orange-400" />
                            </div>
                            <div>
                                <p className="text-sm text-zinc-400">Pending Jobs</p>
                                <p className="text-2xl font-bold text-white">{pendingJobs.length}</p>
                            </div>
                        </CardContent>
                    </Card>
                    <Card className="bg-zinc-900 border-zinc-800">
                        <CardContent className="p-4 flex items-center gap-4">
                            <div className="w-12 h-12 bg-orange-900/20 rounded-md flex items-center justify-center border border-orange-500/20">
                                <Clock className="w-6 h-6 text-orange-400" />
                            </div>
                            <div>
                                <p className="text-sm text-zinc-400">In Progress</p>
                                <p className="text-2xl font-bold text-orange-400">{activeJob ? 1 : 0}</p>
                            </div>
                        </CardContent>
                    </Card>
                    <Card className="bg-zinc-900 border-zinc-800">
                        <CardContent className="p-4 flex items-center gap-4">
                            <div className="w-12 h-12 bg-emerald-900/20 rounded-md flex items-center justify-center border border-emerald-500/20">
                                <CheckCircle className="w-6 h-6 text-emerald-400" />
                            </div>
                            <div>
                                <p className="text-sm text-zinc-400">Completed Today</p>
                                <p className="text-2xl font-bold text-white">{completedToday}</p>
                            </div>
                        </CardContent>
                    </Card>
                    <Card className="bg-zinc-900 border-zinc-800">
                        <CardContent className="p-4 flex items-center gap-4">
                            <div className="w-12 h-12 bg-purple-900/20 rounded-md flex items-center justify-center border border-purple-500/20">
                                <Clock className="w-6 h-6 text-purple-400" />
                            </div>
                            <div>
                                <p className="text-sm text-zinc-400">Hours Logged</p>
                                <p className="text-2xl font-bold text-white">{hoursLogged.toFixed(1)}</p>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Tabs */}
                <div className="flex gap-2 pb-2 overflow-x-auto">
                    {tabs.map((tab) => (
                        <Button
                            key={tab.id}
                            variant={activeTab === tab.id ? 'default' : 'outline'}
                            onClick={() => setActiveTab(tab.id)}
                            className={`flex items-center gap-2 rounded-full px-6 transition-all ${activeTab === tab.id
                                ? 'bg-[#F57C00] hover:bg-[#E65100] text-white shadow-lg shadow-orange-500/20 border-transparent'
                                : 'bg-transparent border-zinc-700 text-zinc-400 hover:text-white hover:bg-zinc-800'}`}
                        >
                            <tab.icon className="w-4 h-4" />
                            {tab.label}
                        </Button>
                    ))}
                </div>

                {/* Tab Content */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {activeTab === 'queue' && (
                        <>
                            {/* Active Job */}
                            <div className="lg:col-span-2 space-y-6">
                                <Card className="bg-[#121214] border-zinc-800 shadow-xl overflow-hidden">
                                    <CardHeader className="flex flex-row items-center justify-between border-b border-zinc-800 bg-[#1a1a1c]">
                                        <CardTitle className="text-[#f4f4f5]">Active Job</CardTitle>
                                        {activeJob && (
                                            <Badge className="bg-amber-900/30 text-amber-400 border border-amber-500/30">In Progress</Badge>
                                        )}
                                    </CardHeader>
                                    <CardContent className="p-6">
                                        {activeJob ? (
                                            <div className="space-y-6">
                                                {/* Time Tracking */}
                                                <div className="bg-orange-900/10 border border-orange-500/20 rounded-md p-6 flex items-center justify-between">
                                                    <div className="flex items-center gap-4">
                                                        <Clock className="w-8 h-8 text-orange-400" />
                                                        <div>
                                                            <p className="font-medium text-orange-300">Time Tracking</p>
                                                            <p className="text-sm text-orange-400/60">Started at {activeJob.time}</p>
                                                        </div>
                                                    </div>
                                                    <div className="text-right">
                                                        <p className="text-3xl font-bold text-white font-mono">{formatElapsedTime(elapsedTime)}</p>
                                                        <p className="text-sm text-orange-400/60">Elapsed</p>
                                                    </div>
                                                </div>

                                                {/* Vehicle Info */}
                                                <div className="flex items-center gap-4 p-4 bg-[#09090b] rounded-md border border-zinc-800">
                                                    <div className="w-12 h-12 bg-[#1a1a1c] rounded-md flex items-center justify-center text-2xl border border-zinc-800">
                                                        🚗
                                                    </div>
                                                    <div>
                                                        <p className="font-semibold text-lg text-[#f4f4f5]">{activeJob.vehicleInfo}</p>
                                                        <p className="text-sm text-[#a1a1aa]">{activeJob.customer?.name || activeJob.customerName}</p>
                                                    </div>
                                                    <div className="ml-auto text-right text-sm">
                                                        <p className="font-mono text-[#a1a1aa]">{activeJob.id.substring(0, 8)}</p>
                                                        <p className="text-emerald-400 font-medium">Est. Complete: 2h</p>
                                                    </div>
                                                </div>

                                                {/* Service Checklist */}
                                                <div>
                                                    <h4 className="font-semibold mb-3 text-[#f4f4f5]">Service Checklist</h4>
                                                    <div className="space-y-2">
                                                        {(activeJob.serviceSteps || []).map((item, idx) => (
                                                            <div
                                                                key={idx}
                                                                className="flex items-center gap-3 p-3 border border-zinc-800 rounded-md hover:bg-[#1a1a1c] cursor-pointer transition-colors bg-[#09090b]"
                                                                onClick={() => handleToggleChecklist(activeJob, idx)}
                                                            >
                                                                <Checkbox checked={item.status === 'completed'} className="border-zinc-600 data-[state=checked]:bg-[#F57C00] data-[state=checked]:border-[#F57C00]" />
                                                                <span className={item.status === 'completed' ? 'line-through text-[#a1a1aa]' : 'text-[#f4f4f5]'}>
                                                                    {item.name}
                                                                </span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>

                                                {/* Customer Notes */}
                                                {activeJob.notes && (
                                                    <div className="bg-orange-900/10 border border-orange-500/20 rounded-md p-4">
                                                        <div className="flex items-center gap-2 mb-2">
                                                            <MessageSquare className="w-4 h-4 text-orange-400" />
                                                            <span className="font-medium text-orange-300">Customer Notes</span>
                                                        </div>
                                                        <p className="text-indigo-200/80">{activeJob.notes}</p>
                                                    </div>
                                                )}

                                                {/* Action Buttons */}
                                                <div className="grid grid-cols-2 gap-4">
                                                    <Button variant="outline" className="flex items-center gap-2 border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-white h-12">
                                                        <Camera className="w-4 h-4" />
                                                        Take Photos
                                                    </Button>
                                                    <Button variant="outline" className="flex items-center gap-2 border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-white h-12">
                                                        <Package className="w-4 h-4" />
                                                        Log Inventory
                                                    </Button>
                                                </div>
                                                <Button
                                                    onClick={() => handleCompleteJob(activeJob)}
                                                    className="w-full bg-emerald-600 hover:bg-emerald-500 text-white h-12 text-lg font-medium shadow-lg shadow-emerald-500/20"
                                                >
                                                    <CheckCircle className="w-5 h-5 mr-2" />
                                                    Mark as Complete
                                                </Button>
                                            </div>
                                        ) : (
                                            <div className="text-center py-8 text-[#a1a1aa]">
                                                No active job. Start a job from the queue.
                                            </div>
                                        )}
                                    </CardContent>
                                </Card>

                                {/* Completed Today */}
                                {completedToday > 0 && (
                                    <Card className="mt-6 bg-[#121214] border-zinc-800">
                                        <CardHeader>
                                            <CardTitle className="text-[#f4f4f5]">Completed Today</CardTitle>
                                        </CardHeader>
                                        <CardContent>
                                            {jobs.filter(j => j.status === 'completed').map((job) => (
                                                <div key={job.id} className="flex items-center gap-3 p-3 border border-zinc-800 rounded-md mb-2 bg-[#1a1a1c]">
                                                    <CheckCircle className="w-5 h-5 text-emerald-500" />
                                                    <div>
                                                        <p className="font-medium text-[#f4f4f5]">{job.vehicleInfo}</p>
                                                        <p className="text-sm text-[#a1a1aa]">{job.serviceName}</p>
                                                    </div>
                                                    <Badge className="ml-auto">{job.id.substring(0, 6)}</Badge>
                                                </div>
                                            ))}
                                        </CardContent>
                                    </Card>
                                )}
                            </div>

                            {/* Job Queue Sidebar */}
                            <div>
                                <Card className="bg-[#121214] border-zinc-800">
                                    <CardHeader>
                                        <CardTitle className="text-[#f4f4f5]">Job Queue</CardTitle>
                                    </CardHeader>
                                    <CardContent className="space-y-4">
                                        {pendingJobs.length === 0 ? (
                                            <p className="text-center text-[#a1a1aa] py-4">No pending jobs</p>
                                        ) : (
                                            pendingJobs.map((job) => (
                                                <div key={job.id} className="p-4 border border-zinc-800 rounded-md hover:bg-[#1a1a1c] transition-colors bg-[#09090b]">
                                                    <div className="flex items-center justify-between mb-2">
                                                        <span className="font-semibold text-[#f4f4f5]">{job.customer?.name || job.customerName}</span>
                                                        <Badge className="bg-blue-900/30 text-blue-300 border-blue-500/30">Normal Priority</Badge>
                                                    </div>
                                                    <p className="text-sm text-[#a1a1aa]">{job.vehicleInfo}</p>
                                                    <div className="flex items-center gap-2 mt-2 text-sm text-[#a1a1aa]">
                                                        <Clock className="w-4 h-4" />
                                                        <span>{job.time} • 2h Est</span>
                                                    </div>
                                                    <p className="text-sm text-gray-600 mt-1">{job.serviceName}</p>
                                                    <Button
                                                        onClick={() => handleStartJob(job)}
                                                        disabled={!!activeJob}
                                                        className="w-full mt-3 bg-green-600 hover:bg-green-700"
                                                        size="sm"
                                                    >
                                                        <Play className="w-4 h-4 mr-2" />
                                                        Start Job
                                                    </Button>
                                                </div>
                                            ))
                                        )}
                                    </CardContent>
                                </Card>
                            </div>
                        </>
                    )}

                    {activeTab === 'schedule' && (
                        <div className="lg:col-span-3">
                            <Card>
                                <CardHeader>
                                    <CardTitle>Today's Schedule</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="space-y-2">
                                        {scheduleItems.map((item, index) => (
                                            <div
                                                key={index}
                                                className={`flex items-center gap-4 p-4 rounded-lg border ${item.status === 'IN PROGRESS' ? 'bg-yellow-50 border-yellow-200' :
                                                    item.status === 'COMPLETED' ? 'bg-gray-50' : ''
                                                    }`}
                                            >
                                                <div className="w-24 font-semibold text-gray-700">{item.time}</div>
                                                {item.customer ? (
                                                    <div className="flex-1">
                                                        <div className="flex items-center gap-2">
                                                            <span className="font-medium">{item.customer}</span>
                                                            <Badge className={
                                                                item.status === 'COMPLETED' ? 'bg-green-100 text-green-800' :
                                                                    item.status === 'IN PROGRESS' ? 'bg-yellow-100 text-yellow-800' :
                                                                        'bg-blue-100 text-blue-800'
                                                            }>
                                                                {item.status}
                                                            </Badge>
                                                        </div>
                                                        <p className="text-sm text-gray-600">{item.vehicle}</p>
                                                        <p className="text-sm text-gray-500">{item.service}</p>
                                                    </div>
                                                ) : (
                                                    <div className="flex-1 text-gray-400 italic">{item.service}</div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </CardContent>
                            </Card>
                        </div>
                    )}

                    {activeTab === 'inventory' && (
                        <div className="lg:col-span-3">
                            <Card className="bg-[#121214] border-zinc-800">
                                <CardHeader className="flex flex-row items-center justify-between">
                                    <CardTitle className="text-[#f4f4f5]">Inventory Usage Tracking</CardTitle>
                                    <Dialog open={showUsageModal} onOpenChange={setShowUsageModal}>
                                        <DialogTrigger asChild>
                                            <Button className="bg-[#F57C00] hover:bg-[#E65100] text-white">
                                                <Plus className="w-4 h-4 mr-2" />
                                                Log Usage
                                            </Button>
                                        </DialogTrigger>
                                        <DialogContent className="bg-[#121214] border-zinc-800">
                                            <DialogHeader>
                                                <DialogTitle className="text-[#f4f4f5]">Log Inventory Usage</DialogTitle>
                                            </DialogHeader>
                                            <div className="space-y-4 py-4">
                                                <div>
                                                    <Label className="text-[#f4f4f5]">Select Item</Label>
                                                    <Select value={selectedItem} onValueChange={setSelectedItem}>
                                                        <SelectTrigger className="mt-1 bg-[#09090b] border-zinc-700 text-[#f4f4f5] focus:border-[#F57C00] focus:ring-[#F57C00]/20">
                                                            <SelectValue placeholder="Choose an item" />
                                                        </SelectTrigger>
                                                        <SelectContent className="bg-[#121214] border-zinc-800">
                                                            {inventory.length === 0 ? (
                                                                <div className="p-4 text-center text-[#a1a1aa]">
                                                                    <p className="text-sm">No inventory items available</p>
                                                                    <p className="text-xs mt-1">Ask admin to add products first</p>
                                                                </div>
                                                            ) : (
                                                                inventory.map((item) => (
                                                                    <SelectItem key={item.id} value={item.id}>
                                                                        {item.name} ({item.stock} {item.unit} available)
                                                                    </SelectItem>
                                                                ))
                                                            )}
                                                        </SelectContent>
                                                    </Select>
                                                </div>
                                                <div>
                                                    <Label className="text-[#f4f4f5]">Quantity Used</Label>
                                                    <Input
                                                        type="number"
                                                        placeholder="Enter quantity"
                                                        value={usageQuantity}
                                                        onChange={(e) => setUsageQuantity(e.target.value)}
                                                        className="mt-1 bg-[#09090b] border-zinc-700 text-[#f4f4f5] placeholder:text-[#a1a1aa] focus:border-[#F57C00] focus:ring-[#F57C00]/20"
                                                    />
                                                </div>
                                                <Button
                                                    onClick={handleLogUsage}
                                                    className="w-full bg-[#F57C00] hover:bg-[#E65100] text-white"
                                                    disabled={!selectedItem || !usageQuantity || inventory.length === 0}
                                                >
                                                    Log Usage
                                                </Button>
                                            </div>
                                        </DialogContent>
                                    </Dialog>
                                </CardHeader>
                                <CardContent>
                                    <div className="space-y-4">
                                        {inventoryUsage.length === 0 ? (
                                            <p className="text-center text-[#a1a1aa] py-8">No usage logged yet</p>
                                        ) : (
                                            inventoryUsage.slice(0, 10).map((usage) => (
                                                <div key={usage.id} className="flex items-center justify-between p-4 border border-zinc-800 rounded-md bg-[#1a1a1c]">
                                                    <div className="flex items-center gap-3">
                                                        <Package className="w-5 h-5 text-[#a1a1aa]" />
                                                        <div>
                                                            <p className="font-medium text-[#f4f4f5]">{usage.itemName}</p>
                                                            <p className="text-sm text-[#a1a1aa]">Used: {usage.quantity} {usage.unit}</p>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                    <div className="mt-6 bg-orange-900/10 border border-orange-500/20 rounded-md p-4">
                                        <p className="text-orange-300">
                                            <strong>Tip:</strong> Keep track of materials used for each job to help with inventory management and cost tracking.
                                        </p>
                                    </div>
                                </CardContent>
                            </Card>
                        </div>
                    )}

                    {activeTab === 'photos' && (
                        <div className="lg:col-span-3">
                            <Card>
                                <CardHeader>
                                    <CardTitle>Before/After Photos</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        {/* Before Photos */}
                                        <div>
                                            <h3 className="font-semibold mb-4">Before Photos</h3>
                                            <div className="grid grid-cols-2 gap-4">
                                                {[1, 2, 3, 4].map((i) => (
                                                    <div
                                                        key={i}
                                                        className="aspect-square border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center text-gray-400 hover:border-blue-400 hover:text-blue-400 cursor-pointer transition-colors"
                                                    >
                                                        <Camera className="w-8 h-8 mb-2" />
                                                        <span className="text-sm">Add Photo</span>
                                                    </div>
                                                ))}
                                            </div>
                                            <Button className="w-full mt-4 bg-[#F57C00] hover:bg-[#E65100]">
                                                Upload Before Photos
                                            </Button>
                                        </div>

                                        {/* After Photos */}
                                        <div>
                                            <h3 className="font-semibold mb-4">After Photos</h3>
                                            <div className="grid grid-cols-2 gap-4">
                                                {[1, 2, 3, 4].map((i) => (
                                                    <div
                                                        key={i}
                                                        className="aspect-square border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center text-gray-400 hover:border-green-400 hover:text-green-400 cursor-pointer transition-colors"
                                                    >
                                                        <Camera className="w-8 h-8 mb-2" />
                                                        <span className="text-sm">Add Photo</span>
                                                    </div>
                                                ))}
                                            </div>
                                            <Button className="w-full mt-4 bg-green-600 hover:bg-green-700">
                                                Upload After Photos
                                            </Button>
                                        </div>
                                    </div>

                                    {/* Photo Guidelines */}
                                    <div className="mt-6 bg-orange-50 border border-orange-200 rounded-lg p-4">
                                        <div className="flex items-start gap-2">
                                            <AlertTriangle className="w-5 h-5 text-orange-600 flex-shrink-0 mt-0.5" />
                                            <div>
                                                <p className="font-medium text-orange-800">Photo Guidelines</p>
                                                <ul className="text-sm text-orange-700 mt-1 list-disc list-inside">
                                                    <li>Take photos from multiple angles</li>
                                                    <li>Ensure good lighting</li>
                                                    <li>Capture any problem areas or special work</li>
                                                    <li>Photos will be shared with customers</li>
                                                </ul>
                                            </div>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        </div>
                    )}

                    {activeTab === 'notes' && (
                        <div className="lg:col-span-3">
                            <Card>
                                <CardHeader>
                                    <CardTitle>Customer Communication Notes</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="space-y-4">
                                        <div>
                                            <Label>Add Note</Label>
                                            <Textarea
                                                placeholder="Document any customer conversations, special requests, or important details..."
                                                value={newNote}
                                                onChange={(e) => setNewNote(e.target.value)}
                                                className="mt-1 min-h-[100px]"
                                            />
                                        </div>
                                        <Button onClick={handleSaveNote} className="bg-[#F57C00] hover:bg-[#E65100]">
                                            Save Note
                                        </Button>

                                        <div className="mt-6">
                                            <h4 className="font-semibold mb-4">Previous Notes</h4>
                                            <div className="space-y-3">
                                                {customerNotes.length === 0 ? (
                                                    <p className="text-center text-gray-500 py-4">No notes yet</p>
                                                ) : (
                                                    customerNotes.map((note) => (
                                                        <div key={note.id} className="p-4 border rounded-lg">
                                                            <div className="flex items-center justify-between mb-2">
                                                                <span className="text-sm text-gray-500">
                                                                    {new Date(note.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                                </span>
                                                                <MessageSquare className="w-4 h-4 text-gray-400" />
                                                            </div>
                                                            <p className="text-gray-700">{note.content}</p>
                                                        </div>
                                                    ))
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        </div>
                    )}
                </div>
            </div>
        </div >
    );
}