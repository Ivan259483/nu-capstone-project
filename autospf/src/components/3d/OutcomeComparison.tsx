import React, { useState, useEffect } from 'react';
import { Slider } from '@/components/ui/slider';
import { Card, CardContent } from '@/components/ui/card';
import { Sparkles, Activity } from 'lucide-react';

interface OutcomeComparisonProps {
    onOutcomeChange: (roughness: number, metalness: number) => void;
    baseRoughness?: number;
}

const OutcomeComparison: React.FC<OutcomeComparisonProps> = ({
    onOutcomeChange,
    baseRoughness = 0.7
}) => {
    const [glossLevel, setGlossLevel] = useState([50]); // 0-100

    useEffect(() => {
        // Map slider (0-100) to material properties
        // 0% = Scratched/Dull (Roughness high, Metalness low)
        // 100% = Ceramic Coated (Roughness low, Metalness high)

        const value = glossLevel[0];
        const normalized = value / 100;

        // Roughness: 0.8 -> 0.1
        const targetRoughness = baseRoughness - (normalized * (baseRoughness - 0.1));

        // Metalness: 0.1 -> 0.7
        const targetMetalness = 0.1 + (normalized * 0.6);

        onOutcomeChange(targetRoughness, targetMetalness);
    }, [glossLevel, baseRoughness, onOutcomeChange]);

    return (
        <Card className="w-full bg-zinc-900 border-zinc-800 mt-4">
            <CardContent className="p-6">
                <div className="flex items-center justify-between mb-4">
                    <div className="space-y-1">
                        <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                            <Activity className="w-5 h-5 text-orange-500" />
                            Outcome Simulator
                        </h3>
                        <p className="text-sm text-zinc-400">
                            Drags slider to apply Ceramic Coating
                        </p>
                    </div>
                    <div className="text-right">
                        <div className="text-2xl font-bold text-orange-500">
                            {glossLevel[0]}%
                        </div>
                        <span className="text-xs text-zinc-500 uppercase tracking-wider">Gloss Level</span>
                    </div>
                </div>

                <div className="relative pt-6 pb-2">
                    <Slider
                        value={glossLevel}
                        onValueChange={setGlossLevel}
                        max={100}
                        step={1}
                        className="cursor-pointer"
                    />
                    <div className="flex justify-between mt-2 text-xs text-zinc-500 font-medium">
                        <span>BEFORE (Swirled/Dull)</span>
                        <span>AFTER (Mirror Finish)</span>
                    </div>
                </div>

                <div className="mt-4 p-3 rounded-lg bg-orange-500/10 border border-orange-500/20 flex items-start gap-3">
                    <Sparkles className="w-5 h-5 text-orange-500 shrink-0 mt-0.5" />
                    <div>
                        <h4 className="text-sm font-medium text-orange-400">Treatment Applied:</h4>
                        <p className="text-xs text-zinc-300 mt-1">
                            {glossLevel[0] < 30 ? 'Untreated surface. Micro-scratches visible.' :
                                glossLevel[0] < 70 ? 'Paint Correction (Stage 1). Swirls removed.' :
                                    '9H Ceramic Coating. Hydrophobic & high-gloss finish.'}
                        </p>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
};

export default OutcomeComparison;
