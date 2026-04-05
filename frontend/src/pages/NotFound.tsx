import { Link, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { ArrowLeft, Car } from "lucide-react";
import { Button } from "@/components/ui/button";

const NotFound = () => {
    const location = useLocation();

    useEffect(() => {
        console.error(
            "404 Error: User attempted to access non-existent route:",
            location.pathname
        );
    }, [location.pathname]);

    return (
        <div className="min-h-screen flex items-center justify-center bg-background relative overflow-hidden">
            <div className="absolute inset-0 bg-hero-pattern" />
            <div className="absolute inset-0 bg-gradient-radial-gold opacity-40" />

            <div className="text-center relative z-10 animate-scale-in px-6">
                <div className="w-20 h-20 rounded-2xl bg-gradient-gold mx-auto mb-6 flex items-center justify-center glow-gold animate-pulse-gold">
                    <Car className="w-10 h-10 text-primary-foreground" />
                </div>
                <div className="text-8xl font-bold gradient-text mb-4 text-glow-gold">404</div>
                <h1 className="text-2xl font-bold text-foreground mb-3">Page Not Found</h1>
                <p className="text-muted-foreground mb-8 max-w-sm mx-auto">
                    The page you're looking for seems to have taken a detour. Let us get you back on track.
                </p>
                <Link to="/">
                    <Button className="bg-gradient-gold text-primary-foreground hover:opacity-90 glow-gold-sm">
                        <ArrowLeft className="w-4 h-4 mr-2" />
                        Back to Home
                    </Button>
                </Link>
            </div>
        </div>
    );
};

export default NotFound;
