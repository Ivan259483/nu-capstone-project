import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Eye, EyeOff, Lock, Loader2, ShieldCheck, AlertTriangle, Mail, MessageCircle } from "lucide-react";
import { getBaseApiUrl } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { getDashboardPathForRole } from "@/lib/roles";

type LinkStatus = "validating" | "valid" | "invalid";

const PASSWORD_SPECIAL_RE = /[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]/;

function passwordRules(password: string) {
    return {
        length: password.length >= 8,
        upper: /[A-Z]/.test(password),
        lower: /[a-z]/.test(password),
        number: /[0-9]/.test(password),
        special: PASSWORD_SPECIAL_RE.test(password),
    };
}

function passwordPolicyError(password: string): string | null {
    if (password.length < 8) return "Password must be at least 8 characters.";
    if (!/[A-Z]/.test(password)) return "Password must contain at least one uppercase letter.";
    if (!/[a-z]/.test(password)) return "Password must contain at least one lowercase letter.";
    if (!/[0-9]/.test(password)) return "Password must contain at least one number.";
    if (!PASSWORD_SPECIAL_RE.test(password)) return "Password must contain at least one special character.";
    return null;
}

function resolveEmailSetupToken(searchParams: URLSearchParams): string {
    const fromRouter = (searchParams.get("token") || "").trim();
    if (fromRouter) return fromRouter;
    if (typeof window === "undefined") return "";
    try {
        return (new URLSearchParams(window.location.search).get("token") || "").trim();
    } catch {
        return "";
    }
}

