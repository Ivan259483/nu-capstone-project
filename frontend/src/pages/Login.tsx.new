import { useState } from "react";
import { Link } from "react-router-dom";
import { Eye, EyeOff, Car, LogIn, UserPlus, Mail, Lock, User } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Navbar from "@/components/Navbar";
import { cn } from "@/lib/utils";

export default function Login() {
    const { t } = useLanguage();
    const [tab, setTab] = useState<"login" | "register">("login");
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);
    const [loginForm, setLoginForm] = useState({ email: "", password: "" });
    const [registerForm, setRegisterForm] = useState({ name: "", email: "", password: "", confirm: "", agree: false });

    return (
        <div className="min-h-screen flex flex-col bg-background">
            <Navbar />

            {/* Background */}
            <div className="absolute inset-0 bg-hero-pattern pointer-events-none" />
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-1/4 -left-32 w-80 h-80 rounded-full border border-gold/5 animate-spin-slow" />
                <div className="absolute bottom-1/4 -right-32 w-96 h-96 rounded-full border border-gold/5" style={{ animation: "spin-slow 20s linear infinite reverse" }} />
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-gradient-radial-gold opacity-30" />
            </div>

            <div className="flex-1 flex items-center justify-center px-6 pt-24 pb-12 relative z-10">
                <div className="w-full max-w-md animate-scale-in">
                    {/* Logo */}
                    <div className="text-center mb-8">
                        <Link to="/" className="inline-flex items-center gap-2.5 group mb-4">
                            <div className="w-11 h-11 rounded-xl bg-gradient-gold flex items-center justify-center glow-gold group-hover:scale-110 transition-transform">
                                <Car className="w-6 h-6 text-primary-foreground" />
                            </div>
                            <span className="text-2xl font-bold">
                                <span className="gradient-text">Auto</span>
                                <span className="text-foreground">Shine</span>
                            </span>
                        </Link>
                        <h1 className="text-2xl font-bold text-foreground mt-2">
                            {tab === "login" ? t("login.title") : t("login.register")}
                        </h1>
                        <p className="text-sm text-muted-foreground mt-1">
                            {tab === "login" ? t("login.subtitle") : t("login.registerSubtitle")}
                        </p>
                    </div>

                    {/* Card */}
                    <div className="glass rounded-3xl p-8 border border-gold/15">
                        {/* Tabs */}
                        <div className="flex rounded-xl p-1 bg-muted/30 mb-8 gap-1">
                            <button
                                onClick={() => setTab("login")}
                                className={cn(
                                    "flex-1 py-2 rounded-lg text-sm font-semibold transition-all duration-300 flex items-center justify-center gap-2",
                                    tab === "login"
                                        ? "bg-gradient-gold text-primary-foreground glow-gold-sm"
                                        : "text-muted-foreground hover:text-foreground"
                                )}
                            >
                                <LogIn className="w-3.5 h-3.5" />
                                {t("login.tabLogin")}
                            </button>
                            <button
                                onClick={() => setTab("register")}
                                className={cn(
                                    "flex-1 py-2 rounded-lg text-sm font-semibold transition-all duration-300 flex items-center justify-center gap-2",
                                    tab === "register"
                                        ? "bg-gradient-gold text-primary-foreground glow-gold-sm"
                                        : "text-muted-foreground hover:text-foreground"
                                )}
                            >
                                <UserPlus className="w-3.5 h-3.5" />
                                {t("login.tabRegister")}
                            </button>
                        </div>

                        {/* Login Form */}
                        {tab === "login" && (
                            <div className="space-y-4 animate-slide-up">
                                <div>
                                    <Label className="text-sm text-muted-foreground mb-1.5 block">{t("login.email")}</Label>
                                    <div className="relative">
                                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                        <Input
                                            type="email"
                                            value={loginForm.email}
                                            onChange={(e) => setLoginForm((f) => ({ ...f, email: e.target.value }))}
                                            placeholder="your@email.com"
                                            className="pl-9 bg-muted/40 border-border focus:border-primary"
                                        />
                                    </div>
                                </div>
                                <div>
                                    <div className="flex items-center justify-between mb-1.5">
                                        <Label className="text-sm text-muted-foreground">{t("login.password")}</Label>
                                        <button className="text-xs text-primary hover:text-accent transition-colors">
                                            {t("login.forgotPassword")}
                                        </button>
                                    </div>
                                    <div className="relative">
                                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                        <Input
                                            type={showPassword ? "text" : "password"}
                                            value={loginForm.password}
                                            onChange={(e) => setLoginForm((f) => ({ ...f, password: e.target.value }))}
                                            placeholder="••••••••"
                                            className="pl-9 pr-9 bg-muted/40 border-border focus:border-primary"
                                        />
                                        <button
                                            onClick={() => setShowPassword(!showPassword)}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                                        >
                                            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                        </button>
                                    </div>
                                </div>

                                <Button
                                    className="w-full bg-gradient-gold text-primary-foreground hover:opacity-90 glow-gold-sm font-semibold mt-2 group"
                                    disabled={!loginForm.email || !loginForm.password}
                                >
                                    <LogIn className="w-4 h-4 mr-2 group-hover:translate-x-0.5 transition-transform" />
                                    {t("login.signIn")}
                                </Button>

                                <div className="relative my-4">
                                    <div className="absolute inset-0 flex items-center">
                                        <div className="w-full border-t border-border" />
                                    </div>
                                    <div className="relative flex justify-center text-xs text-muted-foreground bg-transparent">
                                        <span className="bg-card px-2">{t("login.orContinueWith")}</span>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                    <Button variant="outline" className="border-border hover:border-gold/30 text-muted-foreground hover:text-foreground text-xs">
                                        Google
                                    </Button>
                                    <Button variant="outline" className="border-border hover:border-gold/30 text-muted-foreground hover:text-foreground text-xs">
                                        Facebook
                                    </Button>
                                </div>
                            </div>
                        )}

                        {/* Register Form */}
                        {tab === "register" && (
                            <div className="space-y-4 animate-slide-up">
                                <div>
                                    <Label className="text-sm text-muted-foreground mb-1.5 block">{t("login.fullName")}</Label>
                                    <div className="relative">
                                        <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                        <Input
                                            value={registerForm.name}
                                            onChange={(e) => setRegisterForm((f) => ({ ...f, name: e.target.value }))}
                                            placeholder="Juan dela Cruz"
                                            className="pl-9 bg-muted/40 border-border focus:border-primary"
                                        />
                                    </div>
                                </div>
                                <div>
                                    <Label className="text-sm text-muted-foreground mb-1.5 block">{t("login.email")}</Label>
                                    <div className="relative">
                                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                        <Input
                                            type="email"
                                            value={registerForm.email}
                                            onChange={(e) => setRegisterForm((f) => ({ ...f, email: e.target.value }))}
                                            placeholder="your@email.com"
                                            className="pl-9 bg-muted/40 border-border focus:border-primary"
                                        />
                                    </div>
                                </div>
                                <div>
                                    <Label className="text-sm text-muted-foreground mb-1.5 block">{t("login.password")}</Label>
                                    <div className="relative">
                                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                        <Input
                                            type={showPassword ? "text" : "password"}
                                            value={registerForm.password}
                                            onChange={(e) => setRegisterForm((f) => ({ ...f, password: e.target.value }))}
                                            placeholder="••••••••"
                                            className="pl-9 pr-9 bg-muted/40 border-border focus:border-primary"
                                        />
                                        <button
                                            onClick={() => setShowPassword(!showPassword)}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                                        >
                                            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                        </button>
                                    </div>
                                </div>
                                <div>
                                    <Label className="text-sm text-muted-foreground mb-1.5 block">{t("login.confirmPassword")}</Label>
                                    <div className="relative">
                                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                        <Input
                                            type={showConfirm ? "text" : "password"}
                                            value={registerForm.confirm}
                                            onChange={(e) => setRegisterForm((f) => ({ ...f, confirm: e.target.value }))}
                                            placeholder="••••••••"
                                            className="pl-9 pr-9 bg-muted/40 border-border focus:border-primary"
                                        />
                                        <button
                                            onClick={() => setShowConfirm(!showConfirm)}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                                        >
                                            {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                        </button>
                                    </div>
                                </div>

                                <label className="flex items-start gap-2.5 cursor-pointer group">
                                    <div
                                        onClick={() => setRegisterForm((f) => ({ ...f, agree: !f.agree }))}
                                        className={cn(
                                            "w-4 h-4 rounded border mt-0.5 flex items-center justify-center shrink-0 transition-all",
                                            registerForm.agree ? "bg-gradient-gold border-gold" : "border-border group-hover:border-gold/40"
                                        )}
                                    >
                                        {registerForm.agree && <span className="text-primary-foreground text-[10px] font-bold leading-none">✓</span>}
                                    </div>
                                    <span className="text-xs text-muted-foreground">{t("login.agreeTerms")}</span>
                                </label>

                                <Button
                                    className="w-full bg-gradient-gold text-primary-foreground hover:opacity-90 glow-gold-sm font-semibold mt-2 group"
                                    disabled={!registerForm.name || !registerForm.email || !registerForm.password || !registerForm.agree}
                                >
                                    <UserPlus className="w-4 h-4 mr-2" />
                                    {t("login.register")}
                                </Button>
                            </div>
                        )}
                    </div>

                    <p className="text-center text-sm text-muted-foreground mt-6">
                        <Link to="/" className="text-primary hover:text-accent transition-colors">
                            ← {t("nav.home")}
                        </Link>
                    </p>
                </div>
            </div>
        </div>
    );
}
