import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Trash2, ArrowUp, ArrowDown, Save, Image as ImageIcon, Briefcase, Star, Edit, Upload, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import type { BusinessSettings } from '@/types';
import { toast } from 'sonner';
import { SERVICES, STATS } from '@/pages/LandingPage';
import { PACKAGES } from '@/components/Pricing';
import { GALLERY_ITEMS } from '@/components/GallerySection';

interface LandingPageEditorProps {
    settings: BusinessSettings | null;
    setSettings: React.Dispatch<React.SetStateAction<BusinessSettings | null>>;
    onSave: (updated?: Partial<BusinessSettings>) => Promise<void>;
}

export default function LandingPageEditor({ settings, setSettings, onSave }: LandingPageEditorProps) {
    const isDarkMode = settings?.systemTheme === 'dark';
    
    // Ensure nested landing details exist
    const safeSettings = settings || {} as BusinessSettings;
    const landing = safeSettings.landingDetails || {
        services: [], packages: [], stats: [], gallery: [], team: []
    };

    const [activeSection, setActiveSection] = useState<'services' | 'packages' | 'stats' | 'gallery' | 'team'>('services');

    const handleUpdate = (updater: typeof landing) => {
        setSettings({ ...safeSettings, landingDetails: updater });
    };

    const isCompletelyEmpty = landing.services.length === 0 && landing.packages.length === 0 && landing.stats.length === 0;

    const seedDefaults = () => {
        const seeded = {
            services: SERVICES.map(s => ({
                id: s.title,
                title: s.title,
                subtitle: s.subtitle,
                desc: s.desc,
                image: s.image,
                badge: s.badge || '',
                badgeColor: s.badgeColor || '',
                features: s.features,
                icon: s.title.includes('Film') ? 'Shield' : s.title.includes('Interior') ? 'Star' : 'Crown',
                glow: s.glow || ''
            })),
            packages: PACKAGES.map(p => ({
                id: p.id,
                tier: p.tier,
                price: p.price,
                tagline: p.tagline,
                focus: p.focus,
                features: p.features,
                recommended: p.recommended || false,
                icon: p.tier.includes('Ultimate') ? 'Crown' : p.tier.includes('Elite') ? 'Sparkles' : 'Star'
            })),
            stats: STATS.map(s => ({
                id: s.label,
                label: s.label,
                value: s.value,
                icon: s.label.includes('Detailed') ? 'Award' : (s.label.includes('Business') ? 'Clock' : 'Star')
            })),
            gallery: GALLERY_ITEMS.map((g, i) => ({
                id: `gal-${i}`,
                url: g.src,
                caption: g.label
            })),
            team: []
        };
        handleUpdate(seeded);
    };

    useEffect(() => {
        if (isCompletelyEmpty) {
            seedDefaults();
            toast.success("Demo content loaded into editor! Click 'Save' to publish to database.");
        }
    }, []);

    // Generic move up/down array handlers
    const moveItem = (arrayName: keyof typeof landing, index: number, direction: 'up' | 'down') => {
        const arr = [...(landing[arrayName] as any[])];
        if (direction === 'up' && index > 0) {
            [arr[index - 1], arr[index]] = [arr[index], arr[index - 1]];
        } else if (direction === 'down' && index < arr.length - 1) {
            [arr[index + 1], arr[index]] = [arr[index], arr[index + 1]];
        }
        handleUpdate({ ...landing, [arrayName]: arr });
    };

    const deleteItem = (arrayName: keyof typeof landing, index: number) => {
        const arr = [...(landing[arrayName] as any[])];
        arr.splice(index, 1);
        handleUpdate({ ...landing, [arrayName]: arr });
    };

    const handleImageUpload = (arrayName: keyof typeof landing, index: number, fieldName: string, e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Size check: ~2MB max
        if (file.size > 2 * 1024 * 1024) {
            toast.error("Image must be smaller than 2MB");
            return;
        }

        const reader = new FileReader();
        reader.onloadend = () => {
            const arr = [...(landing[arrayName] as any[])];
            arr[index] = { ...arr[index], [fieldName]: reader.result };
            handleUpdate({ ...landing, [arrayName]: arr });
        };
        reader.readAsDataURL(file);
    };

    /* ──── SECTION RENDERS ──── */

    const renderServices = () => (
        <div className="space-y-4">
            <div className="flex justify-between items-center bg-black/20 p-4 rounded-xl border border-white/5">
                <div>
                    <h3 className="font-semibold text-white">Services Section</h3>
                    <p className="text-sm text-zinc-400">Manage the standout features on your hero section</p>
                </div>
                <Button 
                    onClick={() => {
                        const newService = { id: Date.now().toString(), title: 'New Service', subtitle: '', desc: '', icon: 'Star', features: [] };
                        handleUpdate({ ...landing, services: [...landing.services, newService] });
                    }}
                    className="bg-orange-600 hover:bg-orange-700 text-white"
                >
                    <Plus className="w-4 h-4 mr-2" /> Add Service
                </Button>
            </div>
            {landing.services.map((item, idx) => (
                <Card key={idx} className={`${isDarkMode ? 'bg-[#141419] border-white/5' : 'bg-white'}`}>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-lg flex items-center gap-2">
                            {idx + 1}. {item.title || 'Draft Service'}
                        </CardTitle>
                        <div className="flex items-center gap-1">
                            <Button variant="ghost" size="icon" onClick={() => moveItem('services', idx, 'up')} disabled={idx === 0}><ArrowUp className="w-4 h-4" /></Button>
                            <Button variant="ghost" size="icon" onClick={() => moveItem('services', idx, 'down')} disabled={idx === landing.services.length - 1}><ArrowDown className="w-4 h-4" /></Button>
                            <Button variant="ghost" size="icon" onClick={() => onSave()} className="text-emerald-500 hover:text-emerald-400 hover:bg-emerald-500/10" title="Save this Service"><Save className="w-4 h-4" /></Button>
                            <Button variant="ghost" size="icon" onClick={() => deleteItem('services', idx)} className="text-red-500 hover:text-red-400 hover:bg-red-500/10"><Trash2 className="w-4 h-4" /></Button>
                        </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Title</Label>
                                <Input value={item.title || ''} onChange={(e) => {
                                    const arr = [...landing.services];
                                    arr[idx] = { ...arr[idx], title: e.target.value };
                                    handleUpdate({ ...landing, services: arr });
                                }} placeholder="e.g. Paint Protection Film"/>
                            </div>
                            <div className="space-y-2">
                                <Label>Subtitle/Tagline</Label>
                                <Input value={item.subtitle || ''} onChange={(e) => {
                                    const arr = [...landing.services];
                                    arr[idx] = { ...arr[idx], subtitle: e.target.value };
                                    handleUpdate({ ...landing, services: arr });
                                }} placeholder="e.g. Ultimate Defense"/>
                            </div>
                            <div className="space-y-2 md:col-span-2">
                                <Label>Description</Label>
                                <Input value={item.desc || ''} onChange={(e) => {
                                    const arr = [...landing.services];
                                    arr[idx] = { ...arr[idx], desc: e.target.value };
                                    handleUpdate({ ...landing, services: arr });
                                }} placeholder="Describe the service..."/>
                            </div>
                            <div className="space-y-2">
                                <Label>Icon (Lucide name)</Label>
                                <Input value={item.icon || ''} onChange={(e) => {
                                    const arr = [...landing.services];
                                    arr[idx] = { ...arr[idx], icon: e.target.value };
                                    handleUpdate({ ...landing, services: arr });
                                }} placeholder="e.g. Shield, Star, Crown"/>
                            </div>
                            <div className="space-y-2">
                                <Label>Service Image (Max 2MB)</Label>
                                <div className="flex items-center gap-4">
                                    {item.image && <img src={item.image} alt="preview" className="w-12 h-12 rounded object-cover border border-white/10" />}
                                    <Input type="file" accept="image/*" onChange={(e) => handleImageUpload('services', idx, 'image', e)} className="cursor-pointer" />
                                </div>
                            </div>
                            <div className="space-y-4 md:col-span-2 pt-4 border-t border-white/5">
                                <div className="flex justify-between items-center">
                                    <Label>Features List</Label>
                                    <Button size="sm" variant="outline" onClick={() => {
                                        const arr = [...landing.services];
                                        arr[idx] = { ...arr[idx], features: [...(arr[idx].features || []), ''] };
                                        handleUpdate({ ...landing, services: arr });
                                    }} className="h-7 text-xs">
                                        <Plus className="w-3 h-3 mr-1" /> Add Feature
                                    </Button>
                                </div>
                                <div className="space-y-2">
                                    {(!item.features || item.features.length === 0) && (
                                        <p className="text-xs text-zinc-500 italic">No features added yet.</p>
                                    )}
                                    {item.features?.map((feat: string, fidx: number) => (
                                        <div key={fidx} className="flex gap-2">
                                            <Input
                                                value={feat}
                                                onChange={(e) => {
                                                    const arr = [...landing.services];
                                                    const newFeats = [...arr[idx].features];
                                                    newFeats[fidx] = e.target.value;
                                                    arr[idx] = { ...arr[idx], features: newFeats };
                                                    handleUpdate({ ...landing, services: arr });
                                                }}
                                                placeholder={`Feature ${fidx + 1}`}
                                                className="h-8 text-sm"
                                            />
                                            <Button size="icon" variant="destructive" className="h-8 w-8 px-0 shrink-0" onClick={() => {
                                                const arr = [...landing.services];
                                                const newFeats = [...arr[idx].features];
                                                newFeats.splice(fidx, 1);
                                                arr[idx] = { ...arr[idx], features: newFeats };
                                                handleUpdate({ ...landing, services: arr });
                                            }}>
                                                <Trash2 className="w-3 h-3" />
                                            </Button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            ))}
        </div>
    );

    const renderPackages = () => (
        <div className="space-y-4">
            <div className="flex justify-between items-center bg-black/20 p-4 rounded-xl border border-white/5">
                <div>
                    <h3 className="font-semibold text-white">Pricing Packages</h3>
                    <p className="text-sm text-zinc-400">Manage your product pricing tiers</p>
                </div>
                <Button 
                    onClick={() => {
                        const newPkg = { id: Date.now().toString(), tier: 'New Package', tagline: '', focus: '', price: '₱0', icon: 'Star', features: [], recommended: false };
                        handleUpdate({ ...landing, packages: [...landing.packages, newPkg] });
                    }}
                    className="bg-orange-600 hover:bg-orange-700 text-white"
                >
                    <Plus className="w-4 h-4 mr-2" /> Add Package
                </Button>
            </div>
            {landing.packages.map((item, idx) => (
                <Card key={idx} className={`${isDarkMode ? 'bg-[#141419] border-white/5' : 'bg-white'}`}>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-lg flex items-center gap-2">
                            {idx + 1}. {item.tier || 'Draft Package'} {item.recommended && <span className="text-xs bg-orange-500/20 text-orange-400 px-2 py-0.5 rounded-full ml-2">Recommended</span>}
                        </CardTitle>
                        <div className="flex items-center gap-1">
                            <Button variant="ghost" size="icon" onClick={() => moveItem('packages', idx, 'up')} disabled={idx === 0}><ArrowUp className="w-4 h-4" /></Button>
                            <Button variant="ghost" size="icon" onClick={() => moveItem('packages', idx, 'down')} disabled={idx === landing.packages.length - 1}><ArrowDown className="w-4 h-4" /></Button>
                            <Button variant="ghost" size="icon" onClick={() => onSave()} className="text-emerald-500 hover:text-emerald-400 hover:bg-emerald-500/10" title="Save this Package"><Save className="w-4 h-4" /></Button>
                            <Button variant="ghost" size="icon" onClick={() => deleteItem('packages', idx)} className="text-red-500 hover:text-red-400 hover:bg-red-500/10"><Trash2 className="w-4 h-4" /></Button>
                        </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Tier Name</Label>
                                <Input value={item.tier || ''} onChange={(e) => {
                                    const arr = [...landing.packages];
                                    arr[idx] = { ...arr[idx], tier: e.target.value };
                                    handleUpdate({ ...landing, packages: arr });
                                }} placeholder="e.g. Elite"/>
                            </div>
                            <div className="space-y-2">
                                <Label>Starting Price</Label>
                                <Input value={item.price || ''} onChange={(e) => {
                                    const arr = [...landing.packages];
                                    arr[idx] = { ...arr[idx], price: e.target.value };
                                    handleUpdate({ ...landing, packages: arr });
                                }} placeholder="e.g. ₱8,500"/>
                            </div>
                            <div className="space-y-2 md:col-span-2">
                                <Label>Focus / Short Desc</Label>
                                <Input value={item.focus || ''} onChange={(e) => {
                                    const arr = [...landing.packages];
                                    arr[idx] = { ...arr[idx], focus: e.target.value };
                                    handleUpdate({ ...landing, packages: arr });
                                }} placeholder="Restoration & 1-year ceramic protection"/>
                            </div>
                            <div className="space-y-2">
                                <Label>Icon (Lucide name)</Label>
                                <Input value={item.icon || ''} onChange={(e) => {
                                    const arr = [...landing.packages];
                                    arr[idx] = { ...arr[idx], icon: e.target.value };
                                    handleUpdate({ ...landing, packages: arr });
                                }} placeholder="e.g. Sparkles, Star"/>
                            </div>
                            <div className="space-y-2 flex items-center gap-3 pt-6">
                                <Switch checked={item.recommended} onCheckedChange={(c) => {
                                    // Make only one recommended? Up to user, let's allow multi or manual
                                    const arr = [...landing.packages];
                                    arr[idx] = { ...arr[idx], recommended: c };
                                    handleUpdate({ ...landing, packages: arr });
                                }} />
                                <Label>Mark as Recommended</Label>
                            </div>
                            <div className="space-y-4 md:col-span-2 pt-4 border-t border-white/5">
                                <div className="flex justify-between items-center">
                                    <Label>Features List</Label>
                                    <Button size="sm" variant="outline" onClick={() => {
                                        const arr = [...landing.packages];
                                        arr[idx] = { ...arr[idx], features: [...(arr[idx].features || []), ''] };
                                        handleUpdate({ ...landing, packages: arr });
                                    }} className="h-7 text-xs">
                                        <Plus className="w-3 h-3 mr-1" /> Add Feature
                                    </Button>
                                </div>
                                <div className="space-y-2">
                                    {(!item.features || item.features.length === 0) && (
                                        <p className="text-xs text-zinc-500 italic">No features added yet.</p>
                                    )}
                                    {item.features?.map((feat: string, fidx: number) => (
                                        <div key={fidx} className="flex gap-2">
                                            <Input
                                                value={feat}
                                                onChange={(e) => {
                                                    const arr = [...landing.packages];
                                                    const newFeats = [...arr[idx].features];
                                                    newFeats[fidx] = e.target.value;
                                                    arr[idx] = { ...arr[idx], features: newFeats };
                                                    handleUpdate({ ...landing, packages: arr });
                                                }}
                                                placeholder={`Feature ${fidx + 1}`}
                                                className="h-8 text-sm"
                                            />
                                            <Button size="icon" variant="destructive" className="h-8 w-8 px-0 shrink-0" onClick={() => {
                                                const arr = [...landing.packages];
                                                const newFeats = [...arr[idx].features];
                                                newFeats.splice(fidx, 1);
                                                arr[idx] = { ...arr[idx], features: newFeats };
                                                handleUpdate({ ...landing, packages: arr });
                                            }}>
                                                <Trash2 className="w-3 h-3" />
                                            </Button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            ))}
        </div>
    );

    const renderStats = () => (
        <div className="space-y-4">
            <div className="flex justify-between items-center bg-black/20 p-4 rounded-xl border border-white/5">
                <div>
                    <h3 className="font-semibold text-white">Stats Bar</h3>
                    <p className="text-sm text-zinc-400">Numbers to show off on the landing page</p>
                </div>
                <Button 
                    onClick={() => {
                        const newStat = { id: Date.now().toString(), label: 'New Stat', value: '100+', icon: 'Star' };
                        handleUpdate({ ...landing, stats: [...landing.stats, newStat] });
                    }}
                    className="bg-orange-600 hover:bg-orange-700 text-white"
                >
                    <Plus className="w-4 h-4 mr-2" /> Add Stat
                </Button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {landing.stats.map((item, idx) => (
                    <Card key={idx} className={`${isDarkMode ? 'bg-[#141419] border-white/5' : 'bg-white'}`}>
                        <CardHeader className="flex flex-row items-center justify-between p-4 pb-2">
                            <CardTitle className="text-base">Stat {idx + 1}</CardTitle>
                            <div className="flex items-center gap-1">
                                <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-emerald-500" onClick={() => onSave()} title="Save Stat"><Save className="w-4 h-4" /></Button>
                                <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-red-500" onClick={() => deleteItem('stats', idx)}><Trash2 className="w-4 h-4" /></Button>
                            </div>
                        </CardHeader>
                        <CardContent className="p-4 pt-0 space-y-3">
                            <div className="space-y-1">
                                <Label className="text-xs">Value (e.g. 5000+)</Label>
                                <Input value={item.value || ''} onChange={(e) => {
                                    const arr = [...landing.stats];
                                    arr[idx] = { ...arr[idx], value: e.target.value };
                                    handleUpdate({ ...landing, stats: arr });
                                }} />
                            </div>
                            <div className="space-y-1">
                                <Label className="text-xs">Label (e.g. Cars Protected)</Label>
                                <Input value={item.label || ''} onChange={(e) => {
                                    const arr = [...landing.stats];
                                    arr[idx] = { ...arr[idx], label: e.target.value };
                                    handleUpdate({ ...landing, stats: arr });
                                }} />
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>
        </div>
    );

    const renderGallery = () => (
        <div className="space-y-4">
            <div className="flex justify-between items-center bg-black/20 p-4 rounded-xl border border-white/5">
                <div>
                    <h3 className="font-semibold text-white">Gallery Showcase</h3>
                    <p className="text-sm text-zinc-400">Upload portfolio images (Max 2MB per image)</p>
                </div>
                <div className="relative">
                    <Input 
                        type="file" 
                        accept="image/*" 
                        multiple
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                        onChange={(e) => {
                            if (!e.target.files) return;
                            const newFiles = Array.from(e.target.files);
                            const currentGallery = [...landing.gallery];
                            
                            newFiles.forEach(file => {
                                if (file.size > 2 * 1024 * 1024) {
                                    toast.error(`${file.name} is larger than 2MB and was skipped.`);
                                    return;
                                }
                                const reader = new FileReader();
                                reader.onloadend = () => {
                                    currentGallery.push({ id: Date.now().toString() + Math.random(), url: reader.result as string, caption: '' });
                                    handleUpdate({ ...landing, gallery: currentGallery });
                                };
                                reader.readAsDataURL(file);
                            });
                        }}
                    />
                    <Button className="bg-orange-600 hover:bg-orange-700 text-white pointer-events-none">
                        <Upload className="w-4 h-4 mr-2" /> Upload Photos
                    </Button>
                </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {landing.gallery.map((item, idx) => (
                    <div key={idx} className={`relative group rounded-xl overflow-hidden border ${isDarkMode ? 'border-white/10' : 'border-gray-200'} aspect-[4/3]`}>
                        <img src={item.url} alt="Gallery" className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center p-4 gap-2">
                            <Input 
                                placeholder="Add caption..." 
                                className="h-8 text-xs bg-white/10 border-white/20 text-white placeholder:text-white/50"
                                value={item.caption || ''}
                                onChange={(e) => {
                                    const arr = [...landing.gallery];
                                    arr[idx] = { ...arr[idx], caption: e.target.value };
                                    handleUpdate({ ...landing, gallery: arr });
                                }}
                            />
                            <div className="flex gap-2 w-full">
                                <Button size="sm" variant="secondary" className="flex-1 h-8" onClick={() => moveItem('gallery', idx, 'up')} disabled={idx === 0}><ArrowUp className="w-3 h-3" /></Button>
                                <Button size="sm" variant="secondary" className="flex-1 h-8" onClick={() => moveItem('gallery', idx, 'down')} disabled={idx === landing.gallery.length - 1}><ArrowDown className="w-3 h-3" /></Button>
                                <Button size="sm" variant="destructive" className="flex-1 h-8 bg-red-500" onClick={() => deleteItem('gallery', idx)}><Trash2 className="w-3 h-3" /></Button>
                            </div>
                        </div>
                    </div>
                ))}
                {landing.gallery.length === 0 && (
                    <div className="col-span-full py-12 flex flex-col items-center justify-center text-zinc-500 bg-black/10 rounded-xl border border-dashed border-white/10">
                        <ImageIcon className="w-8 h-8 mb-2 opacity-50" />
                        <p>No gallery images uploaded yet</p>
                    </div>
                )}
            </div>
        </div>
    );

    const TABS = [
        { id: 'services', label: 'Services', icon: Briefcase },
        { id: 'packages', label: 'Packages', icon: Star },
        { id: 'stats', label: 'Stats Bar', icon: ChevronUp },
        { id: 'gallery', label: 'Gallery', icon: ImageIcon },
    ] as const;

    return (
        <div className="flex flex-col gap-6 max-w-6xl mx-auto">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h2 className={`text-2xl font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Landing Page Editor</h2>
                    <p className={`text-sm ${isDarkMode ? 'text-zinc-400' : 'text-gray-500'}`}>Edit your public landing page content instantly in real-time.</p>
                </div>
                <Button 
                    onClick={() => onSave()}
                    className="bg-orange-600 hover:bg-orange-700 text-white shadow-lg shadow-orange-500/20"
                >
                    <Save className="w-4 h-4 mr-2" />
                    Save Live Changes
                </Button>
            </div>

            {/* Sub-navigation */}
            <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                {TABS.map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveSection(tab.id as any)}
                        className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium whitespace-nowrap transition-all duration-200 border
                            ${activeSection === tab.id 
                                ? (isDarkMode ? 'bg-[#1E1E2A] text-orange-400 border-orange-500/30 shadow-[0_0_15px_rgba(255,107,0,0.1)]' : 'bg-orange-50 text-orange-600 border-orange-200')
                                : (isDarkMode ? 'bg-[#0A0A0F] text-zinc-400 border-[#1E1E2A] hover:bg-[#141419] hover:text-zinc-200' : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50 hover:text-gray-900')
                            }
                        `}
                    >
                        <tab.icon className="w-4 h-4" />
                        {tab.label}
                    </button>
                ))}
                
                {isCompletelyEmpty && (
                    <div className="ml-auto text-xs text-orange-500/70 border border-orange-500/20 bg-orange-500/10 px-3 py-1.5 rounded-lg flex items-center">
                        Loaded demo presets
                    </div>
                )}
            </div>

            {/* Display Active Panel */}
            <div className="min-h-[500px]">
                <AnimatePresence mode="wait">
                    <motion.div
                        key={activeSection}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        transition={{ duration: 0.2 }}
                    >
                        {activeSection === 'services' && renderServices()}
                        {activeSection === 'packages' && renderPackages()}
                        {activeSection === 'stats' && renderStats()}
                        {activeSection === 'gallery' && renderGallery()}
                    </motion.div>
                </AnimatePresence>
            </div>
        </div>
    );
}