export default function SetPasswordPage() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const { setAuthUser } = useAuth();

    const setupToken = resolveEmailSetupToken(searchParams);
    const isSetupLink = Boolean(setupToken);
    const staffToken = isSetupLink ? "" : localStorage.getItem("autospf_set_password_token") || "";

    const [form, setForm] = useState({ newPassword: "", confirmPassword: "" });
    const [show, setShow] = useState({ new: false, confirm: false });
    const [isLoading, setIsLoading] = useState(false);
    const [linkStatus, setLinkStatus] = useState<LinkStatus>(isSetupLink ? "validating" : staffToken ? "valid" : "invalid");
    const [linkError, setLinkError] = useState("");
    const [accountEmail, setAccountEmail] = useState("");
    const [accountName, setAccountName] = useState("");

    const rules = useMemo(() => passwordRules(form.newPassword), [form.newPassword]);
    const strength = [rules.length, rules.upper, rules.lower, rules.number, rules.special].filter(Boolean).length;
    const strengthLabel = ["", "Very weak", "Weak", "Fair", "Strong", "Very strong"][strength];
    const strengthColor = ["", "#ef4444", "#f97316", "#eab308", "#22c55e", "#10b981"][strength];

    useEffect(() => {
        if (!isSetupLink) return;
        localStorage.removeItem("autospf_set_password_token");
        let cancelled = false;

        const validate = async () => {
            setLinkStatus("validating");
            setLinkError("");
            try {
                const res = await fetch(`${getBaseApiUrl()}/auth/password-setup/validate`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ token: setupToken }),
                });
                const data = await res.json().catch(() => ({}));
                if (cancelled) return;
                if (!res.ok || !data.success) {
                    setLinkStatus("invalid");
                    setLinkError(data.message || "This setup link is invalid or expired.");
                    return;
                }
                setAccountEmail(data.data?.email || "");
                setAccountName(data.data?.name || "");
                setLinkStatus("valid");
            } catch {
                if (!cancelled) {
                    setLinkStatus("invalid");
                    setLinkError("Unable to validate this setup link. Please try again.");
                }
            }
        };

        void validate();
        return () => {
            cancelled = true;
        };
    }, [isSetupLink, setupToken]);

    const handleOpenChat = () => {
        window.dispatchEvent(new CustomEvent("autospf:open-chat-registration"));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (isSetupLink && !setupToken) {
            toast.error("Setup link is missing or invalid.");
            return;
        }
        if (!isSetupLink && !staffToken) {
            toast.error("Your session expired. Please sign in again.");
            return;
        }
        if (linkStatus !== "valid") {
            toast.error("This setup link is not ready.");
            return;
        }
        if (form.newPassword !== form.confirmPassword) {
            toast.error("Passwords do not match.");
            return;
        }
        const pwErr = passwordPolicyError(form.newPassword);
        if (pwErr) {
            toast.error(pwErr);
            return;
        }

        setIsLoading(true);
        try {
            const endpoint = isSetupLink ? "/auth/password-setup/complete" : "/auth/set-password";
            const headers: Record<string, string> = { "Content-Type": "application/json" };
            if (!isSetupLink) headers.Authorization = `Bearer ${staffToken}`;

            const payload = isSetupLink
                ? { token: setupToken, newPassword: form.newPassword, confirmPassword: form.confirmPassword }
                : { newPassword: form.newPassword, confirmPassword: form.confirmPassword };

            const res = await fetch(`${getBaseApiUrl()}${endpoint}`, {
                method: "POST",
                headers,
                body: JSON.stringify(payload),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok || !data.success) {
                toast.error(data.message || "Failed to set password.");
                return;
            }

            const { token: newToken, user } = data.data || {};
            if (newToken) localStorage.setItem("autospf_token", newToken);
            localStorage.removeItem("autospf_set_password_token");
            if (user && setAuthUser) setAuthUser(user);
            toast.success(data.message || "Welcome to AutoSPF+. Your account is now active.");
            navigate(getDashboardPathForRole(user?.role || "customer"), { replace: true });
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
                    background:
                        radial-gradient(circle at 18% 18%, rgba(249,115,22,0.18), transparent 30%),
                        radial-gradient(circle at 82% 12%, rgba(34,211,238,0.10), transparent 28%),
                        linear-gradient(180deg, #070a10 0%, #0b111d 48%, #05070b 100%);
                    display: flex; align-items: center; justify-content: center;
                    padding: 1.5rem;
                    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
                    color: #fff;
                }
                .set-pw-card {
                    position: relative;
                    overflow: hidden;
                    background: rgba(13, 18, 30, 0.86);
                    border: 1px solid rgba(255,255,255,0.09);
                    border-radius: 28px;
                    padding: 2.3rem 1.8rem;
                    width: 100%; max-width: 460px;
                    box-shadow: 0 34px 100px rgba(0,0,0,0.62), inset 0 1px 0 rgba(255,255,255,0.08);
                    backdrop-filter: blur(28px);
                }
                .set-pw-card:before {
                    content: "";
                    position: absolute; inset: 0 0 auto 0; height: 1px;
                    background: linear-gradient(90deg, transparent, rgba(251,191,36,0.8), rgba(34,211,238,0.45), transparent);
                }
                .set-pw-icon {
                    width: 76px; height: 76px; border-radius: 24px;
                    background: linear-gradient(135deg, #fbbf24, #f97316, #be123c);
                    display: flex; align-items: center; justify-content: center;
                    margin: 0 auto 1.4rem;
                    box-shadow: 0 20px 48px rgba(249,115,22,0.26);
                }
                .set-pw-title {
                    font-size: 1.55rem; font-weight: 900; color: #fff;
                    text-align: center; margin: 0 0 .45rem; letter-spacing: 0;
                }
                .set-pw-note {
                    font-size: .88rem; color: rgba(255,255,255,0.54); text-align: center;
                    margin: 0 0 1.7rem; line-height: 1.6;
                }
                .set-pw-badge {
                    display: inline-flex; align-items: center; gap: .4rem;
                    max-width: 100%;
                    margin-top: .8rem;
                    border: 1px solid rgba(251,191,36,0.20);
                    background: rgba(251,191,36,0.08);
                    color: #fbbf24;
                    border-radius: 999px;
                    padding: .35rem .7rem;
                    font-size: .74rem;
                    font-weight: 700;
                }
                .pw-field { margin-bottom: 1.15rem; }
                .pw-label {
                    display: block; font-size: .76rem; font-weight: 800;
                    color: rgba(255,255,255,0.50); margin-bottom: .5rem; letter-spacing: .12em; text-transform: uppercase;
                }
                .pw-input-wrap { position: relative; }
                .pw-icon-left {
                    position: absolute; left: .9rem; top: 50%;
                    transform: translateY(-50%); color: rgba(255,255,255,0.28); pointer-events: none;
                }
                .pw-input {
                    width: 100%; padding: .92rem 2.75rem .92rem 2.75rem;
                    background: rgba(255,255,255,0.055); border: 1px solid rgba(255,255,255,0.10);
                    border-radius: 16px; color: #fff; font-size: .95rem;
                    outline: none; transition: border-color .15s, box-shadow .15s, background .15s;
                    box-sizing: border-box;
                }
                .pw-input:focus {
                    border-color: rgba(251,191,36,0.62);
                    background: rgba(255,255,255,0.075);
                    box-shadow: 0 0 0 3px rgba(251,191,36,0.10);
                }
                .pw-toggle {
                    position: absolute; right: .9rem; top: 50%;
                    transform: translateY(-50%); background: none; border: none;
                    color: rgba(255,255,255,0.36); cursor: pointer; padding: 0;
                    transition: color .15s;
                }
                .pw-toggle:hover { color: #fbbf24; }
                .strength-bar-wrap {
                    margin-top: .65rem; display: flex; gap: .3rem;
                }
                .strength-seg {
                    flex: 1; height: 4px; border-radius: 4px;
                    background: rgba(255,255,255,0.08); transition: background .3s;
                }
                .strength-label {
                    font-size: .75rem; color: rgba(255,255,255,0.42); margin-top: .38rem; text-align: right;
                    font-weight: 700;
                }
                .pw-rules {
                    display: grid;
                    grid-template-columns: 1fr;
                    gap: .45rem;
                    margin: .9rem 0 1.2rem;
                }
                .pw-rule {
                    display: flex; align-items: center; gap: .5rem;
                    border-radius: 12px;
                    padding: .55rem .65rem;
                    background: rgba(255,255,255,0.035);
                    border: 1px solid rgba(255,255,255,0.07);
                    color: rgba(255,255,255,0.48);
                    font-size: .76rem;
                    font-weight: 650;
                }
                .pw-rule.ok {
                    color: #fed7aa;
                    border-color: rgba(249,115,22,0.24);
                    background: rgba(249,115,22,0.09);
                }
                .btn-submit, .btn-secondary {
                    width: 100%; padding: .92rem 1rem;
                    border: none; border-radius: 16px; cursor: pointer;
                    transition: opacity .15s, transform .1s, filter .15s; margin-top: .35rem;
                    display: flex; align-items: center; justify-content: center; gap: .55rem;
                    font-weight: 850; font-size: .94rem;
                }
                .btn-submit {
                    background: linear-gradient(135deg, #fbbf24, #f97316, #be123c);
                    color: #fff;
                    box-shadow: 0 18px 42px rgba(249,115,22,0.25);
                }
                .btn-submit:hover:not(:disabled) { filter: brightness(1.08); transform: translateY(-1px); }
                .btn-submit:disabled { opacity: .5; cursor: not-allowed; transform: none; }
                .btn-secondary {
                    background: rgba(255,255,255,0.055);
                    color: rgba(255,255,255,0.72);
                    border: 1px solid rgba(255,255,255,0.10);
                    text-decoration: none;
                }
                .set-pw-error {
                    border: 1px solid rgba(248,113,113,0.25);
                    background: rgba(127,29,29,0.14);
                    color: #fecaca;
                    border-radius: 16px;
                    padding: 1rem;
                    font-size: .9rem;
                    line-height: 1.55;
                    margin: 1.4rem 0;
                }
            `}</style>

            <div className="set-pw-card">
                <div className="set-pw-icon">
                    {linkStatus === "invalid" ? <AlertTriangle size={32} /> : <Lock size={32} />}
                </div>

                <h1 className="set-pw-title">
                    {isSetupLink ? "Create Your Password" : "Set Your Password"}
                </h1>
                <p className="set-pw-note">
                    {isSetupLink
                        ? "Your AutoSPF+ account is almost ready. Create your own password to activate secure access."
                        : "For your security, please create your own password before accessing your account."}
                    {accountEmail ? (
                        <span className="set-pw-badge">
                            <Mail size={13} />
                            {accountEmail}
                        </span>
                    ) : null}
                </p>

                {linkStatus === "validating" ? (
                    <div className="set-pw-error" style={{ textAlign: "center", color: "rgba(255,255,255,0.65)", background: "rgba(255,255,255,0.045)", borderColor: "rgba(255,255,255,0.09)" }}>
                        <Loader2 size={18} className="animate-spin" style={{ margin: "0 auto .75rem" }} />
                        Validating your secure setup link...
                    </div>
                ) : linkStatus === "invalid" ? (
                    <>
                        <div className="set-pw-error">
                            {linkError || "This setup link is invalid or expired."}
                        </div>
                        {isSetupLink ? (
                            <button type="button" className="btn-submit" onClick={handleOpenChat}>
                                <MessageCircle size={16} />
                                Request New Setup Email
                            </button>
                        ) : null}
                        <Link to="/login" className="btn-secondary">
                            Back to Sign In
                        </Link>
                    </>
                ) : (
                    <form onSubmit={handleSubmit}>
                        {accountName ? (
                            <p className="set-pw-note" style={{ marginTop: "-.65rem" }}>
                                Welcome, {accountName.split(" ")[0]}. Choose a password only you know.
                            </p>
                        ) : null}

                        <div className="pw-field">
                            <label className="pw-label" htmlFor="set-pw-new">New Password</label>
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
                                    aria-label={show.new ? "Hide password" : "Show password"}
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
                            <label className="pw-label" htmlFor="set-pw-confirm">Confirm Password</label>
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
                                    aria-label={show.confirm ? "Hide password" : "Show password"}
                                >
                                    {show.confirm ? <EyeOff size={16} /> : <Eye size={16} />}
                                </button>
                            </div>
                            {form.confirmPassword && form.newPassword !== form.confirmPassword && (
                                <p style={{ fontSize: ".78rem", color: "#fca5a5", marginTop: ".45rem" }}>
                                    Passwords do not match
                                </p>
                            )}
                        </div>

                        <div className="pw-rules" aria-label="Password requirements">
                            {[
                                [rules.length, "8+ characters"],
                                [rules.upper, "Uppercase letter"],
                                [rules.lower, "Lowercase letter"],
                                [rules.number, "Number"],
                                [rules.special, "Special character"],
                            ].map(([ok, label]) => (
                                <div key={String(label)} className={`pw-rule ${ok ? "ok" : ""}`}>
                                    <ShieldCheck size={14} />
                                    {label}
                                </div>
                            ))}
                        </div>

                        <button type="submit" className="btn-submit" disabled={isLoading} id="set-pw-submit">
                            {isLoading ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
                            {isLoading ? "Saving..." : "Set Password & Continue"}
                        </button>
                    </form>
                )}
            </div>
        </div>
    );
}
