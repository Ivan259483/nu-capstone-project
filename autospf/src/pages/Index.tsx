import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ArrowRight, ShieldCheck, Sparkles, Clock } from 'lucide-react';

export default function WelcomePage() {
    return (
        <div className="min-h-screen bg-gray-50 flex flex-col">
            {/* Hero Section */}
            <section className="bg-white border-b">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 text-center">
                    <h1 className="text-5xl font-extrabold text-gray-900 tracking-tight mb-6">
                        AutoSPF+
                        <span className="text-blue-600 block text-3xl mt-2 font-bold">Smart Detailing Management</span>
                    </h1>
                    <p className="mt-4 max-w-2xl mx-auto text-xl text-gray-500">
                        Streamline your auto detailing business with inventory tracking, scheduling, and staff management all in one place.
                    </p>
                    <div className="mt-10 flex justify-center gap-4">
                        <Link to="/login">
                            <Button size="lg" className="px-8">
                                Employee Login <ArrowRight className="ml-2 h-4 w-4" />
                            </Button>
                        </Link>
                        <Button variant="outline" size="lg">Learn More</Button>
                    </div>
                </div>
            </section>

            {/* Features Grid */}
            <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    <FeatureCard
                        icon={<ShieldCheck className="h-8 w-8 text-blue-600" />}
                        title="Inventory Control"
                        description="Track coatings, towels, and supplies in real-time. Never run out of critical stock."
                    />
                    <FeatureCard
                        icon={<Sparkles className="h-8 w-8 text-purple-600" />}
                        title="Quality Assurance"
                        description="Standardized service tracking ensures every vehicle gets the perfect finish."
                    />
                    <FeatureCard
                        icon={<Clock className="h-8 w-8 text-green-600" />}
                        title="Efficient Scheduling"
                        description="Optimize detailer workflows and reduce downtime between appointments."
                    />
                </div>
            </section>

            {/* Footer */}
            <footer className="mt-auto bg-gray-900 text-white py-12">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center text-gray-400">
                    <p>&copy; {new Date().getFullYear()} AutoSPF+. All rights reserved.</p>
                </div>
            </footer>
        </div>
    );
}

function FeatureCard({ icon, title, description }: { icon: React.ReactNode, title: string, description: string }) {
    return (
        <Card className="hover:shadow-lg transition-shadow">
            <CardContent className="pt-6">
                <div className="mb-4 bg-gray-50 w-16 h-16 rounded-full flex items-center justify-center">
                    {icon}
                </div>
                <h3 className="text-lg font-bold text-gray-900 mb-2">{title}</h3>
                <p className="text-gray-500">{description}</p>
            </CardContent>
        </Card>
    )
}
