import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Calendar } from '@/components/ui/calendar';
import { serviceStorage } from '@/lib/storage';
import { LogOut, Calendar as CalendarIcon, ClipboardList, CheckCircle2, Clock } from 'lucide-react';
import type { Service } from '@/types';

export default function DetailerDashboard() {
    const { user, logout } = useAuth();
    const navigate = useNavigate();
    const [services, setServices] = useState<Service[]>([]);
    const [date, setDate] = useState<Date | undefined>(new Date());

    useEffect(() => {
        loadServices();
    }, []);

    const loadServices = async () => {
        const data = await serviceStorage.getAll();
        setServices(data);
    };

    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    // Mock generic tasks based on services for demo
    const tasks = [
        { id: 1, serviceId: '1', customer: 'Alice Smith', vehicle: '2023 Tesla Model Y', time: '09:00 AM', status: 'completed' },
        { id: 2, serviceId: '2', customer: 'Bob Jones', vehicle: '2022 Ford F-150', time: '11:00 AM', status: 'in-progress' },
        { id: 3, serviceId: '1', customer: 'Charlie Brown', vehicle: '2024 BMW X5', time: '02:00 PM', status: 'pending' },
    ];

    return (
        <div className="min-h-screen bg-gray-50">
            {/* Header */}
            <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex justify-between items-center py-4">
                        <div>
                            <h1 className="text-2xl font-bold text-gray-900">Detailer Dashboard</h1>
                            <p className="text-sm text-gray-500">Welcome back, {user?.name}</p>
                        </div>
                        <Button variant="outline" onClick={handleLogout}>
                            <LogOut className="h-4 w-4 mr-2" />
                            Logout
                        </Button>
                    </div>
                </div>
            </header>

            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">

                    {/* Left Column: Schedule & Tasks */}
                    <div className="md:col-span-2 space-y-6">

                        {/* Today's Overview */}
                        <div className="grid grid-cols-3 gap-4">
                            <Card>
                                <CardContent className="pt-6 text-center">
                                    <div className="text-2xl font-bold text-blue-600">3</div>
                                    <div className="text-sm text-gray-500">Tasks Today</div>
                                </CardContent>
                            </Card>
                            <Card>
                                <CardContent className="pt-6 text-center">
                                    <div className="text-2xl font-bold text-green-600">1</div>
                                    <div className="text-sm text-gray-500">Completed</div>
                                </CardContent>
                            </Card>
                            <Card>
                                <CardContent className="pt-6 text-center">
                                    <div className="text-2xl font-bold text-orange-600">4.5h</div>
                                    <div className="text-sm text-gray-500">Est. Duration</div>
                                </CardContent>
                            </Card>
                        </div>

                        <Tabs defaultValue="tasks">
                            <TabsList className="grid w-full grid-cols-2">
                                <TabsTrigger value="tasks">My Tasks</TabsTrigger>
                                <TabsTrigger value="history">History</TabsTrigger>
                            </TabsList>

                            <TabsContent value="tasks" className="space-y-4 mt-4">
                                {tasks.map((task) => {
                                    const service = services.find(s => s.id === task.serviceId);
                                    return (
                                        <Card key={task.id}>
                                            <CardContent className="p-6 flex items-center justify-between">
                                                <div className="flex items-start gap-4">
                                                    <div className={`p-2 rounded-full ${task.status === 'completed' ? 'bg-green-100 text-green-600' :
                                                            task.status === 'in-progress' ? 'bg-blue-100 text-blue-600' :
                                                                'bg-gray-100 text-gray-600'
                                                        }`}>
                                                        <ClipboardList className="h-5 w-5" />
                                                    </div>
                                                    <div>
                                                        <h3 className="font-semibold text-gray-900">{service?.name || 'Unknown Service'}</h3>
                                                        <p className="text-sm text-gray-500">{task.customer} • {task.vehicle}</p>
                                                        <div className="flex items-center gap-2 mt-1 text-xs text-gray-500">
                                                            <Clock className="h-3 w-3" />
                                                            {task.time}
                                                            {service?.duration && <span>• {service.duration} mins</span>}
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-3">
                                                    <Badge variant={
                                                        task.status === 'completed' ? 'default' : // green-ish usually default or success
                                                            task.status === 'in-progress' ? 'secondary' :
                                                                'outline'
                                                    }>
                                                        {task.status}
                                                    </Badge>
                                                    {task.status !== 'completed' && (
                                                        <Button size="sm">
                                                            {task.status === 'pending' ? 'Start' : 'Complete'}
                                                        </Button>
                                                    )}
                                                </div>
                                            </CardContent>
                                        </Card>
                                    );
                                })}
                            </TabsContent>

                            <TabsContent value="history">
                                <Card>
                                    <CardContent className="p-8 text-center text-gray-500">
                                        No history available yet.
                                    </CardContent>
                                </Card>
                            </TabsContent>
                        </Tabs>
                    </div>

                    {/* Right Column: Calendar & Info */}
                    <div className="space-y-6">
                        <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <CalendarIcon className="h-5 w-5" />
                                    Schedule
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <Calendar
                                    mode="single"
                                    selected={date}
                                    onSelect={setDate}
                                    className="rounded-md border shadow-sm"
                                />
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader>
                                <CardTitle>Service Reference</CardTitle>
                                <CardDescription>Quick guide to service durations</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className="space-y-4">
                                    {services.map(service => (
                                        <div key={service.id} className="flex justify-between items-center text-sm border-b pb-2 last:border-0 last:pb-0">
                                            <span className="font-medium">{service.name}</span>
                                            <span className="text-gray-500">{service.duration ? `${service.duration}m` : 'N/A'}</span>
                                        </div>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </div>
            </main>
        </div>
    );
}
