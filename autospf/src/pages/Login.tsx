import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Car, Lock, Instagram, Youtube, Facebook, Mail, CheckCircle, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { EmailService } from '@/lib/email-service';
import api from '@/lib/api';
import { otpStorage, userStorage } from '@/lib/storage';
import { motion } from 'framer-motion';

// Password validation rules
const passwordRules = {
    minLength: 8,
    requireUppercase: true,
    requireLowercase: true,
    requireNumbers: true,
    requireSpecialChars: true,
    specialChars: '!@#$%^&*()_+-=[]{}|;:,.<>?'
};

// Password validation function
const validatePassword = (password: string) => {
    const errors: string[] = [];
    const requirements = {
        length: password.length >= passwordRules.minLength,
        uppercase: /[A-Z]/.test(password),
        lowercase: /[a-z]/.test(password),
        number: /[0-9]/.test(password),
        specialChar: new RegExp(`[${passwordRules.specialChars.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}]`).test(password)
    };

    if (!requirements.length) errors.push(`At least ${passwordRules.minLength} characters`);
    if (!requirements.uppercase) errors.push('One uppercase letter (A-Z)');
    if (!requirements.lowercase) errors.push('One lowercase letter (a-z)');
    if (!requirements.number) errors.push('One number (0-9)');
    if (!requirements.specialChar) errors.push(`One special character (${passwordRules.specialChars})`);

    return {
        isValid: errors.length === 0,
        errors,
        requirements
    };
};

const getPasswordStrength = (password: string) => {
    const validation = validatePassword(password);
    const metCount = Object.values(validation.requirements).filter(Boolean).length;
    const totalCount = Object.keys(validation.requirements).length;

    if (metCount === totalCount) return { strength: 'Strong', color: 'bg-green-500', textColor: 'text-green-500', width: '100%' };
    if (metCount >= 3) return { strength: 'Medium', color: 'bg-yellow-500', textColor: 'text-yellow-500', width: '60%' };
    if (metCount >= 1) return { strength: 'Weak', color: 'bg-orange-500', textColor: 'text-orange-500', width: '30%' };
    return { strength: 'Very Weak', color: 'bg-red-500', textColor: 'text-red-500', width: '10%' };
};

const PasswordRequirement = ({ met, text }: { met: boolean; text: string }) => (
    <div className={`flex items-center text-xs ${met ? 'text-green-500' : 'text-zinc-500'}`}>
        <CheckCircle className={`w-3 h-3 mr-1.5 ${met ? 'text-green-500' : 'text-zinc-600'}`} />
        {text}
    </div>
);

