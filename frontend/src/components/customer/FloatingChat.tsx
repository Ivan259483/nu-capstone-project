import React, { useState } from 'react';
import { MessageSquare, X, Send, Bot } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

export const FloatingChat: React.FC = () => {
    const [isOpen, setIsOpen] = useState(false);
    const [message, setMessage] = useState('');
    const [messages, setMessages] = useState<{ role: 'user' | 'assistant', content: string }[]>([
        { role: 'assistant', content: 'Hi there! I am AutoSPF+ Support AI. How can I help you regarding your detailing service today?' }
    ]);

    const handleSend = () => {
        if (!message.trim()) return;

        setMessages(prev => [...prev, { role: 'user', content: message }]);
        setMessage('');

        // Simulate AI response
        setTimeout(() => {
            setMessages(prev => [
                ...prev,
                { role: 'assistant', content: 'Thank you for your message! Our AI support team is currently assisting other customers. An agent will get back to you shortly, or we can connect you directly to your assigned detailer.' }
            ]);
            toast.info("New message from Support");
        }, 1500);
    };

    return (
        <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end">
            {/* Chat Window */}
            {isOpen && (
                <Card className="w-80 h-96 mb-4 bg-zinc-900 border-zinc-800 shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
                    <CardHeader className="p-4 border-b border-zinc-800 bg-zinc-900/90 flex flex-row items-center justify-between">
                        <CardTitle className="text-sm font-semibold flex items-center gap-2 text-white">
                            <Bot className="w-4 h-4 text-indigo-400" /> AutoSPF+ Support
                        </CardTitle>
                        <Button variant="ghost" size="sm" className="h-6 w-6 p-0 hover:bg-zinc-800" onClick={() => setIsOpen(false)}>
                            <X className="h-4 w-4 text-zinc-400" />
                        </Button>
                    </CardHeader>

                    <CardContent className="flex-1 p-4 overflow-y-auto space-y-4">
                        {messages.map((msg, idx) => (
                            <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${msg.role === 'user'
                                        ? 'bg-indigo-600 text-white rounded-br-sm'
                                        : 'bg-zinc-800 text-zinc-300 rounded-bl-sm border border-zinc-700'
                                    }`}>
                                    {msg.content}
                                </div>
                            </div>
                        ))}
                    </CardContent>

                    <CardFooter className="p-3 border-t border-zinc-800 bg-zinc-950">
                        <form
                            onSubmit={(e) => { e.preventDefault(); handleSend(); }}
                            className="flex w-full items-center space-x-2"
                        >
                            <Input
                                type="text"
                                placeholder="Type your message..."
                                value={message}
                                onChange={(e) => setMessage(e.target.value)}
                                className="flex-1 bg-zinc-900 border-zinc-700 text-white h-9 rounded-full text-sm focus-visible:ring-indigo-500"
                            />
                            <Button
                                type="submit"
                                size="sm"
                                className="w-9 h-9 rounded-full p-0 bg-indigo-600 hover:bg-indigo-700 shrink-0"
                                disabled={!message.trim()}
                            >
                                <Send className="h-4 w-4" />
                                <span className="sr-only">Send</span>
                            </Button>
                        </form>
                    </CardFooter>
                </Card>
            )}

            {/* Toggle Button */}
            <Button
                size="icon"
                className={`w-14 h-14 rounded-full shadow-2xl transition-all duration-300 ${isOpen
                        ? 'bg-zinc-800 hover:bg-zinc-700 text-zinc-400 border border-zinc-700'
                        : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-500/20 hover:scale-105'
                    }`}
                onClick={() => setIsOpen(!isOpen)}
            >
                {isOpen ? <X className="w-6 h-6" /> : <MessageSquare className="w-6 h-6" />}
            </Button>
        </div>
    );
};
