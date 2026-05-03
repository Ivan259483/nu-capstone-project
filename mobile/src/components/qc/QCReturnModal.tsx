import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  ScrollView,
  ActivityIndicator,
  Pressable,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { RETURN_REASONS } from '@/services/api/qcService';

interface Props {
  visible: boolean;
  jobId: string;
  technician: string;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<void>;
}

export default function QCReturnModal({ visible, jobId, technician, onClose, onConfirm }: Props) {
  const [selectedReason, setSelectedReason] = useState<string | null>(null);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!selectedReason) return;
    const fullReason = `${selectedReason}${comment.trim() ? ': ' + comment.trim() : ''}`;
    setSubmitting(true);
    try {
      await onConfirm(fullReason);
    } finally {
      setSubmitting(false);
      setSelectedReason(null);
      setComment('');
    }
  };

  const handleClose = () => {
    if (submitting) return;
    setSelectedReason(null);
    setComment('');
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <Pressable style={s.overlay} onPress={handleClose}>
        <Pressable style={s.sheet} onPress={(e) => e.stopPropagation()}>
          {/* Drag handle */}
          <View style={s.handleBar} />

          {/* Header */}
          <View style={s.header}>
            <View style={s.headerIconWrap}>
              <Feather name="rotate-ccw" size={16} color="#EF4444" />
            </View>
            <View style={s.headerText}>
              <Text style={s.headerTitle}>Return to Technician</Text>
              <Text style={s.headerSub}>{jobId} → {technician || 'Unassigned'}</Text>
            </View>
            <TouchableOpacity onPress={handleClose} style={s.closeBtn} hitSlop={12}>
              <Feather name="x" size={18} color="#888" />
            </TouchableOpacity>
          </View>

          <ScrollView style={s.body} showsVerticalScrollIndicator={false} bounces={false}>
            {/* Reason label */}
            <Text style={s.sectionLabel}>
              Reason for Return <Text style={s.required}>*</Text>
            </Text>
            <Text style={s.hint}>Select the primary issue that requires correction</Text>

            {/* Reason options */}
            <View style={s.reasonList}>
              {RETURN_REASONS.map((reason) => {
                const active = selectedReason === reason;
                return (
                  <TouchableOpacity
                    key={reason}
                    onPress={() => setSelectedReason(reason)}
                    activeOpacity={0.7}
                    style={[s.reasonItem, active && s.reasonItemActive]}
                  >
                    <View style={[s.radio, active && s.radioActive]}>
                      {active && <View style={s.radioInner} />}
                    </View>
                    <Text style={[s.reasonText, active && s.reasonTextActive]} numberOfLines={2}>
                      {reason}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Comment */}
            <Text style={s.sectionLabel}>Additional Comments</Text>
            <Text style={s.hint}>
              Be specific — {technician || 'the technician'} will use this to correct the job
            </Text>
            <TextInput
              style={s.textArea}
              value={comment}
              onChangeText={setComment}
              placeholder="Describe what needs to be corrected…"
              placeholderTextColor="#666"
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />

            {/* Warning */}
            <View style={s.warningBox}>
              <Feather name="alert-triangle" size={13} color="#F59E0B" />
              <Text style={s.warningText}>
                Returning this job will notify {technician || 'the technician'} immediately. The job status will change to{' '}
                <Text style={s.warningBold}>Needs Fix</Text> and re-enter your review queue once resubmitted.
              </Text>
            </View>
          </ScrollView>

          {/* Actions */}
          <View style={s.footer}>
            <TouchableOpacity onPress={handleClose} style={s.cancelBtn} activeOpacity={0.7}>
              <Text style={s.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleSubmit}
              disabled={!selectedReason || submitting}
              style={[s.submitBtn, (!selectedReason || submitting) && s.submitBtnDisabled]}
              activeOpacity={0.8}
            >
              {submitting ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <>
                  <Feather name="rotate-ccw" size={14} color="#FFF" />
                  <Text style={s.submitBtnText}>Return</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#141414',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '88%',
    borderTopWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  handleBar: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
  },
  headerIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  headerText: {
    flex: 1,
  },
  headerTitle: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
  },
  headerSub: {
    color: '#888',
    fontSize: 12,
    marginTop: 2,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  sectionLabel: {
    color: '#E0E0E0',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },
  required: {
    color: '#EF4444',
  },
  hint: {
    color: '#666',
    fontSize: 12,
    marginBottom: 12,
  },
  reasonList: {
    marginBottom: 20,
  },
  reasonItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    marginBottom: 6,
  },
  reasonItemActive: {
    borderColor: 'rgba(239, 68, 68, 0.4)',
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
  },
  radio: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: '#555',
    marginRight: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioActive: {
    borderColor: '#EF4444',
  },
  radioInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#EF4444',
  },
  reasonText: {
    flex: 1,
    color: '#CCC',
    fontSize: 13,
  },
  reasonTextActive: {
    color: '#FFF',
    fontWeight: '500',
  },
  textArea: {
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 12,
    color: '#FFF',
    fontSize: 14,
    padding: 14,
    minHeight: 100,
    marginBottom: 16,
  },
  warningBox: {
    flexDirection: 'row',
    backgroundColor: 'rgba(245, 158, 11, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.15)',
    borderRadius: 12,
    padding: 14,
    marginBottom: 20,
    gap: 10,
  },
  warningText: {
    flex: 1,
    color: '#CCC',
    fontSize: 12,
    lineHeight: 18,
  },
  warningBold: {
    fontWeight: '700',
    color: '#F59E0B',
  },
  footer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 16,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.06)',
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtnText: {
    color: '#AAA',
    fontSize: 14,
    fontWeight: '600',
  },
  submitBtn: {
    flex: 1,
    flexDirection: 'row',
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  submitBtnDisabled: {
    opacity: 0.4,
  },
  submitBtnText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '700',
  },
});