export default function Login() {
    const navigate = useNavigate();
    const { login, signup, user } = useAuth();

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [name, setName] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [isSignUp, setIsSignUp] = useState(false);
    const [confirmPassword, setConfirmPassword] = useState('');
    const [passwordValidation, setPasswordValidation] = useState({
        isValid: false,
        errors: [] as string[],
        requirements: {
            length: false,
            uppercase: false,
            lowercase: false,
            number: false,
            specialChar: false
        }
    });
    const [confirmPasswordError, setConfirmPasswordError] = useState('');

    // OTP States
    const [showOtpModal, setShowOtpModal] = useState(false);
    const [otp, setOtp] = useState('');
    const [otpLoading, setOtpLoading] = useState(false);
    const [pendingSignup, setPendingSignup] = useState<{ email: string; password: string; name: string } | null>(null);

    // Forgot Password States
    const [showForgotModal, setShowForgotModal] = useState(false);
    const [forgotStep, setForgotStep] = useState<'email' | 'otp' | 'reset'>('email');
    const [forgotEmail, setForgotEmail] = useState('');
    const [forgotOtp, setForgotOtp] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmNewPassword, setConfirmNewPassword] = useState('');
    const [forgotLoading, setForgotLoading] = useState(false);


    // Redirect if already logged in
    useEffect(() => {
        if (user) {
            switch (user.role) {
                case 'admin':
                    navigate('/admin/dashboard');
                    break;
                case 'detailer':
                    navigate('/detailer/dashboard');
                    break;
                case 'customer':
                    navigate('/customer/dashboard');
                    break;
            }
        }
    }, [user, navigate]);

    // Real-time password validation - only for signup
    useEffect(() => {
        if (isSignUp && password) {
            setPasswordValidation(validatePassword(password));
        } else {
            setPasswordValidation({
                isValid: false,
                errors: [],
                requirements: {
                    length: false,
                    uppercase: false,
                    lowercase: false,
                    number: false,
                    specialChar: false
                }
            });
        }
    }, [password, isSignUp]);

    // Real-time confirm password validation - only for signup
    useEffect(() => {
        if (isSignUp && confirmPassword && password !== confirmPassword) {
            setConfirmPasswordError('Passwords do not match');
        } else {
            setConfirmPasswordError('');
        }
    }, [password, confirmPassword, isSignUp]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!email || !password) {
            toast.error('Please fill in all fields!');
            return;
        }

        if (isSignUp) {
            if (!name) {
                toast.error('Please enter your name');
                return;
            }

            // Check if email already exists
            const existingUser = userStorage.getByEmail(email);
            if (existingUser) {
                toast.error('An account with this email already exists');
                return;
            }

            // Password validation check - only for signup
            if (!passwordValidation.isValid) {
                toast.error('Please fix password requirements');
                return;
            }

            if (password !== confirmPassword) {
                toast.error('Passwords do not match');
                return;
            }

            // Send OTP
            setIsLoading(true);
            try {
                const generatedOtp = EmailService.generateOtp();
                console.log('📝 [LOGIN] Generated OTP:', generatedOtp);

                const result = await EmailService.sendOtp(email, generatedOtp);
                console.log('📝 [LOGIN] EmailService response:', result);

                if (result.success) {
                    // Store OTP data
                    otpStorage.set({
                        email,
                        otp: generatedOtp,
                        expiresAt: Date.now() + 5 * 60 * 1000 // 5 minutes
                    });

                    setPendingSignup({ email, password, name });
                    setShowOtpModal(true);
                    toast.success('OTP sent to your email!');
                } else {
                    console.error('📝 [LOGIN] OTP sending failed:', result.error);
                    toast.error(`Failed to send OTP: ${result.error || 'Unknown error'}`);
                }
            } catch (err) {
                console.error('📝 [LOGIN] Exception:', err);
                toast.error('Failed to send OTP');
            } finally {
                setIsLoading(false);
            }
            return;
        }

        // Login
        setIsLoading(true);
        try {
            const result = await login(email, password);
            if (result.success) {
                toast.success('Login successful!');
                // Immediate redirection after login
                const currentUser = userStorage.getCurrentUser();
                if (currentUser) {
                    switch (currentUser.role) {
                        case 'admin':
                            navigate('/admin/dashboard');
                            break;
                        case 'detailer':
                            navigate('/detailer/dashboard');
                            break;
                        default:
                            navigate('/customer/dashboard');
                            break;
                    }
                }
            } else {
                toast.error(result.message || 'Invalid email or password!');
            }
        } catch (err: any) {
            toast.error(err.message || 'Login failed');
        } finally {
            setIsLoading(false);
        }
    };

    const handleVerifyOtp = async () => {
        if (!otp || otp.length !== 6) {
            toast.error('Please enter a valid 6-digit OTP');
            return;
        }

        if (!pendingSignup) return;

        setOtpLoading(true);
        try {
            // Call backend to verify OTP (Simplified api instance)
            const response = await api.post('/auth/verify-otp', {
                email: pendingSignup.email,
                otp: otp,
            });

            const verifyData = response.data;

            if (verifyData?.success) {
                // OTP verified - now register
                const response = await signup(pendingSignup.email, pendingSignup.password, pendingSignup.name);

                if (response.success) {
                    otpStorage.clear();
                    setShowOtpModal(false);
                    setPendingSignup(null);
                    setIsSignUp(false);
                    resetForm();
                    toast.success('Account created successfully! Please sign in.');
                } else {
                    toast.error(response.message || 'Failed to create account');
                }
            } else {
                const errorMessage = verifyData?.message || 'Invalid OTP';
                toast.error(errorMessage);
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Verification failed';
            toast.error(`Could not verify OTP: ${errorMessage}`);
        } finally {
            setOtpLoading(false);
        }
    };

    const handleResendOtp = async () => {
        if (!pendingSignup) return;

        setOtpLoading(true);
        try {
            const generatedOtp = EmailService.generateOtp();
            const result = await EmailService.sendOtp(pendingSignup.email, generatedOtp);

            if (result.success) {
                otpStorage.set({
                    email: pendingSignup.email,
                    otp: generatedOtp,
                    expiresAt: Date.now() + 5 * 60 * 1000
                });
                toast.success('New OTP sent!');
            } else {
                toast.error('Failed to resend OTP');
            }
        } catch {
            toast.error('Failed to resend OTP');
        } finally {
            setOtpLoading(false);
        }
    };

    const handleForgotPassword = async () => {
        if (!forgotEmail) {
            toast.error('Please enter your email address');
            return;
        }

        setForgotLoading(true);
        try {
            const response = await api.post('/auth/forgot-password', { email: forgotEmail });
            if (response.data.success) {
                toast.success('OTP sent to your email!');
                setForgotStep('otp');
            } else {
                toast.error(response.data.message || 'Error sending OTP');
            }
        } catch (error: any) {
            console.log('❌ FORGOT PASSWORD ERROR RESPONSE:', error.response?.data);
            const errorMsg = error.response?.data?.message || error.message || 'Failed to request password reset';
            alert(`Error ${error.response?.status || 'Network'}: ${errorMsg}`);
            toast.error(errorMsg);
        } finally {
            setForgotLoading(false);
        }
    };

    const handleVerifyForgotOtp = async () => {
        if (!forgotOtp || forgotOtp.length !== 6) {
            toast.error('Please enter a valid 6-digit OTP');
            return;
        }
        setForgotStep('reset');
    };

    const handleResetPassword = async () => {
        if (!newPassword || !confirmNewPassword) {
            toast.error('Please fill in all fields');
            return;
        }

        const validation = validatePassword(newPassword);
        if (!validation.isValid) {
            toast.error('Password does not meet requirements');
            return;
        }

        if (newPassword !== confirmNewPassword) {
            toast.error('Passwords do not match');
            return;
        }

        setForgotLoading(true);
        try {
            const response = await api.post('/auth/reset-password', {
                email: forgotEmail,
                otp: forgotOtp,
                newPassword: newPassword
            });

            if (response.data.success) {
                toast.success('Password reset successfully! Please sign in.');
                setShowForgotModal(false);
                resetForgotForm();
            } else {
                toast.error(response.data.message || 'Failed to reset password');
            }
        } catch (error: any) {
            console.log('❌ RESET PASSWORD ERROR RESPONSE:', error.response?.data);
            const errorMsg = error.response?.data?.message || error.message || 'An error occurred during password reset';
            alert(`Error ${error.response?.status || 'Network'}: ${errorMsg}`);
            toast.error(errorMsg);
        } finally {
            setForgotLoading(false);
        }
    };

    const resetForgotForm = () => {
        setForgotStep('email');
        setForgotEmail('');
        setForgotOtp('');
        setNewPassword('');
        setConfirmNewPassword('');
    };

    const resetForm = () => {
        setName('');
        setPassword('');
        setConfirmPassword('');
        setOtp('');
        setPasswordValidation({
            isValid: false,
            errors: [],
            requirements: {
                length: false,
                uppercase: false,
                lowercase: false,
                number: false,
                specialChar: false
            }
        });
        setConfirmPasswordError('');
    };

    const passwordStrength = getPasswordStrength(password);

    return (
        <div className="min-h-screen bg-hex-pattern text-white font-sans selection:bg-orange-500/30">
            <div className="flex min-h-screen">

                {/* Left Panel - Branding */}
                <div className="hidden lg:flex w-1/2 relative flex-col justify-between p-16 bg-hex-pattern">
                    <div className="relative z-10">
                        <div className="flex items-center gap-3">
                            <div className="w-12 h-12 bg-gradient-to-br from-orange-600 to-amber-600 rounded-md flex items-center justify-center shadow-[0_0_15px_rgba(245,124,0,0.5)]">
                                <Car className="w-6 h-6 text-white" />
                            </div>
                            <span className="text-2xl font-bold tracking-tight text-white">AutoSPF+</span>
                        </div>
                    </div>

                    <div className="relative z-10 max-w-lg">
                        <h1 className="text-5xl font-bold tracking-tight leading-tight mb-6 text-white">
                            Premium Automotive Service Management
                        </h1>
                        <p className="text-lg text-zinc-400 leading-relaxed">
                            Experience the future of auto care with our comprehensive tracking and booking platform. Designed for excellence.
                        </p>
                    </div>

                    <div className="relative z-10 flex gap-4 text-sm text-zinc-500 font-medium">
                        <span>© 2026 AutoSPF+ Inc.</span>
                        <span className="w-1 h-1 bg-zinc-700 rounded-full my-auto"></span>
                        <a href="#" className="hover:text-zinc-300 transition-colors">Privacy</a>
                        <span className="w-1 h-1 bg-zinc-700 rounded-full my-auto"></span>
                        <a href="#" className="hover:text-zinc-300 transition-colors">Terms</a>
                    </div>
                </div>

                {/* Right Panel - Login Form */}
                <div className="w-full lg:w-1/2 flex flex-col items-center justify-center p-6 bg-hex-pattern relative">

                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5 }}
                        className="w-full max-w-md"
                    >
                        {/* Mobile Logo */}
                        <div className="lg:hidden text-center mb-8">
                            <div className="inline-flex items-center justify-center w-12 h-12 bg-gradient-to-br from-orange-600 to-amber-600 rounded-md mb-4 shadow-[0_0_15px_rgba(245,124,0,0.5)]">
                                <Car className="w-6 h-6 text-white" />
                            </div>
                            <h1 className="text-2xl font-bold text-white">AutoSPF+</h1>
                        </div>

                        <div className="bg-[#121214] border border-[#27272a] shadow-2xl p-8 rounded-md w-full">
                            <div className="text-center mb-8">
                                <h2 className="text-2xl font-bold text-white tracking-tight">
                                    {isSignUp ? 'Create an account' : 'Welcome back'}
                                </h2>
                                <p className="text-zinc-400 mt-2 text-sm">
                                    {isSignUp ? 'Enter your details to get started.' : 'Enter your credentials to access your account.'}
                                </p>
                            </div>

                            <form onSubmit={handleSubmit} className="space-y-5">
                                {isSignUp && (
                                    <div className="space-y-1.5">
                                        <Label className="text-white font-medium text-sm">Full Name</Label>
                                        <Input
                                            type="text"
                                            placeholder="John Doe"
                                            value={name}
                                            onChange={(e) => setName(e.target.value)}
                                            className="bg-zinc-900 border-zinc-800 text-white placeholder:text-zinc-600 focus:border-primary focus:ring-primary/20 h-11 rounded-md"
                                        />
                                    </div>
                                )}

                                <div className="space-y-1.5">
                                    <Label className="text-white font-medium text-sm">Email</Label>
                                    <div className="relative">
                                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                                        <Input
                                            type="email"
                                            placeholder="name@example.com"
                                            value={email}
                                            onChange={(e) => setEmail(e.target.value)}
                                            className="pl-10 bg-zinc-900 border-zinc-800 text-white placeholder:text-zinc-600 focus:border-primary focus:ring-primary/20 h-11 rounded-md"
                                        />
                                    </div>
                                </div>

                                <div className="space-y-1.5">
                                    <div className="flex items-center justify-between">
                                        <Label className="text-white font-medium text-sm">Password</Label>
                                        {!isSignUp && (
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setShowForgotModal(true);
                                                    setForgotEmail(email);
                                                }}
                                                className="text-xs text-primary hover:text-orange-400 font-medium"
                                            >
                                                Forgot password?
                                            </button>
                                        )}
                                    </div>
                                    <div className="relative">
                                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                                        <Input
                                            type={showPassword ? 'text' : 'password'}
                                            placeholder="••••••••"
                                            value={password}
                                            onChange={(e) => setPassword(e.target.value)}
                                            className="pl-10 pr-10 bg-zinc-900 border-zinc-800 text-white placeholder:text-zinc-600 focus:border-primary focus:ring-primary/20 h-11 rounded-md"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowPassword(!showPassword)}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
                                        >
                                            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                        </button>
                                    </div>
                                </div>

                                {isSignUp && password && (
                                    <div className="space-y-3 bg-zinc-900/50 p-3 rounded-md border border-zinc-800">
                                        <div className="flex items-center justify-between text-xs">
                                            <span className="text-zinc-400">Strength</span>
                                            <span className={`font-medium ${passwordStrength.textColor}`}>{passwordStrength.strength}</span>
                                        </div>
                                        <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                                            <div
                                                className={`h-full ${passwordStrength.color} transition-all duration-300`}
                                                style={{ width: passwordStrength.width }}
                                            />
                                        </div>
                                        <div className="grid grid-cols-2 gap-2 pt-1">
                                            <PasswordRequirement met={passwordValidation.requirements.length} text="8+ chars" />
                                            <PasswordRequirement met={passwordValidation.requirements.uppercase} text="Uppercase" />
                                            <PasswordRequirement met={passwordValidation.requirements.lowercase} text="Lowercase" />
                                            <PasswordRequirement met={passwordValidation.requirements.number} text="Number" />
                                            <PasswordRequirement met={passwordValidation.requirements.specialChar} text="Special char" />
                                        </div>
                                    </div>
                                )}

                                {isSignUp && (
                                    <div className="space-y-1.5">
                                        <Label className="text-white font-medium text-sm">Confirm Password</Label>
                                        <Input
                                            type={showPassword ? 'text' : 'password'}
                                            placeholder="••••••••"
                                            value={confirmPassword}
                                            onChange={(e) => setConfirmPassword(e.target.value)}
                                            className={`bg-zinc-900 border-zinc-800 text-white placeholder:text-zinc-600 h-11 focus:border-primary focus:ring-primary/20 rounded-md ${confirmPasswordError ? 'border-red-500/50' : ''}`}
                                        />
                                        {confirmPasswordError && (
                                            <p className="text-red-400 text-xs mt-1">{confirmPasswordError}</p>
                                        )}
                                    </div>
                                )}

                                <motion.button
                                    whileHover={{ scale: 1.02 }}
                                    whileTap={{ scale: 0.98 }}
                                    type="submit"
                                    disabled={isLoading}
                                    className="w-full bg-[#F57C00] hover:bg-[#E65100] text-white h-11 rounded-md font-semibold transition-colors shadow-lg shadow-orange-500/20 flex items-center justify-center gap-2 mt-2"
                                >
                                    {isLoading ? (
                                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                    ) : (
                                        <>
                                            {isSignUp ? 'Create Account' : 'Sign In'}
                                            {!isSignUp && <ArrowRight className="w-4 h-4" />}
                                        </>
                                    )}
                                </motion.button>
                            </form>

                            <div className="mt-6 text-center">
                                <p className="text-zinc-500 text-sm">
                                    {isSignUp ? 'Already have an account?' : "Don't have an account?"}{' '}
                                    <button
                                        onClick={() => {
                                            setIsSignUp(!isSignUp);
                                            resetForm();
                                        }}
                                        className="text-primary hover:text-orange-400 font-medium ml-1 transition-colors"
                                    >
                                        {isSignUp ? 'Sign in' : 'Sign up'}
                                    </button>
                                </p>
                            </div>
                        </div>

                        {/* Social Icons - Gold */}
                        {/* Social Icons - Gold */}
                        <div className="mt-8 flex flex-col items-center gap-4">
                            <div className="flex justify-center gap-6">
                                <a
                                    href="https://www.instagram.com/auto.spf/"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-yellow-500 hover:text-yellow-400 transition-all hover:scale-110 p-2 hover:bg-yellow-500/10 rounded-full"
                                >
                                    <Instagram className="w-5 h-5" />
                                </a>
                                <a
                                    href="https://www.facebook.com/autospfmain"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-yellow-500 hover:text-yellow-400 transition-all hover:scale-110 p-2 hover:bg-yellow-500/10 rounded-full"
                                >
                                    <Facebook className="w-5 h-5" />
                                </a>
                            </div>

                            {/* Support Email */}
                            <a
                                href="mailto:autospf2023@gmail.com"
                                className="flex items-center gap-2 text-xs text-zinc-500 hover:text-primary transition-colors group"
                            >
                                <Mail className="w-3 h-3 group-hover:scale-110 transition-transform" />
                                <span>autospf2023@gmail.com</span>
                            </a>
                        </div>

                        {/* Demo Accounts */}
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: 0.8, duration: 0.5 }}
                            className="mt-8 pt-6 border-t border-zinc-900"
                        >
                            <p className="text-[10px] text-zinc-600 uppercase tracking-widest font-bold mb-4 text-center">Demo Credentials</p>
                            <div className="space-y-2">
                                {/* Admin */}
                                <div className="group flex flex-col sm:flex-row sm:items-center justify-between p-3 rounded-md border border-zinc-800/60 bg-zinc-900/30 hover:bg-zinc-900/50 transition-colors">
                                    <span className="text-xs font-medium text-zinc-500 mb-1 sm:mb-0">Admin</span>
                                    <div className="flex items-center gap-3 font-mono text-[11px]">
                                        <span className="text-zinc-400">admin@autospf.com</span>
                                        <span className="hidden sm:inline text-zinc-700">/</span>
                                        <span className="text-primary font-semibold">Admin123!</span>
                                    </div>
                                </div>

                                {/* Detailer */}
                                <div className="group flex flex-col sm:flex-row sm:items-center justify-between p-3 rounded-md border border-zinc-800/60 bg-zinc-900/30 hover:bg-zinc-900/50 transition-colors">
                                    <span className="text-xs font-medium text-zinc-500 mb-1 sm:mb-0">Detailer</span>
                                    <div className="flex items-center gap-3 font-mono text-[11px]">
                                        <span className="text-zinc-400">mike@detailshop.com</span>
                                        <span className="hidden sm:inline text-zinc-700">/</span>
                                        <span className="text-primary font-semibold">Detailer123!</span>
                                    </div>
                                </div>

                                {/* Customer */}
                                <div className="group flex flex-col sm:flex-row sm:items-center justify-between p-3 rounded-md border border-zinc-800/60 bg-zinc-900/30 hover:bg-zinc-900/50 transition-colors">
                                    <span className="text-xs font-medium text-zinc-500 mb-1 sm:mb-0">Customer</span>
                                    <div className="flex items-center gap-3 font-mono text-[11px]">
                                        <span className="text-zinc-400">customer@test.com</span>
                                        <span className="hidden sm:inline text-zinc-700">/</span>
                                        <span className="text-primary font-semibold">Customer123!</span>
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                </div>
            </div>

            {/* OTP Verification Modal */}
            <Dialog open={showOtpModal} onOpenChange={setShowOtpModal}>
                <DialogContent className="sm:max-w-md bg-zinc-900 border-zinc-800 text-white">
                    <DialogHeader>
                        <DialogTitle className="text-white">Verify Your Email</DialogTitle>
                        <DialogDescription className="text-zinc-400">
                            We've sent a 6-digit verification code to <span className="text-white font-medium">{pendingSignup?.email}</span>. Please enter it below.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div>
                            <Label className="text-zinc-400">Verification Code</Label>
                            <Input
                                type="text"
                                placeholder="000000"
                                value={otp}
                                onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                className="mt-1 text-center text-3xl tracking-[1em] h-16 font-mono bg-zinc-950 border-zinc-800 text-white focus:border-primary focus:ring-primary/20 rounded-md"
                                maxLength={6}
                            />
                        </div>
                        <Button
                            onClick={handleVerifyOtp}
                            className="w-full bg-[#F57C00] hover:bg-[#E65100] text-white h-11 rounded-md"
                            disabled={otpLoading || otp.length !== 6}
                        >
                            {otpLoading ? 'Verifying...' : 'Verify & Create Account'}
                        </Button>
                        <div className="text-center">
                            <button
                                type="button"
                                onClick={handleResendOtp}
                                disabled={otpLoading}
                                className="text-sm text-primary hover:text-orange-400"
                            >
                                Didn't receive the code? Resend
                            </button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Forgot Password Modal */}
            <Dialog open={showForgotModal} onOpenChange={(open) => {
                setShowForgotModal(open);
                if (!open) resetForgotForm();
            }}>
                <DialogContent className="sm:max-w-md bg-zinc-900 border-zinc-800 text-white">
                    <DialogHeader>
                        <DialogTitle className="text-white">
                            {forgotStep === 'email' && 'Forgot Password?'}
                            {forgotStep === 'otp' && 'Verify OTP'}
                            {forgotStep === 'reset' && 'Reset Password'}
                        </DialogTitle>
                        <DialogDescription className="text-zinc-400">
                            {forgotStep === 'email' && "Enter your email address and we'll send you an OTP to reset your password."}
                            {forgotStep === 'otp' && `Enter the 6-digit code sent to ${forgotEmail}.`}
                            {forgotStep === 'reset' && "Create a new strong password for your account."}
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-4">
                        {forgotStep === 'email' && (
                            <div className="space-y-4">
                                <div>
                                    <Label className="text-zinc-400">Email Address</Label>
                                    <Input
                                        type="email"
                                        placeholder="Enter your email"
                                        value={forgotEmail}
                                        onChange={(e) => setForgotEmail(e.target.value)}
                                        className="mt-1 bg-zinc-950 border-zinc-800 text-white focus:border-primary focus:ring-primary/20 rounded-md"
                                    />
                                </div>
                                <Button
                                    onClick={handleForgotPassword}
                                    className="w-full bg-[#F57C00] hover:bg-[#E65100] text-white rounded-md"
                                    disabled={forgotLoading}
                                >
                                    {forgotLoading ? 'Sending...' : 'Send OTP'}
                                </Button>
                            </div>
                        )}

                        {forgotStep === 'otp' && (
                            <div className="space-y-4">
                                <div>
                                    <Label className="text-zinc-400">Verification Code</Label>
                                    <Input
                                        type="text"
                                        placeholder="000000"
                                        value={forgotOtp}
                                        onChange={(e) => setForgotOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                        className="mt-1 text-center text-3xl tracking-[1em] h-16 font-mono bg-zinc-950 border-zinc-800 text-white focus:border-primary focus:ring-primary/20 rounded-md"
                                        maxLength={6}
                                    />
                                </div>
                                <Button
                                    onClick={handleVerifyForgotOtp}
                                    className="w-full bg-[#F57C00] hover:bg-[#E65100] text-white rounded-md"
                                    disabled={forgotOtp.length !== 6}
                                >
                                    Verify OTP
                                </Button>
                                <div className="text-center">
                                    <button
                                        type="button"
                                        onClick={handleForgotPassword}
                                        className="text-sm text-primary hover:text-orange-400"
                                    >
                                        Resend Code
                                    </button>
                                </div>
                            </div>
                        )}

                        {forgotStep === 'reset' && (
                            <div className="space-y-4">
                                <div>
                                    <Label className="text-zinc-400">New Password</Label>
                                    <Input
                                        type="password"
                                        placeholder="Enter new password"
                                        value={newPassword}
                                        onChange={(e) => setNewPassword(e.target.value)}
                                        className="mt-1 bg-zinc-950 border-zinc-800 text-white focus:border-primary focus:ring-primary/20 rounded-md"
                                    />
                                </div>
                                <div>
                                    <Label className="text-zinc-400">Confirm New Password</Label>
                                    <Input
                                        type="password"
                                        placeholder="Confirm new password"
                                        value={confirmNewPassword}
                                        onChange={(e) => setConfirmNewPassword(e.target.value)}
                                        className="mt-1 bg-zinc-950 border-zinc-800 text-white focus:border-primary focus:ring-primary/20 rounded-md"
                                    />
                                </div>
                                <Button
                                    onClick={handleResetPassword}
                                    className="w-full bg-[#F57C00] hover:bg-[#E65100] text-white rounded-md"
                                    disabled={forgotLoading}
                                >
                                    {forgotLoading ? 'Resetting...' : 'Reset Password'}
                                </Button>
                            </div>
                        )}
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}