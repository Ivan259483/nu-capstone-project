import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { NotificationService, SystemNotification } from '../lib/notification-service';

export default function CustomerDashboard() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [activeSection, setActiveSection] = useState<'dashboard' | 'settings'>('dashboard');
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [profileSubMenu, setProfileSubMenu] = useState<null | 'display' | 'help'>(null);
  const [darkMode, setDarkMode] = useState<'off'|'on'|'auto'>('off');
  const [compactMode, setCompactMode] = useState(false);

  // Notifications
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState<SystemNotification[]>([]);
  const [notificationsLoading, setNotificationsLoading] = useState(true);

  // Bookings & Documents
  const [hasActiveBooking, setHasActiveBooking] = useState(false);
  const [documents, setDocuments] = useState<any[]>([]);
  const [activities, setActivities] = useState<any[]>([]);
  const [vehicles, setVehicles] = useState<any[]>([]);

  const handleAddDummyVehicle = () => {
    setVehicles([...vehicles, {
      plate: vehicles.length % 2 === 0 ? 'TSLA-3X9' : 'PORS-911',
      name: vehicles.length % 2 === 0 ? '2023 Tesla Model 3' : '2019 Porsche 911',
      color: vehicles.length % 2 === 0 ? 'Pearl White Multi-Coat' : 'Agate Grey Metallic'
    }]);
  };

  useEffect(() => {
    const fetchNotifications = async () => {
      setNotificationsLoading(true);
      const res = await NotificationService.getNotifications();
      if (res.success) {
        // Validation: Ensure it's an array, or fallback to empty array
        setNotifications(Array.isArray(res.data) ? res.data : []);
      }
      setNotificationsLoading(false);
    };
    fetchNotifications();
  }, []);

  // Feedback
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedbackRating, setFeedbackRating] = useState(0);
  const [feedbackHover, setFeedbackHover] = useState(0);
  const [feedbackText, setFeedbackText] = useState('');
  const [feedbackVehicle, setFeedbackVehicle] = useState('Tesla Model 3');
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);
  const [feedbackToast, setFeedbackToast] = useState(false);

  // Settings — Profile
  const [profile, setProfile] = useState({ fullName: 'Alex Reyes', email: 'alex@email.com', phone: '+63 912 345 6789' });
  const [profileErrors, setProfileErrors] = useState<Record<string, string>>({});
  const [profileSaved, setProfileSaved] = useState(false);

  // Settings — Password
  const [passwords, setPasswords] = useState({ current: '', newPass: '', confirm: '' });
  const [passwordErrors, setPasswordErrors] = useState<Record<string, string>>({});
  const [passwordSaved, setPasswordSaved] = useState(false);
  const [showPass, setShowPass] = useState({ current: false, newPass: false, confirm: false });

  // Settings — Notifications
  const [notifs, setNotifs] = useState({ bookingUpdates: true, serviceStatus: true, promotions: false, reminders: true });

  function validateProfile() {
    const errs: Record<string, string> = {};
    if (!profile.fullName.trim() || profile.fullName.trim().length < 2) errs.fullName = 'Full name must be at least 2 characters.';
    if (!profile.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profile.email)) errs.email = 'Enter a valid email address.';
    if (!profile.phone.trim() || !/^[+\d\s\-()]{7,20}$/.test(profile.phone)) errs.phone = 'Enter a valid phone number.';
    setProfileErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function handleProfileSave(e: React.FormEvent) {
    e.preventDefault();
    if (!validateProfile()) return;
    setProfileSaved(true);
    setTimeout(() => setProfileSaved(false), 3000);
  }

  function validatePasswords() {
    const errs: Record<string, string> = {};
    if (!passwords.current) errs.current = 'Current password is required.';
    if (!passwords.newPass || passwords.newPass.length < 8) errs.newPass = 'Password must be at least 8 characters.';
    else if (!/[A-Z]/.test(passwords.newPass)) errs.newPass = 'Must contain at least one uppercase letter.';
    else if (!/[0-9]/.test(passwords.newPass)) errs.newPass = 'Must contain at least one number.';
    if (passwords.newPass !== passwords.confirm) errs.confirm = 'Passwords do not match.';
    setPasswordErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function handlePasswordSave(e: React.FormEvent) {
    e.preventDefault();
    if (!validatePasswords()) return;
    setPasswordSaved(true);
    setPasswords({ current: '', newPass: '', confirm: '' });
    setTimeout(() => setPasswordSaved(false), 3000);
  }

  const nav = (section: 'dashboard' | 'settings') => { setActiveSection(section); setIsSidebarOpen(false); };

  function handleFeedbackSubmit() {
    if (feedbackRating === 0 || !feedbackText.trim()) return;
    setFeedbackSubmitted(true);
    // In production, POST to API: { rating, text, vehicle, userId }
    setTimeout(() => {
      setFeedbackOpen(false);
      setFeedbackSubmitted(false);
      setFeedbackRating(0);
      setFeedbackHover(0);
      setFeedbackText('');
      setFeedbackToast(true);
      setTimeout(() => setFeedbackToast(false), 4000);
    }, 1500);
  }

  const markNotificationAsRead = async (id: string) => {
    await NotificationService.markAsRead(id);
    setNotifications(notifications.map(n => n.id === id ? { ...n, isRead: true } : n));
  };

  const markAllNotificationsAsRead = async () => {
    await NotificationService.markAllAsRead();
    setNotifications(notifications.map(n => ({ ...n, isRead: true })));
  };

  return (
    <>
    <div className="h-screen flex overflow-hidden text-sm bg-white" style={{'--border': '214 32% 91%', color: '#0f172a'} as React.CSSProperties}>
      
      {/* Mobile Sidebar Overlay */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-slate-900/20 z-20 md:hidden transition-opacity"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside 
        className={`w-64 bg-white border-r border-slate-200 flex flex-col z-30 fixed inset-y-0 left-0 transform transition-transform duration-200 ease-in-out md:relative md:translate-x-0 ${
          isSidebarOpen ? 'translate-x-0' : '-translate-x-full hidden md:flex'
        }`}
      >
        <div className="h-16 flex items-center px-6 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-slate-900 text-white rounded flex items-center justify-center font-semibold text-base tracking-tighter">
              AG
            </div>
            <span className="font-medium text-base tracking-tight text-slate-900">AutoSPF+</span>
          </div>
        </div>

        <nav className="flex-1 py-6 px-3 space-y-1 overflow-y-auto">
          <button onClick={() => nav('dashboard')} className={`w-full flex items-center gap-3 px-3 py-2 rounded-md font-medium outline-none transition-colors ${activeSection === 'dashboard' ? 'bg-slate-100 text-slate-900' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'}`}>
            <iconify-icon icon="solar:widget-linear" width="20"></iconify-icon>
            Dashboard
          </button>
          <button className="w-full flex items-center gap-3 px-3 py-2 text-slate-500 hover:text-slate-900 hover:bg-slate-50 rounded-md transition-colors outline-none">
            <iconify-icon icon="solar:scanner-linear" width="20"></iconify-icon>
            Scan Vehicle
          </button>
          <button className="w-full flex items-center gap-3 px-3 py-2 text-slate-500 hover:text-slate-900 hover:bg-slate-50 rounded-md transition-colors outline-none">
            <iconify-icon icon="solar:calendar-linear" width="20"></iconify-icon>
            My Bookings
          </button>
          <button className="w-full flex items-center gap-3 px-3 py-2 text-slate-500 hover:text-slate-900 hover:bg-slate-50 rounded-md transition-colors outline-none">
            <iconify-icon icon="solar:routing-2-linear" width="20"></iconify-icon>
            Live Tracker
          </button>
          <button className="w-full flex items-center gap-3 px-3 py-2 text-slate-500 hover:text-slate-900 hover:bg-slate-50 rounded-md transition-colors outline-none">
            <iconify-icon icon="solar:car-linear" width="20"></iconify-icon>
            Vehicles
          </button>
          <button className="w-full flex items-center gap-3 px-3 py-2 text-slate-500 hover:text-slate-900 hover:bg-slate-50 rounded-md transition-colors outline-none">
            <iconify-icon icon="solar:document-text-linear" width="20"></iconify-icon>
            Documents
          </button>
          <button className="w-full flex items-center gap-3 px-3 py-2 text-slate-500 hover:text-slate-900 hover:bg-slate-50 rounded-md transition-colors outline-none">
            <iconify-icon icon="solar:star-linear" width="20"></iconify-icon>
            Rewards
          </button>
        </nav>

      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        
        {/* Header */}
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-4 sm:px-8 shrink-0 z-10">
          <div className="flex items-center gap-4">
            <button 
              className="md:hidden text-slate-500 hover:text-slate-900"
              onClick={() => setIsSidebarOpen(true)}
            >
              <iconify-icon icon="solar:hamburger-menu-linear" width="24"></iconify-icon>
            </button>
            <h1 className="text-xl font-medium tracking-tight text-slate-900 hidden sm:block" style={{color: '#0f172a'}}>Good morning, Alex</h1>
          </div>

          <div className="flex items-center gap-4">
            <button 
              onClick={() => setHasActiveBooking(true)}
              className="hidden sm:flex items-center justify-center px-4 py-2 border border-slate-200 text-slate-700 bg-white hover:bg-slate-50 rounded-md font-medium transition-colors shadow-sm"
            >
              Book Service
            </button>
            <button className="flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-md font-medium transition-colors shadow-sm">
              <iconify-icon icon="solar:scanner-linear" width="18"></iconify-icon>
              Scan Vehicle
            </button>
            
            <div className="w-px h-6 bg-slate-200 hidden sm:block mx-1"></div>
            
            <div className="relative">
              <button 
                onClick={() => setNotificationsOpen(!notificationsOpen)} 
                className="text-slate-400 hover:text-slate-600 relative p-1.5 rounded-full hover:bg-slate-50 transition-colors"
              >
                <div className={`${notifications.filter(n => !n.isRead).length > 0 ? 'animate-[ring_2s_ease-in-out_infinite]' : ''}`}>
                  <iconify-icon icon="solar:bell-linear" width="22"></iconify-icon>
                </div>
                {notifications.filter(n => !n.isRead).length > 0 && (
                  <>
                    <span className="absolute top-0.5 right-0.5 w-3.5 h-3.5 bg-red-500 rounded-full border-2 border-white flex items-center justify-center text-[8px] font-bold text-white z-10">
                      {notifications.filter(n => !n.isRead).length > 9 ? '9+' : notifications.filter(n => !n.isRead).length}
                    </span>
                    <span className="absolute top-0.5 right-0.5 w-3.5 h-3.5 bg-red-400 rounded-full animate-ping opacity-75"></span>
                  </>
                )}
              </button>
              
              {notificationsOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setNotificationsOpen(false)} />
                  <div className="absolute right-0 top-11 w-80 bg-white rounded-xl z-50 shadow-2xl overflow-hidden" style={{border: '1px solid rgba(0,0,0,.04)'}}>
                    <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                      <h3 className="font-bold text-[15px] text-slate-900 tracking-tight">Notifications</h3>
                      {notifications.some(n => !n.isRead) && (
                        <button onClick={markAllNotificationsAsRead} className="text-xs font-medium text-indigo-600 hover:text-indigo-700 transition-colors">
                          Mark all as read
                        </button>
                      )}
                    </div>
                    <div className="max-h-[400px] overflow-y-auto">
                      {notificationsLoading ? (
                        <div className="p-8 text-center flex flex-col items-center justify-center">
                          <iconify-icon icon="line-md:loading-twotone-loop" width="24" className="text-slate-300 mb-2"></iconify-icon>
                          <p className="text-[13px] text-slate-500">Loading notifications...</p>
                        </div>
                      ) : notifications.length === 0 ? (
                        <div className="p-8 text-center flex flex-col items-center justify-center">
                          <div className="w-12 h-12 bg-slate-50 rounded-full flex items-center justify-center mb-3">
                            <iconify-icon icon="solar:bell-bing-linear" width="24" className="text-slate-300"></iconify-icon>
                          </div>
                          <p className="text-[14px] font-medium text-slate-900">You're all caught up</p>
                          <p className="text-[12px] text-slate-500 mt-1">No new notifications right now.</p>
                        </div>
                      ) : (
                        <div className="divide-y divide-slate-50">
                          {notifications.map(n => (
                            <button key={n.id || n._id} onClick={() => markNotificationAsRead(n.id || n._id || '')} className={`w-full text-left p-4 hover:bg-slate-50 transition-colors flex gap-3 ${!n.isRead ? 'bg-slate-50/50' : ''}`}>
                              <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${!n.isRead ? 'bg-indigo-500' : 'bg-transparent'}`}></div>
                              <div className="flex-1 min-w-0">
                                <p className={`text-[13px] text-slate-900 truncate ${!n.isRead ? 'font-semibold' : 'font-medium'}`}>{n.title}</p>
                                <p className="text-[12px] text-slate-500 line-clamp-2 mt-0.5 leading-snug">{n.message}</p>
                                <p className="text-[10px] text-slate-400 mt-1">{new Date(n.createdAt).toLocaleDateString()}</p>
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="p-2 border-t border-slate-100 bg-slate-50 text-center">
                      <button onClick={() => { setNotificationsOpen(false); nav('settings'); }} className="text-[12px] font-medium text-slate-600 hover:text-slate-900 transition-colors py-1 px-2 rounded hover:bg-slate-200/50">
                        Notification preferences
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
            
            <div className="relative">
              <button onClick={() => setProfileMenuOpen(!profileMenuOpen)} className="w-8 h-8 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-600 font-medium ml-2 hover:ring-2 hover:ring-indigo-200 transition-all">
                A
              </button>

              {profileMenuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => { setProfileMenuOpen(false); setProfileSubMenu(null); }} />
                  <div className="absolute right-0 top-11 w-[360px] bg-white rounded-xl z-50 max-h-[calc(100vh-80px)] overflow-y-auto" style={{boxShadow: '0 4px 24px rgba(0,0,0,.12), 0 0 0 1px rgba(0,0,0,.04)'}}>

                    {/* Main Menu */}
                    {!profileSubMenu && (
                      <div className="py-1.5">
                        <div className="px-2 pt-1 pb-1.5">
                          <button className="w-full flex items-center gap-2.5 p-2.5 rounded-lg bg-slate-50 hover:bg-slate-100 transition-colors" style={{border: '1px solid #e2e8f0'}}>
                            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-100 to-slate-200 flex items-center justify-center text-indigo-600 font-semibold text-sm shrink-0">A</div>
                            <div className="text-left">
                              <p className="font-semibold text-[13px] text-slate-900 leading-tight">Alex Reyes</p>
                              <p className="text-[11px] text-slate-500 leading-tight mt-0.5">alex@email.com</p>
                            </div>
                          </button>
                        </div>
                        <div className="h-px bg-slate-100 mx-2 my-0.5"></div>
                        <div className="px-1.5 py-0.5">
                          <button onClick={() => { setProfileMenuOpen(false); setProfileSubMenu(null); nav('settings'); }} className="w-full flex items-center gap-2.5 px-2.5 py-[7px] rounded-md hover:bg-slate-50 transition-colors">
                            <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center shrink-0"><iconify-icon icon="solar:settings-linear" width="18" style={{color:'#475569'}}></iconify-icon></div>
                            <span className="flex-1 text-left text-[13px] font-medium text-slate-800">Settings & privacy</span>
                            <iconify-icon icon="solar:alt-arrow-right-linear" width="16" style={{color:'#94a3b8'}}></iconify-icon>
                          </button>
                          <button onClick={() => setProfileSubMenu('help')} className="w-full flex items-center gap-2.5 px-2.5 py-[7px] rounded-md hover:bg-slate-50 transition-colors">
                            <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center shrink-0"><iconify-icon icon="solar:question-circle-linear" width="18" style={{color:'#475569'}}></iconify-icon></div>
                            <span className="flex-1 text-left text-[13px] font-medium text-slate-800">Help & support</span>
                            <iconify-icon icon="solar:alt-arrow-right-linear" width="16" style={{color:'#94a3b8'}}></iconify-icon>
                          </button>
                          <button onClick={() => setProfileSubMenu('display')} className="w-full flex items-center gap-2.5 px-2.5 py-[7px] rounded-md hover:bg-slate-50 transition-colors">
                            <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center shrink-0"><iconify-icon icon="solar:moon-linear" width="18" style={{color:'#475569'}}></iconify-icon></div>
                            <span className="flex-1 text-left text-[13px] font-medium text-slate-800">Display & accessibility</span>
                            <iconify-icon icon="solar:alt-arrow-right-linear" width="16" style={{color:'#94a3b8'}}></iconify-icon>
                          </button>
                          <button onClick={() => { setProfileMenuOpen(false); setFeedbackOpen(true); }} className="w-full flex items-center gap-2.5 px-2.5 py-[7px] rounded-md hover:bg-slate-50 transition-colors">
                            <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center shrink-0"><iconify-icon icon="solar:chat-square-like-linear" width="18" style={{color:'#475569'}}></iconify-icon></div>
                            <span className="flex-1 text-left text-[13px] font-medium text-slate-800">Give feedback</span>
                          </button>
                        </div>
                        <div className="h-px bg-slate-100 mx-2 my-0.5"></div>
                        <div className="px-1.5 py-0.5">
                          <button onClick={async () => { setProfileMenuOpen(false); await logout(); navigate('/login'); }} className="w-full flex items-center gap-2.5 px-2.5 py-[7px] rounded-md hover:bg-slate-50 transition-colors">
                            <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center shrink-0"><iconify-icon icon="solar:logout-2-linear" width="18" style={{color:'#475569'}}></iconify-icon></div>
                            <span className="flex-1 text-left text-[13px] font-medium text-slate-800">Log out</span>
                          </button>
                        </div>
                        <div className="px-3 pt-2 pb-1.5">
                          <p className="text-[11px] text-slate-400 leading-tight">Privacy · Terms · Cookies · AutoSPF+ © 2026</p>
                        </div>
                      </div>
                    )}

                    {/* Display & Accessibility Sub-panel */}
                    {profileSubMenu === 'display' && (
                      <div className="py-3">
                        <div className="flex items-center gap-3 px-4 pb-1">
                          <button onClick={() => setProfileSubMenu(null)} className="w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center transition-colors shrink-0" style={{border: '1px solid #e2e8f0'}}>
                            <iconify-icon icon="solar:arrow-left-linear" width="20" style={{color:'#0f172a'}}></iconify-icon>
                          </button>
                          <h3 className="font-bold text-[20px] text-slate-900 tracking-tight">Display & accessibility</h3>
                        </div>

                        <div className="px-4 space-y-4 pb-3">
                          {/* Dark Mode */}
                          <div className="flex gap-3">
                            <div className="w-9 h-9 rounded-full bg-slate-900 flex items-center justify-center shrink-0 mt-0.5"><iconify-icon icon="solar:moon-bold" width="18" style={{color:'#fff'}}></iconify-icon></div>
                            <div className="flex-1">
                              <p className="font-bold text-[14px] text-slate-900">Dark mode</p>
                              <p className="text-[12px] text-slate-500 mt-0.5 leading-snug">Adjust the appearance of AutoSPF+ to reduce glare and give your eyes a break.</p>
                              <div className="mt-3 space-y-0.5">
                                {(['off', 'on', 'auto'] as const).map((val) => {
                                  const labels = { off: 'Off', on: 'On', auto: 'Automatic' };
                                  const descs: Record<string,string> = { auto: "We'll automatically adjust the display based on your device's system settings." };
                                  return (
                                    <label key={val} className="flex items-center justify-between py-2 px-1 -mx-1 rounded-md cursor-pointer hover:bg-slate-50 transition-colors">
                                      <div>
                                        <span className="text-[13px] font-medium text-slate-800 block">{labels[val]}</span>
                                        {descs[val] && <span className="text-[11px] text-slate-400 block mt-0.5 leading-snug pr-4">{descs[val]}</span>}
                                      </div>
                                      <div className={`w-[18px] h-[18px] rounded-full border-[2.5px] flex items-center justify-center shrink-0 transition-all ${darkMode === val ? 'border-slate-900 bg-white' : 'border-slate-300'}`}>
                                        {darkMode === val && <div className="w-[8px] h-[8px] rounded-full bg-slate-900"></div>}
                                      </div>
                                      <input type="radio" name="darkMode" className="sr-only" checked={darkMode === val} onChange={() => setDarkMode(val)} />
                                    </label>
                                  );
                                })}
                              </div>
                            </div>
                          </div>

                          <div className="h-px bg-slate-100 -mx-1"></div>

                          {/* Compact Mode */}
                          <div className="flex gap-3">
                            <div className="w-9 h-9 rounded-full bg-slate-900 flex items-center justify-center shrink-0 mt-0.5"><iconify-icon icon="solar:minimize-square-bold" width="18" style={{color:'#fff'}}></iconify-icon></div>
                            <div className="flex-1">
                              <p className="font-bold text-[14px] text-slate-900">Compact mode</p>
                              <p className="text-[12px] text-slate-500 mt-0.5 leading-snug">Make your font size smaller so more content can fit on the screen.</p>
                              <div className="mt-3 space-y-0.5">
                                {[false, true].map((val) => (
                                  <label key={String(val)} className="flex items-center justify-between py-2 px-1 -mx-1 rounded-md cursor-pointer hover:bg-slate-50 transition-colors">
                                    <span className="text-[13px] font-medium text-slate-800">{val ? 'On' : 'Off'}</span>
                                    <div className={`w-[18px] h-[18px] rounded-full border-[2.5px] flex items-center justify-center shrink-0 transition-all ${compactMode === val ? 'border-slate-900 bg-white' : 'border-slate-300'}`}>
                                      {compactMode === val && <div className="w-[8px] h-[8px] rounded-full bg-slate-900"></div>}
                                    </div>
                                    <input type="radio" name="compactMode" className="sr-only" checked={compactMode === val} onChange={() => setCompactMode(val)} />
                                  </label>
                                ))}
                              </div>
                            </div>
                          </div>

                          <div className="h-px bg-slate-100 -mx-1"></div>

                          {/* Keyboard */}
                          <button className="w-full flex items-center gap-3 py-1.5 hover:bg-slate-50 -mx-1 px-1 rounded-md transition-colors">
                            <div className="w-9 h-9 rounded-full bg-slate-900 flex items-center justify-center shrink-0"><iconify-icon icon="solar:keyboard-bold" width="18" style={{color:'#fff'}}></iconify-icon></div>
                            <span className="flex-1 text-left text-[14px] font-bold text-slate-900">Keyboard</span>
                            <iconify-icon icon="solar:alt-arrow-right-linear" width="18" style={{color:'#94a3b8'}}></iconify-icon>
                          </button>

                          <div className="h-px bg-slate-100 -mx-1"></div>

                          {/* Accessibility */}
                          <button className="w-full flex items-center gap-3 py-1.5 hover:bg-slate-50 -mx-1 px-1 rounded-md transition-colors">
                            <div className="w-9 h-9 rounded-full bg-slate-900 flex items-center justify-center shrink-0"><iconify-icon icon="solar:accessibility-bold" width="18" style={{color:'#fff'}}></iconify-icon></div>
                            <span className="flex-1 text-left text-[14px] font-bold text-slate-900">Accessibility settings</span>
                          </button>
                        </div>
                      </div>
                    )}
                    {/* Help & Support Sub-panel */}
                    {profileSubMenu === 'help' && (
                      <div className="py-3">
                        <div className="flex items-center gap-3 px-4 pb-1">
                          <button onClick={() => setProfileSubMenu(null)} className="w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center transition-colors shrink-0" style={{border: '1px solid #e2e8f0'}}>
                            <iconify-icon icon="solar:arrow-left-linear" width="20" style={{color:'#0f172a'}}></iconify-icon>
                          </button>
                          <h3 className="font-bold text-[20px] text-slate-900 tracking-tight">Help & support</h3>
                        </div>

                        <div className="px-4 space-y-1 pb-2 pt-2">
                          <a href="https://autospf.com/help" target="_blank" rel="noopener noreferrer" className="w-full flex items-center gap-3 py-2 px-1 -mx-1 rounded-md hover:bg-slate-50 transition-colors">
                            <div className="w-9 h-9 rounded-full bg-slate-900 flex items-center justify-center shrink-0"><iconify-icon icon="solar:book-2-bold" width="18" style={{color:'#fff'}}></iconify-icon></div>
                            <div className="flex-1">
                              <span className="text-[14px] font-bold text-slate-900 block">Help Center</span>
                              <span className="text-[11px] text-slate-500">Browse FAQs, guides, and tutorials</span>
                            </div>
                            <iconify-icon icon="solar:square-arrow-right-up-linear" width="16" style={{color:'#94a3b8'}}></iconify-icon>
                          </a>

                          <div className="h-px bg-slate-100 -mx-1"></div>

                          <button onClick={() => { setProfileMenuOpen(false); setProfileSubMenu(null); }} className="w-full flex items-center gap-3 py-2 px-1 -mx-1 rounded-md hover:bg-slate-50 transition-colors">
                            <div className="w-9 h-9 rounded-full bg-slate-900 flex items-center justify-center shrink-0"><iconify-icon icon="solar:chat-round-dots-bold" width="18" style={{color:'#fff'}}></iconify-icon></div>
                            <div className="flex-1 text-left">
                              <span className="text-[14px] font-bold text-slate-900 block">Contact Us</span>
                              <span className="text-[11px] text-slate-500">Chat with our support team</span>
                            </div>
                          </button>

                          <div className="h-px bg-slate-100 -mx-1"></div>

                          <button onClick={() => { setProfileMenuOpen(false); setProfileSubMenu(null); setFeedbackOpen(true); }} className="w-full flex items-center gap-3 py-2 px-1 -mx-1 rounded-md hover:bg-slate-50 transition-colors">
                            <div className="w-9 h-9 rounded-full bg-slate-900 flex items-center justify-center shrink-0"><iconify-icon icon="solar:bug-bold" width="18" style={{color:'#fff'}}></iconify-icon></div>
                            <div className="flex-1 text-left">
                              <span className="text-[14px] font-bold text-slate-900 block">Report a Problem</span>
                              <span className="text-[11px] text-slate-500">Let us know if something isn't working</span>
                            </div>
                          </button>

                          <div className="h-px bg-slate-100 -mx-1"></div>

                          <a href="https://autospf.com/community" target="_blank" rel="noopener noreferrer" className="w-full flex items-center gap-3 py-2 px-1 -mx-1 rounded-md hover:bg-slate-50 transition-colors">
                            <div className="w-9 h-9 rounded-full bg-slate-900 flex items-center justify-center shrink-0"><iconify-icon icon="solar:users-group-two-rounded-bold" width="18" style={{color:'#fff'}}></iconify-icon></div>
                            <div className="flex-1">
                              <span className="text-[14px] font-bold text-slate-900 block">Community Forum</span>
                              <span className="text-[11px] text-slate-500">Connect with other car enthusiasts</span>
                            </div>
                            <iconify-icon icon="solar:square-arrow-right-up-linear" width="16" style={{color:'#94a3b8'}}></iconify-icon>
                          </a>
                        </div>
                      </div>
                    )}

                  </div>
                </>
              )}
            </div>
          </div>
        </header>

        {/* Scrollable Area */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-8 bg-slate-50">

          {activeSection === 'settings' ? (
            <div className="max-w-2xl mx-auto space-y-8 pb-12">
              <div>
                <h2 className="text-xl font-semibold text-slate-900 mb-1">Account Settings</h2>
                <p className="text-sm text-slate-500">Manage your profile, security, and notification preferences.</p>
              </div>

              {/* Profile */}
              <div className="bg-white rounded-lg border border-slate-200 shadow-sm">
                <div className="px-6 py-4 border-b border-slate-100">
                  <h3 className="font-semibold text-slate-900 flex items-center gap-2"><iconify-icon icon="solar:user-circle-linear" width="18"></iconify-icon> Profile Information</h3>
                </div>
                <form onSubmit={handleProfileSave} className="p-6 space-y-5" noValidate>
                  {profileSaved && <div className="flex items-center gap-2 text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-md px-4 py-2 text-sm"><iconify-icon icon="solar:check-circle-linear" width="18"></iconify-icon> Profile saved successfully!</div>}
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1.5">Full Name</label>
                    <input value={profile.fullName} onChange={e => { setProfile(p => ({...p, fullName: e.target.value})); setProfileErrors(er => ({...er, fullName: ''})); }}
                      className={`w-full px-3 py-2 rounded-md border text-sm bg-white text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition-colors ${profileErrors.fullName ? 'border-red-400 bg-red-50' : 'border-slate-200'}`}
                      placeholder="Your full name" />
                    {profileErrors.fullName && <p className="mt-1 text-xs text-red-600 flex items-center gap-1"><iconify-icon icon="solar:danger-circle-linear" width="14"></iconify-icon>{profileErrors.fullName}</p>}
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1.5">Email Address</label>
                    <input type="email" value={profile.email} onChange={e => { setProfile(p => ({...p, email: e.target.value})); setProfileErrors(er => ({...er, email: ''})); }}
                      className={`w-full px-3 py-2 rounded-md border text-sm bg-white text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition-colors ${profileErrors.email ? 'border-red-400 bg-red-50' : 'border-slate-200'}`}
                      placeholder="you@email.com" />
                    {profileErrors.email && <p className="mt-1 text-xs text-red-600 flex items-center gap-1"><iconify-icon icon="solar:danger-circle-linear" width="14"></iconify-icon>{profileErrors.email}</p>}
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1.5">Phone Number</label>
                    <input type="tel" value={profile.phone} onChange={e => { setProfile(p => ({...p, phone: e.target.value})); setProfileErrors(er => ({...er, phone: ''})); }}
                      className={`w-full px-3 py-2 rounded-md border text-sm bg-white text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition-colors ${profileErrors.phone ? 'border-red-400 bg-red-50' : 'border-slate-200'}`}
                      placeholder="+63 912 000 0000" />
                    {profileErrors.phone && <p className="mt-1 text-xs text-red-600 flex items-center gap-1"><iconify-icon icon="solar:danger-circle-linear" width="14"></iconify-icon>{profileErrors.phone}</p>}
                  </div>
                  <div className="flex justify-end pt-1">
                    <button type="submit" className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-md transition-colors shadow-sm">Save Changes</button>
                  </div>
                </form>
              </div>

              {/* Password */}
              <div className="bg-white rounded-lg border border-slate-200 shadow-sm">
                <div className="px-6 py-4 border-b border-slate-100">
                  <h3 className="font-semibold text-slate-900 flex items-center gap-2"><iconify-icon icon="solar:lock-password-linear" width="18"></iconify-icon> Change Password</h3>
                </div>
                <form onSubmit={handlePasswordSave} className="p-6 space-y-5" noValidate>
                  {passwordSaved && <div className="flex items-center gap-2 text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-md px-4 py-2 text-sm"><iconify-icon icon="solar:check-circle-linear" width="18"></iconify-icon> Password changed successfully!</div>}
                  {(['current','newPass','confirm'] as const).map((key) => {
                    const labels = { current: 'Current Password', newPass: 'New Password', confirm: 'Confirm New Password' };
                    const hints = { current: '', newPass: 'Min 8 chars, 1 uppercase, 1 number', confirm: '' };
                    return (
                      <div key={key}>
                        <label className="block text-xs font-medium text-slate-700 mb-1.5">{labels[key]}</label>
                        <div className="relative">
                          <input type={showPass[key] ? 'text' : 'password'} value={passwords[key]}
                            onChange={e => { setPasswords(p => ({...p, [key]: e.target.value})); setPasswordErrors(er => ({...er, [key]: ''})); }}
                            className={`w-full px-3 py-2 pr-10 rounded-md border text-sm bg-white text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition-colors ${passwordErrors[key] ? 'border-red-400 bg-red-50' : 'border-slate-200'}`}
                            placeholder="••••••••" />
                          <button type="button" onClick={() => setShowPass(p => ({...p, [key]: !p[key]}))} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                            <iconify-icon icon={showPass[key] ? 'solar:eye-closed-linear' : 'solar:eye-linear'} width="16"></iconify-icon>
                          </button>
                        </div>
                        {hints[key] && !passwordErrors[key] && <p className="mt-1 text-xs text-slate-400">{hints[key]}</p>}
                        {passwordErrors[key] && <p className="mt-1 text-xs text-red-600 flex items-center gap-1"><iconify-icon icon="solar:danger-circle-linear" width="14"></iconify-icon>{passwordErrors[key]}</p>}
                      </div>
                    );
                  })}
                  <div className="flex justify-end pt-1">
                    <button type="submit" className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-md transition-colors shadow-sm">Update Password</button>
                  </div>
                </form>
              </div>

              {/* Notifications */}
              <div className="bg-white rounded-lg border border-slate-200 shadow-sm">
                <div className="px-6 py-4 border-b border-slate-100">
                  <h3 className="font-semibold text-slate-900 flex items-center gap-2"><iconify-icon icon="solar:bell-linear" width="18"></iconify-icon> Notification Preferences</h3>
                </div>
                <div className="p-6 divide-y divide-slate-100">
                  {([
                    { key: 'bookingUpdates', label: 'Booking Updates', desc: 'Confirmations and changes to your appointments.' },
                    { key: 'serviceStatus', label: 'Live Service Status', desc: 'Real-time updates while your vehicle is in service.' },
                    { key: 'promotions', label: 'Promotions & Offers', desc: 'Exclusive deals and seasonal discounts.' },
                    { key: 'reminders', label: 'Service Reminders', desc: 'Upcoming appointment and maintenance reminders.' },
                  ] as const).map(({ key, label, desc }) => (
                    <div key={key} className="flex items-center justify-between py-4 first:pt-0 last:pb-0">
                      <div>
                        <p className="text-sm font-medium text-slate-900">{label}</p>
                        <p className="text-xs text-slate-500 mt-0.5">{desc}</p>
                      </div>
                      <button type="button" onClick={() => setNotifs(n => ({...n, [key]: !n[key]}))}
                        className={`relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors duration-200 focus:outline-none ${notifs[key] ? 'bg-indigo-600' : 'bg-slate-200'}`}>
                        <span className={`inline-block h-4 w-4 mt-0.5 rounded-full bg-white shadow transform transition-transform duration-200 ${notifs[key] ? 'translate-x-4' : 'translate-x-0.5'}`} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-8">

            {/* Service Overview Strip */}
            <div className="bg-white border border-slate-200 rounded-lg flex flex-col md:flex-row divide-y md:divide-y-0 md:divide-x divide-slate-100 shadow-sm">
              <div className="flex-1 p-5 flex flex-col justify-center">
                <span className="text-xs text-slate-500 mb-1 font-medium uppercase tracking-wider">Current Status</span>
                <div className="flex items-center gap-2 text-indigo-600">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
                  </span>
                  <span className="font-medium text-base">In Shop — Detailing</span>
              </div>
            </div>
            <div className="flex-1 p-5 flex flex-col justify-center">
              <span className="text-xs text-slate-500 mb-1 font-medium uppercase tracking-wider">Next Appointment</span>
              <span className="font-medium text-base text-slate-900">Oct 12, 10:00 AM</span>
            </div>
            <div className="flex-1 p-5 flex flex-col justify-center">
              <span className="text-xs text-slate-500 mb-1 font-medium uppercase tracking-wider">Last Service</span>
              <span className="font-medium text-base text-slate-900">Premium Wash (Aug 04)</span>
            </div>
            <div className="flex-1 p-5 flex flex-col justify-center">
              <span className="text-xs text-slate-500 mb-1 font-medium uppercase tracking-wider">Loyalty Points</span>
              <div className="flex items-center gap-1.5">
                <iconify-icon icon="solar:star-linear" className="text-amber-500" width="18"></iconify-icon>
                <span className="font-medium text-base text-slate-900">2,450 pts</span>
              </div>
            </div>
          </div>

          {/* Live Service Tracker */}
          {hasActiveBooking && (
            <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-medium tracking-tight text-slate-900">Live Service: 2023 Tesla Model 3</h2>
              <span className="text-xs font-medium px-2 py-1 bg-indigo-50 text-indigo-700 rounded border border-indigo-100">Est. completion: 2:30 PM</span>
            </div>
            
            <div className="bg-white border border-slate-200 rounded-lg p-6 shadow-sm overflow-x-auto">
              <div className="min-w-[600px] flex items-center">
                
                {/* Step 1: Done */}
                <div className="flex flex-col items-center relative z-10 w-24">
                  <div className="w-8 h-8 rounded-full bg-slate-900 text-white flex items-center justify-center mb-2">
                    <iconify-icon icon="solar:check-read-linear" width="16"></iconify-icon>
                  </div>
                  <span className="text-xs font-medium text-slate-900 text-center">Checked-in</span>
                  <span className="text-xs text-slate-500">8:45 AM</span>
                </div>
                
                <div className="flex-1 h-px bg-slate-900 -mx-6 mb-8 relative z-0"></div>

                {/* Step 2: Done */}
                <div className="flex flex-col items-center relative z-10 w-24">
                  <div className="w-8 h-8 rounded-full bg-slate-900 text-white flex items-center justify-center mb-2">
                    <iconify-icon icon="solar:check-read-linear" width="16"></iconify-icon>
                  </div>
                  <span className="text-xs font-medium text-slate-900 text-center">Washing</span>
                  <span className="text-xs text-slate-500">9:15 AM</span>
                </div>

                <div className="flex-1 h-px bg-indigo-600 -mx-6 mb-8 relative z-0"></div>

                {/* Step 3: Active */}
                <div className="flex flex-col items-center relative z-10 w-24">
                  <div className="w-8 h-8 rounded-full bg-indigo-600 text-white border-4 border-indigo-100 flex items-center justify-center mb-2 shadow-sm">
                    <div className="w-2 h-2 bg-white rounded-full"></div>
                  </div>
                  <span className="text-xs font-medium text-indigo-700 text-center">Detailing</span>
                  <span className="text-xs text-indigo-500">In Progress</span>
                </div>

                <div className="flex-1 h-px bg-slate-200 -mx-6 mb-8 relative z-0"></div>

                {/* Step 4: Pending */}
                <div className="flex flex-col items-center relative z-10 w-24 opacity-50">
                  <div className="w-8 h-8 rounded-full bg-white border-2 border-slate-300 text-slate-400 flex items-center justify-center mb-2">
                    <span className="text-xs font-medium">4</span>
                  </div>
                  <span className="text-xs font-medium text-slate-500 text-center">Quality Check</span>
                  <span className="text-xs text-slate-400">Pending</span>
                </div>

                <div className="flex-1 h-px bg-slate-200 -mx-6 mb-8 relative z-0"></div>

                {/* Step 5: Pending */}
                <div className="flex flex-col items-center relative z-10 w-24 opacity-50">
                  <div className="w-8 h-8 rounded-full bg-white border-2 border-slate-300 text-slate-400 flex items-center justify-center mb-2">
                    <span className="text-xs font-medium">5</span>
                  </div>
                  <span className="text-xs font-medium text-slate-500 text-center">Ready</span>
                  <span className="text-xs text-slate-400">Pending</span>
                </div>

              </div>
            </div>
            </section>
          )}

          {/* Your Vehicles */}
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-medium tracking-tight text-slate-900">Your Garage</h2>
              <button 
                onClick={handleAddDummyVehicle}
                className="text-sm font-medium text-indigo-600 hover:text-indigo-700 flex items-center gap-1"
              >
                <iconify-icon icon="solar:add-circle-linear"></iconify-icon>
                Add Vehicle
              </button>
            </div>

            {vehicles.length === 0 ? (
              <div className="bg-white border border-slate-200 rounded-lg p-8 text-center flex flex-col items-center justify-center shadow-sm min-h-[220px]">
                <div className="w-12 h-12 bg-slate-50 rounded-full flex items-center justify-center mb-3">
                  <iconify-icon icon="solar:car-linear" width="24" className="text-slate-300"></iconify-icon>
                </div>
                <p className="text-[14px] font-medium text-slate-900">Your garage is empty</p>
                <p className="text-[12px] text-slate-500 mt-1 mb-4 max-w-[200px] mx-auto">Add your vehicles here to easily book and track services.</p>
                <button 
                  onClick={handleAddDummyVehicle}
                  className="px-4 py-2 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-md text-sm font-medium transition-colors"
                >
                  Add Your First Vehicle
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {vehicles.map((v, i) => (
                  <div key={i} className="bg-white border border-slate-200 rounded-lg overflow-hidden shadow-sm hover:shadow-md transition-shadow group flex flex-col">
                    <div className="h-32 bg-slate-100 flex items-center justify-center relative border-b border-slate-100">
                      <iconify-icon icon="solar:car-linear" className="text-slate-300" width="64"></iconify-icon>
                      <div className="absolute bottom-3 left-4 bg-white border border-slate-200 px-2 py-0.5 rounded text-xs font-medium text-slate-700 tracking-wider shadow-sm">
                        {v.plate}
                      </div>
                    </div>
                    <div className="p-4 flex-1 flex flex-col">
                      <h3 className="font-medium text-base text-slate-900 mb-1">{v.name}</h3>
                      <p className="text-xs text-slate-500 mb-4">{v.color}</p>
                      
                      <div className="mt-auto grid grid-cols-3 gap-2 border-t border-slate-100 pt-3">
                        <button className="flex flex-col items-center justify-center gap-1 text-slate-500 hover:text-indigo-600 transition-colors py-1">
                          <iconify-icon icon="solar:scanner-linear" width="18"></iconify-icon>
                          <span className="text-xs">Scan</span>
                        </button>
                        <button className="flex flex-col items-center justify-center gap-1 text-slate-500 hover:text-indigo-600 transition-colors py-1">
                          <iconify-icon icon="solar:calendar-add-linear" width="18"></iconify-icon>
                          <span className="text-xs">Book</span>
                        </button>
                        <button className="flex flex-col items-center justify-center gap-1 text-slate-500 hover:text-indigo-600 transition-colors py-1">
                          <iconify-icon icon="solar:history-linear" width="18"></iconify-icon>
                          <span className="text-xs">History</span>
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Bottom Grid: Documents & Activity */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 pb-8">
            
            {/* AI & Documents */}
            <section>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-medium tracking-tight text-slate-900">AI &amp; Documents</h2>
                <a href="#" className="text-sm text-slate-500 hover:text-slate-900">View all</a>
              </div>
              
              <div className="bg-white border border-slate-200 rounded-lg shadow-sm">
                {documents.length === 0 ? (
                  <div className="p-8 text-center flex flex-col items-center justify-center">
                    <div className="w-12 h-12 bg-slate-50 rounded-full flex items-center justify-center mb-3">
                      <iconify-icon icon="solar:folder-with-files-linear" width="24" className="text-slate-300"></iconify-icon>
                    </div>
                    <p className="text-[14px] font-medium text-slate-900">No documents yet</p>
                    <p className="text-[12px] text-slate-500 mt-1 max-w-[200px] mx-auto">Service reports, AI damage scans, and waivers will appear here.</p>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {documents.map((doc, i) => (
                      <a key={i} href="#" className="flex items-start gap-4 p-4 hover:bg-slate-50 transition-colors group">
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${doc.type === 'report' ? 'bg-indigo-50 text-indigo-600' : doc.type === 'waiver' ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-600'}`}>
                          <iconify-icon icon={doc.icon} width="20"></iconify-icon>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-slate-900 group-hover:text-indigo-600 transition-colors truncate">{doc.title}</p>
                          <p className="text-xs text-slate-500 mt-0.5">{doc.desc}</p>
                        </div>
                        {doc.status === 'Signed' ? (
                          <span className="text-xs text-emerald-600 font-medium bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100 shrink-0">Signed</span>
                        ) : (
                          <span className="text-xs text-slate-400 shrink-0">{doc.date}</span>
                        )}
                      </a>
                    ))}
                  </div>
                )}
              </div>
            </section>

            {/* Recent Activity */}
            <section>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-medium tracking-tight text-slate-900">Recent Activity</h2>
              </div>

              <div className="bg-white border border-slate-200 rounded-lg p-6 shadow-sm h-full">
                {activities.length === 0 ? (
                  <div className="text-center flex flex-col items-center justify-center h-full min-h-[200px]">
                    <div className="w-12 h-12 bg-slate-50 rounded-full flex items-center justify-center mb-3">
                      <iconify-icon icon="solar:history-linear" width="24" className="text-slate-300"></iconify-icon>
                    </div>
                    <p className="text-[14px] font-medium text-slate-900">No recent activity</p>
                    <p className="text-[12px] text-slate-500 mt-1 max-w-[200px] mx-auto">Your service timeline and updates will appear here.</p>
                  </div>
                ) : (
                  <div className="relative border-l border-slate-200 ml-3 space-y-6">
                    {activities.map((activity, i) => (
                      <div key={i} className="relative pl-6">
                        <div className={`absolute -left-1.5 top-1.5 w-3 h-3 border-2 rounded-full ${i === 0 ? 'bg-white border-indigo-600' : 'bg-slate-200 border-white'}`}></div>
                        <p className="text-sm font-medium text-slate-900">{activity.title}</p>
                        <p className="text-xs text-slate-500 mt-1">{activity.desc}</p>
                        <p className="text-xs text-slate-400 mt-2">{activity.time}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>

            </div>
            </div>
          )}

        </main>
      </div>
    </div>

    {/* Feedback Modal */}
    {feedbackOpen && (
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" style={{backgroundColor: 'rgba(15,23,42,.5)', backdropFilter: 'blur(4px)'}}>
        <div className="bg-white rounded-2xl w-full max-w-[440px] overflow-hidden" style={{boxShadow: '0 25px 50px -12px rgba(0,0,0,.25), 0 0 0 1px rgba(0,0,0,.03)', animation: 'modalIn .25s ease-out'}} onClick={e => e.stopPropagation()}>
          {!feedbackSubmitted ? (
            <>
              {/* Gradient Header */}
              <div className="relative px-6 pt-6 pb-5" style={{background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 50%, #a855f7 100%)'}}>
                <button onClick={() => { setFeedbackOpen(false); setFeedbackRating(0); setFeedbackHover(0); setFeedbackText(''); }} className="absolute top-4 right-4 w-8 h-8 rounded-full flex items-center justify-center transition-colors" style={{backgroundColor: 'rgba(255,255,255,.15)'}} onMouseOver={e => (e.currentTarget.style.backgroundColor = 'rgba(255,255,255,.25)')} onMouseOut={e => (e.currentTarget.style.backgroundColor = 'rgba(255,255,255,.15)')}>
                  <iconify-icon icon="solar:close-circle-linear" width="18" style={{color:'#fff'}}></iconify-icon>
                </button>
                <div className="flex items-center gap-2 mb-2">
                  <div className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest" style={{backgroundColor: 'rgba(255,255,255,.2)', color: '#fff'}}>Service Complete</div>
                </div>
                <h2 className="font-bold text-xl text-white leading-tight">How was your experience?</h2>
                <p className="text-indigo-100 text-sm mt-1 opacity-80">Your feedback helps us deliver the best service.</p>
              </div>

              <div className="px-6 py-5 space-y-5">
                {/* Vehicle Chip */}
                <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-50" style={{border: '1px solid #e2e8f0'}}>
                  <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center shrink-0">
                    <iconify-icon icon="solar:car-bold" width="20" style={{color:'#fff'}}></iconify-icon>
                  </div>
                  <div className="flex-1 min-w-0">
                    <select value={feedbackVehicle} onChange={e => setFeedbackVehicle(e.target.value)} className="w-full text-sm font-semibold text-slate-900 bg-transparent border-none p-0 focus:outline-none focus:ring-0 cursor-pointer appearance-none">
                      <option>Tesla Model 3</option>
                      <option>Honda Civic</option>
                    </select>
                    <p className="text-[11px] text-slate-500">Detailing · Premium Package</p>
                  </div>
                  <iconify-icon icon="solar:alt-arrow-down-linear" width="16" style={{color:'#94a3b8'}}></iconify-icon>
                </div>

                {/* Star Rating */}
                <div className="text-center">
                  <div className="flex justify-center gap-2 mb-2">
                    {[1, 2, 3, 4, 5].map(star => (
                      <button key={star} type="button" onMouseEnter={() => setFeedbackHover(star)} onMouseLeave={() => setFeedbackHover(0)} onClick={() => setFeedbackRating(star)} className="transition-all duration-150" style={{transform: star <= (feedbackHover || feedbackRating) ? 'scale(1.15)' : 'scale(1)'}}>
                        <iconify-icon icon={star <= (feedbackHover || feedbackRating) ? 'solar:star-bold' : 'solar:star-linear'} width="36" style={{color: star <= (feedbackHover || feedbackRating) ? '#f59e0b' : '#d1d5db', filter: star <= (feedbackHover || feedbackRating) ? 'drop-shadow(0 2px 4px rgba(245,158,11,.3))' : 'none'}}></iconify-icon>
                      </button>
                    ))}
                  </div>
                  {feedbackRating > 0 && (
                    <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 border border-amber-100">
                      <span className="text-base">{feedbackRating === 5 ? '🤩' : feedbackRating === 4 ? '😊' : feedbackRating === 3 ? '😐' : feedbackRating === 2 ? '😕' : '😞'}</span>
                      <span className="text-xs font-semibold text-amber-700">{feedbackRating === 5 ? 'Outstanding!' : feedbackRating === 4 ? 'Great experience!' : feedbackRating === 3 ? 'It was okay' : feedbackRating === 2 ? 'Could be better' : 'Needs improvement'}</span>
                    </div>
                  )}
                </div>

                {/* Review text */}
                <div>
                  <label className="text-[13px] font-semibold text-slate-700 block mb-1.5">Tell us more</label>
                  <div className="relative">
                    <textarea value={feedbackText} onChange={e => setFeedbackText(e.target.value)} rows={3} maxLength={500} placeholder="Share details about your experience — what went well, what we could improve..." className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm text-slate-900 bg-white resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition-all placeholder:text-slate-400" />
                    <div className="flex items-center justify-between mt-1.5 px-1">
                      <div className="flex gap-1">
                        {['😍','👍','🔥','💯'].map(emoji => (
                          <button key={emoji} type="button" onClick={() => setFeedbackText(prev => prev + emoji)} className="w-7 h-7 rounded-md hover:bg-slate-100 flex items-center justify-center text-sm transition-colors">{emoji}</button>
                        ))}
                      </div>
                      <span className={`text-[11px] font-medium ${feedbackText.length > 450 ? 'text-amber-500' : 'text-slate-400'}`}>{feedbackText.length}/500</span>
                    </div>
                  </div>
                </div>

                {/* Submit */}
                <button onClick={handleFeedbackSubmit} disabled={feedbackRating === 0 || !feedbackText.trim()} className={`w-full py-3 rounded-xl font-semibold text-sm transition-all flex items-center justify-center gap-2 ${feedbackRating > 0 && feedbackText.trim() ? 'text-white shadow-lg hover:shadow-xl hover:-translate-y-0.5' : 'bg-slate-100 text-slate-400 cursor-not-allowed'}`} style={feedbackRating > 0 && feedbackText.trim() ? {background: 'linear-gradient(135deg, #4f46e5, #7c3aed)'} : {}}>
                  <iconify-icon icon="solar:star-shine-bold" width="18"></iconify-icon>
                  Submit Review
                </button>

                <p className="text-[11px] text-slate-400 text-center leading-relaxed">Your review will be featured in our <span className="font-semibold text-indigo-500">Trusted by Car Enthusiasts</span> section.</p>
              </div>
            </>
          ) : (
            /* Success state */
            <div className="px-6 py-14 text-center" style={{animation: 'modalIn .3s ease-out'}}>
              <div className="w-20 h-20 rounded-full mx-auto mb-5 flex items-center justify-center" style={{background: 'linear-gradient(135deg, #d1fae5, #a7f3d0)'}}>
                <iconify-icon icon="solar:check-circle-bold" width="48" style={{color:'#059669'}}></iconify-icon>
              </div>
              <h3 className="font-bold text-xl text-slate-900 mb-2">Thank you, Alex! 🎉</h3>
              <p className="text-sm text-slate-500 max-w-[280px] mx-auto leading-relaxed">Your review has been submitted and will appear in our testimonials. We appreciate your support!</p>
              <div className="mt-5 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-50 border border-emerald-100">
                <iconify-icon icon="solar:star-bold" width="14" style={{color:'#f59e0b'}}></iconify-icon>
                <span className="text-xs font-semibold text-emerald-700">{feedbackRating} Star Review Published</span>
              </div>
            </div>
          )}
        </div>
      </div>
    )}

    {/* Feedback Toast */}
    {feedbackToast && (
      <div className="fixed bottom-6 right-6 z-[110] flex items-center gap-3 bg-white px-5 py-3.5 rounded-xl shadow-lg border border-slate-200" style={{animation: 'slideUp .3s ease-out'}}>
        <div className="w-8 h-8 rounded-full bg-emerald-50 flex items-center justify-center shrink-0">
          <iconify-icon icon="solar:check-circle-bold" width="20" style={{color:'#10b981'}}></iconify-icon>
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-900">Feedback submitted!</p>
          <p className="text-xs text-slate-500">Your review is now live. Thank you!</p>
        </div>
        <button onClick={() => setFeedbackToast(false)} className="text-slate-400 hover:text-slate-600 ml-2">
          <iconify-icon icon="solar:close-circle-linear" width="18"></iconify-icon>
        </button>
      </div>
    )}

    <style>{`
      @keyframes slideUp {
        from { opacity: 0; transform: translateY(16px); }
        to { opacity: 1; transform: translateY(0); }
      }
      @keyframes modalIn {
        from { opacity: 0; transform: scale(.95) translateY(8px); }
        to { opacity: 1; transform: scale(1) translateY(0); }
      }
      @keyframes ring {
        0% { transform: rotate(0); }
        5% { transform: rotate(15deg); }
        10% { transform: rotate(-10deg); }
        15% { transform: rotate(15deg); }
        20% { transform: rotate(-10deg); }
        25% { transform: rotate(0); }
        100% { transform: rotate(0); }
      }
    `}</style>
    </>
  );
}
