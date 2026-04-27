import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Eye, EyeOff, Lock, Loader2, ShieldCheck } from "lucide-react";
import { getBaseApiUrl } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { getDashboardPathForRole } from "@/lib/roles";

export default function SetPasswordPage() {
    const navigate = useNavigate();
    const { setAuthUser } = useAuth();

    const [form, setForm] = useState({ newPassword: "", confirmPassword: "" });
    const [show, setShow] = useState({ new: false, confirm: false });
    const [isLoading, setIsLoading] = useState(false);

    const token = localStorage.getItem("autospf_set_password_token") || "";

    const getStrength = (pw: string) => {
        let score = 0;
        if (pw.length >= 8) score++;
        if (/[A-Z]/.test(pw)) score++;
        if (/[a-z]/.test(pw)) score++;
        if (/[0-9]/.test(pw)) score++;
        if (/[^A-Za-z0-9]/.test(pw)) score++;
        return score;
    };

    const strength = getStrength(form.newPassword);
    const strengthLabel = ["", "Very Weak", "Weak", "Fair", "Strong", "Very Strong"][strength];
    const strengthColor = ["", "#ef4444", "#f97316", "#eab308", "#22c55e", "#10b981"][strength];

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (form.newPassword !== form.confirmPassword) {
            toast.error("Passwords do not match.");
            return;
        }
        if (strength < 3) {
            toast.error("Password is too weak. Please use a stronger password.");
            return;
        }
        setIsLoading(true);
        try {
            const res = await fetch(`${getBaseApiUrl()}/auth/set-password`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                    newPassword: form.newPassword,
                    confirmPassword: form.confirmPassword,
                }),
            });
            const data = await res.json();
            if (!res.ok || !data.success) {
                toast.error(data.message || "Failed to set password.");
                return;
            }
            // Store new JWT and user
            const { token: newToken, user } = data.data;
            localStorage.setItem("autospf_token", newToken);
            localStorage.removeItem("autospf_set_password_token");
            if (setAuthUser) setAuthUser(user);
            toast.success("Password updated successfully! Welcome to AutoSPF+.");
            navigate(getDashboardPathForRole(user.role));
        } catch {
            toast.error("Network error. Please try again.");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="set-pw-root">
            <style>{`
                .set-pw-root {
                    min-height: 100vh;
                    background: #080c14;
                    display: flex; align-items: center; justify-content: center;
                    padding: 1.5rem;
                    font-family: 'Inter', -apple-system, sans-serif;
                }
                .set-pw-card {
                    background: #0e1420;
                    border: 1px solid rgba(255,255,255,0.07);
                    border-radius: 24px;
                    padding: 2.5rem 2rem;
                    width: 100%; max-width: 440px;
                    box-shadow: 0 32px 80px rgba(0,0,0,0.6);
                }
                .set-pw-icon {
                    width: 72px; height: 72px; border-radius: 50%;
                    background: linear-gradient(135deg, rgba(251,191,36,0.12), rgba(217,119,6,0.08));
                    border: 1.5px solid rgba(251,191,36,0.2);
                    display: flex; align-items: center; justify-content: center;
                    margin: 0 auto 1.5rem;
                }
                .set-pw-title {
                    font-size: 1.5rem; font-weight: 800; color: #fff;
                    text-align: center; margin-bottom: .375rem; letter-spacing: -0.5px;
                }
                .set-pw-note {
                    font-size: .85rem; color: #6b7280; text-align: center;
                    margin-bottom: 2rem; line-height: 1.5;
                    background: rgba(251,191,36,0.06);
                    border: 1px solid rgba(251,191,36,0.12);
                    border-radius: 10px; padding: .75rem 1rem;
                }
                .pw-field { margin-bottom: 1.25rem; }
                .pw-label {
                    display: block; font-size: .8rem; font-weight: 600;
                    color: #9ca3af; margin-bottom: .5rem; letter-spacing: .5px; text-transform: uppercase;
                }
                .pw-input-wrap { position: relative; }
                .pw-icon-left {
                    position: absolute; left: .875rem; top: 50%;
                    transform: translateY(-50%); color: #4b5563; pointer-events: none;
                }
                .pw-input {
                    width: 100%; padding: .875rem 2.75rem .875rem 2.75rem;
                    background: #161c2c; border: 1.5px solid rgba(255,255,255,0.08);
                    border-radius: 12px; color: #fff; font-size: .95rem;
                    outline: none; transition: border-color .15s, box-shadow .15s;
                    box-sizing: border-box;
                }
                .pw-input:focus {
                    border-color: #fbbf24;
                    box-shadow: 0 0 0 3px rgba(251,191,36,0.1);
                }
                .pw-toggle {
                    position: absolute; right: .875rem; top: 50%;
                    transform: translateY(-50%); background: none; border: none;
                    color: #6b7280; cursor: pointer; padding: 0;
                    transition: color .15s;
                }
                .pw-toggle:hover { color: #fbbf24; }
                .strength-bar-wrap {
                    margin-top: .625rem; display: flex; gap: .3rem;
                }
                .strength-seg {
                    flex: 1; height: 4px; border-radius: 4px;
                    background: rgba(255,255,255,0.08); transition: background .3s;
                }
                .strength-label {
                    font-size: .75rem; color: #6b7280; margin-top: .35rem; text-align: right;
                }
                .btn-submit {
                    width: 100%; padding: .875rem 1rem;
                    background: linear-gradient(135deg, #fbbf24, #d97706);
                    color: #000; font-weight: 700; font-size: .95rem;
                    border: none; border-radius: 12px; cursor: pointer;
                    transition: opacity .15s, transform .1s; margin-top: .5rem;
                    display: flex; align-items: center; justify-content: center; gap: .5rem;
                }
                .btn-submit:hover:not(:disabled) { opacity: .92; transform: translateY(-1px); }
                .btn-submit:disabled { opacity: .5; cursor: not-allowed; transform: none; }
            `}</style>

            <div className="set-pw-card">
                <div className="set-pw-icon">
                    <Lock size={32} color="#fbbf24" />
                </div>
                <h1 className="set-pw-title">Set Your Password</h1>
                <p className="set-pw-note">
                    🔒 For your security, please create your own password before accessing your account.
                </p>

                <form onSubmit={handleSubmit}>
                    <div className="pw-field">
                        <label className="pw-label">New Password</label>
                        <div className="pw-input-wrap">
                            <Lock size={16} className="pw-icon-left" />
                            <input
                                type={show.new ? "text" : "password"}
                                className="pw-input"
                                placeholder="Create a strong password"
                                value={form.newPassword}
                                onChange={(e) => setForm({ ...form, newPassword: e.target.value })}
                                required
                                id="set-pw-new"
                                autoComplete="new-password"
                            />
                            <button
                                type="button"
                                className="pw-toggle"
                                onClick={() => setShow((s) => ({ ...s, new: !s.new }))}
                            >
                                {show.new ? <EyeOff size={16} /> : <Eye size={16} />}
                            </button>
                        </div>
                        {form.newPassword && (
                            <>
                                <div className="strength-bar-wrap">
                                    {[1, 2, 3, 4, 5].map((seg) => (
                                        <div
                                            key={seg}
                                            className="strength-seg"
                                            style={{ background: seg <= strength ? strengthColor : undefined }}
                                        />
                                    ))}
                                </div>
                                <div className="strength-label" style={{ color: strengthColor }}>
                                    {strengthLabel}
                                </div>
                            </>
                        )}
                    </div>

                    <div className="pw-field">
                        <label className="pw-label">Confirm Password</label>
                        <div className="pw-input-wrap">
                            <Lock size={16} className="pw-icon-left" />
                            <input
                                type={show.confirm ? "text" : "password"}
                                className="pw-input"
                                placeholder="Repeat your password"
                                value={form.confirmPassword}
                                onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
                                required
                                id="set-pw-confirm"
                                autoComplete="new-password"
                            />
                            <button
                                type="button"
                                className="pw-toggle"
                                onClick={() => setShow((s) => ({ ...s, confirm: !s.confirm }))}
                            >
                                {show.confirm ? <EyeOff size={16} /> : <Eye size={16} />}
                            </button>
                        </div>
                        {form.confirmPassword && form.newPassword !== form.confirmPassword && (
                            <p style={{ fontSize: ".78rem", color: "#ef4444", marginTop: ".4rem" }}>
                                Passwords do not match
                            </p>
                        )}
                    </div>

                    <button type="submit" className="btn-submit" disabled={isLoading} id="set-pw-submit">
                        {isLoading ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
                        {isLoading ? "Saving…" : "Set Password & Continue"}
                    </button>
                </form>
            </div>
        </div>
    );
}
