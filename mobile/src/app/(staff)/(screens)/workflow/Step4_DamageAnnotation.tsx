import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, TextInput, ScrollView, Dimensions } from 'react-native';
import { useWorkflow } from './WorkflowContext';
import { useTheme } from '@/hooks/useThemeContext';
import { CheckCircle, Clock, X, MapPin, Camera } from '@/components/ui/Icons';
import Svg, { Rect, Path, Circle } from 'react-native-svg';

const DAMAGE_TYPES = ['scratch', 'swirl', 'dent', 'paint chip', 'crack', 'curb rash', 'repaint history', 'stain'];
const SEVERITY_LEVELS = ['low', 'medium', 'high'];

export default function Step4_DamageAnnotation() {
  const { colors, isDark } = useTheme();
  const { job, saveStep, saving } = useWorkflow();

  const [markers, setMarkers] = useState<any[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [activeCoord, setActiveCoord] = useState<{x: number, y: number} | null>(null);
  
  // Form state
  const [selectedType, setSelectedType] = useState('scratch');
  const [selectedSeverity, setSelectedSeverity] = useState('medium');
  const [notes, setNotes] = useState('');
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  useEffect(() => {
    if (job?.damageAnnotations) {
      setMarkers(job.damageAnnotations);
    }
  }, [job]);

  const handleSvgPress = (e: any) => {
    const { locationX, locationY } = e.nativeEvent;
    // Map Cartesian coordinates relative to SVG canvas (approx 300x600)
    setActiveCoord({ x: locationX, y: locationY });
    setEditingIndex(null);
    resetForm();
    setModalVisible(true);
  };

  const handleMarkerPress = (index: number) => {
    const m = markers[index];
    setActiveCoord({ x: m.x, y: m.y });
    setSelectedType(m.type);
    setSelectedSeverity(m.severity || 'medium');
    setNotes(m.note || '');
    setEditingIndex(index);
    setModalVisible(true);
  };

  const resetForm = () => {
    setSelectedType('scratch');
    setSelectedSeverity('medium');
    setNotes('');
  };

  const saveAnnotation = () => {
    if (!activeCoord) return;
    
    const newMarker = {
      x: activeCoord.x,
      y: activeCoord.y,
      panel: 'exterior_shell', // Could be mathematically derived based on X/Y if needed
      type: selectedType,
      severity: selectedSeverity,
      note: notes,
      images: [] // Placeholder for future camera integration
    };

    let updatedMarkers = [...markers];
    if (editingIndex !== null) {
      updatedMarkers[editingIndex] = newMarker;
    } else {
      updatedMarkers.push(newMarker);
    }

    setMarkers(updatedMarkers);
    setModalVisible(false);
    
    // Optimistic Save
    saveStep(4, { annotations: updatedMarkers }, false);
  };

  const handleAdvance = () => {
    saveStep(4, { annotations: markers }, true);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
         <Text style={[styles.title, { color: colors.text }]}>Damage Annotation</Text>
         <Text style={styles.subtitle}>Tap the vehicle surface to pin pre-existing damage.</Text>
      </View>

      <View style={styles.svgContainer}>
         {/* Top-Down Car Silhouette Viewbox matches typical mobile safe width */}
         <TouchableOpacity activeOpacity={1} onPress={handleSvgPress}>
            <Svg width="100%" height="450" viewBox="0 0 200 400">
               {/* Body Chassis outline */}
               <Rect x="50" y="40" width="100" height="320" rx="20" fill={isDark ? '#222' : '#e4e4e7'} stroke={isDark ? '#444' : '#ccc'} strokeWidth="4" />
               {/* Hood */}
               <Rect x="60" y="50" width="80" height="70" rx="10" fill={isDark ? '#333' : '#d4d4d8'} />
               {/* Roof / Cabin */}
               <Rect x="55" y="140" width="90" height="100" rx="25" fill={isDark ? '#111' : '#fefefe'} stroke="#f97316" strokeWidth="1" />
               {/* Trunk */}
               <Rect x="60" y="270" width="80" height="50" rx="10" fill={isDark ? '#333' : '#d4d4d8'} />
               {/* Front Bumpers */}
               <Path d="M50 60 Q100 20 150 60" fill="none" stroke="#f97316" strokeWidth="3" />
               {/* Rear Bumpers */}
               <Path d="M50 340 Q100 380 150 340" fill="none" stroke="#f97316" strokeWidth="3" />
               
               {/* Wheels */}
               <Rect x="35" y="70" width="15" height="40" rx="4" fill="#000" />
               <Rect x="150" y="70" width="15" height="40" rx="4" fill="#000" />
               <Rect x="35" y="280" width="15" height="40" rx="4" fill="#000" />
               <Rect x="150" y="280" width="15" height="40" rx="4" fill="#000" />

               {/* Render Markers */}
               {markers.map((m, i) => (
                  <Circle
                    key={i}
                    cx={m.x}
                    cy={m.y}
                    r="8"
                    fill={m.severity === 'high' ? '#ef4444' : m.severity === 'medium' ? '#f97316' : '#eab308'}
                    stroke="#fff"
                    strokeWidth="2"
                    onPress={() => handleMarkerPress(i)}
                  />
               ))}
            </Svg>
         </TouchableOpacity>
      </View>

      <View style={styles.actionFooter}>
        <TouchableOpacity 
          style={[styles.saveBtn, saving && { opacity: 0.7 }]} 
          onPress={handleAdvance}
          disabled={saving}
        >
          {saving ? <Clock color="#fff" style={{marginRight: 8}}/> : <CheckCircle color="#fff" style={{marginRight: 8}}/>}
          <Text style={styles.saveBtnText}>{saving ? 'Saving...' : 'Confirm Annotations'}</Text>
        </TouchableOpacity>
      </View>

      {/* Editor Modal */}
      <Modal transparent visible={modalVisible} animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: isDark ? '#111' : '#fff' }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Add Damage Marker</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}><X color={colors.text} size={24} /></TouchableOpacity>
            </View>

            <ScrollView>
              <Text style={styles.label}>Damage Type</Text>
              <View style={styles.chipsContainer}>
                {DAMAGE_TYPES.map(type => (
                  <TouchableOpacity 
                     key={type} 
                     style={[styles.chip, selectedType === type && styles.chipActive]}
                     onPress={() => setSelectedType(type)}
                  >
                    <Text style={[styles.chipText, selectedType === type && styles.chipTextActive]}>{type}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.label}>Severity Level</Text>
              <View style={styles.chipsContainer}>
                {SEVERITY_LEVELS.map(sev => (
                  <TouchableOpacity 
                     key={sev} 
                     style={[styles.chip, selectedSeverity === sev && styles.chipActive]}
                     onPress={() => setSelectedSeverity(sev)}
                  >
                    <Text style={[styles.chipText, selectedSeverity === sev && styles.chipTextActive, { textTransform: 'capitalize' }]}>{sev}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.label}>Notes</Text>
              <TextInput 
                style={[styles.input, { color: colors.text, borderColor: isDark ? '#333' : '#ddd' }]} 
                value={notes} onChangeText={setNotes} multiline placeholder="Deep scratch to primer layer..." placeholderTextColor="#666" 
              />
              
              <TouchableOpacity style={[styles.photoBtn, { backgroundColor: isDark ? '#222' : '#f4f4f5' }]}>
                 <Camera size={20} color="#a1a1aa" />
                 <Text style={{color: '#a1a1aa', fontWeight: 'bold', marginLeft: 8}}>Attach Photo (Optional)</Text>
              </TouchableOpacity>
            </ScrollView>

            <View style={{ flexDirection: 'row', gap: 16, marginTop: 24 }}>
              {editingIndex !== null && (
                 <TouchableOpacity style={styles.deleteBtn} onPress={() => {
                   const nm = [...markers];
                   nm.splice(editingIndex, 1);
                   setMarkers(nm);
                   setModalVisible(false);
                   saveStep(4, { annotations: nm }, false);
                 }}>
                   <Text style={styles.deleteBtnText}>Remove</Text>
                 </TouchableOpacity>
              )}
              <TouchableOpacity style={styles.modalSaveBtn} onPress={saveAnnotation}>
                <Text style={styles.modalSaveBtnText}>Save Marker</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { padding: 24, paddingBottom: 10 },
  title: { fontSize: 24, fontWeight: '800', marginBottom: 6 },
  subtitle: { fontSize: 14, color: '#a1a1aa' },
  svgContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  actionFooter: { padding: 24, paddingBottom: 40 },
  saveBtn: { backgroundColor: '#f97316', padding: 18, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', shadowColor: '#f97316', shadowOffset: {width: 0, height: 4}, shadowOpacity: 0.4, shadowRadius: 10 },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  
  // Modal styles
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'flex-end' },
  modalContent: { borderTopLeftRadius: 30, borderTopRightRadius: 30, padding: 24, maxHeight: Dimensions.get('window').height * 0.8 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 20, fontWeight: 'bold' },
  label: { fontSize: 12, fontWeight: '600', color: '#a1a1aa', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12, marginTop: 16 },
  chipsContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 20, borderWidth: 1, borderColor: '#444' },
  chipActive: { backgroundColor: '#f97316', borderColor: '#f97316' },
  chipText: { color: '#a1a1aa', fontWeight: '600' },
  chipTextActive: { color: '#fff' },
  input: { borderWidth: 1, borderRadius: 12, padding: 16, fontSize: 16, height: 80, textAlignVertical: 'top' },
  photoBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 16, borderRadius: 12, marginTop: 16, borderWidth: 1, borderColor: '#333', borderStyle: 'dashed' },
  modalSaveBtn: { flex: 2, backgroundColor: '#f97316', padding: 18, borderRadius: 12, alignItems: 'center' },
  modalSaveBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  deleteBtn: { flex: 1, padding: 18, borderRadius: 12, borderWidth: 1, borderColor: '#ef4444', alignItems: 'center' },
  deleteBtnText: { color: '#ef4444', fontSize: 16, fontWeight: 'bold' }
});
