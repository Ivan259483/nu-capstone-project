import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { ClipboardEdit } from 'lucide-react';
import { SERVICE_CATEGORIES } from './serviceConfig';
import type { Booking } from '@/types';

interface Step1Props {
  order: Booking;
  onComplete: (data: any) => Promise<void>;
  isCompleted: boolean;
}

export default function Step1_JobOrder({ order, onComplete, isCompleted }: Step1Props) {
  const defaultIngress = order.jobOrder?.ingressDateTime || 
    (order.date && order.time ? new Date(`${order.date}T${order.time}`).toISOString().slice(0, 16) : new Date().toISOString().slice(0, 16));

  // Permissive Extraction Helpers
  const o = order as any;
  const extCustomerName = o.customerName || (o.customer && (o.customer.name || o.customer.fullName)) || o.name || '';
  const extContactNumber = o.jobOrder?.contactNumber || o.customerPhone || (o.customer && o.customer.phone) || o.contactNumber || o.mobileNumber || o.phone || '';
  const extVehicleType = (o.vehicle && o.vehicle.make) || o.vehicleType || o.vehicleMake || '';
  const extVehicleModel = (o.vehicle && o.vehicle.model) || o.vehicleModel || (o.vehicleInfo && String(o.vehicleInfo).includes(extVehicleType) ? String(o.vehicleInfo).replace(extVehicleType, '').trim() : o.vehicleInfo) || '';
  const extVehiclePlate = (o.vehicle && o.vehicle.plateNumber) || o.plateNumber || o.plateNo || o.vehiclePlate || '';
  const extServiceCategory = o.jobOrder?.serviceCategory || o.serviceCategory || o.serviceType || o.serviceName || 'ceramic_coating';

  const [form, setForm] = useState({
    customerName: extCustomerName,
    contactNumber: extContactNumber,
    vehicleType: extVehicleType,
    vehicleModel: extVehicleModel,
    vehicleYear: o.vehicleYear || (o.vehicle && o.vehicle.year) || '',
    vehicleColor: o.vehicleColor || (o.vehicle && o.vehicle.color) || '',
    vehiclePlate: extVehiclePlate,
    serviceCategory: extServiceCategory,
    preferredDate: o.date || o.bookingDate || '',
    preferredTime: o.time || o.bookingTime || '',
    ingressDateTime: defaultIngress,
    targetReleaseDate: o.jobOrder?.targetReleaseDate || '',
    estimatedDays: o.jobOrder?.estimatedDays || 1,
  });

  const [saving, setSaving] = useState(false);

  // Sync form if order prop updates unexpectedly
  useEffect(() => {
    if (!isCompleted) {
      setForm(prev => ({
        ...prev,
        customerName: extCustomerName || prev.customerName,
        contactNumber: extContactNumber || prev.contactNumber,
        vehicleType: extVehicleType || prev.vehicleType,
        vehicleModel: extVehicleModel || prev.vehicleModel,
        vehiclePlate: extVehiclePlate || prev.vehiclePlate,
        serviceCategory: extServiceCategory || prev.serviceCategory,
      }));
    }
  }, [order, isCompleted]);

  const handleChange = (field: string, value: any) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async () => {
    if (!form.vehicleModel || !form.customerName || !form.serviceCategory) return;
    setSaving(true);
    try {
      await onComplete(form);
    } finally {
      setSaving(false);
    }
  };

  const isValid = form.vehicleModel && form.customerName && form.serviceCategory && form.contactNumber;

  // Lock input if it originally came with data from the booking so it's not accidentally altered unless missing
  const isLocked = (fieldVal: any) => isCompleted || !!fieldVal;

  return (
    <motion.div className="step-panel" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
      <div className="step-header">
        <h3><ClipboardEdit style={{ width: 20, height: 20, color: 'var(--accent)', marginRight: 8, verticalAlign: 'middle' }} />Job Order</h3>
        <p>Replicate the blue Job Order pad — verify vehicle and service details before proceeding</p>
      </div>

      {/* Customer Info */}
      <div className="step-section">
        <div className="step-section-title">Customer Information</div>
        <div className="wf-form-grid">
          <div className="wf-field">
            <label className="wf-label">Customer Name</label>
            <input className="wf-input" value={form.customerName} onChange={e => handleChange('customerName', e.target.value)} placeholder="Full Name" disabled={isLocked(order.customerName)} />
          </div>
          <div className="wf-field">
            <label className="wf-label">Contact Number</label>
            <input className="wf-input" value={form.contactNumber} onChange={e => handleChange('contactNumber', e.target.value)} placeholder="09XX-XXX-XXXX" disabled={isLocked(order.customerPhone)} />
          </div>
          <div className="wf-field">
            <label className="wf-label">Preferred Date (Booking)</label>
            <input className="wf-input" value={form.preferredDate} disabled />
          </div>
          <div className="wf-field">
            <label className="wf-label">Preferred Time (Booking)</label>
            <input className="wf-input" value={form.preferredTime} disabled />
          </div>
        </div>
      </div>

      {/* Vehicle Info */}
      <div className="step-section">
        <div className="step-section-title">Vehicle Details</div>
        <div className="wf-form-grid">
          <div className="wf-field">
            <label className="wf-label">Vehicle Make / Type</label>
            <input className="wf-input" value={form.vehicleType} onChange={e => handleChange('vehicleType', e.target.value)} placeholder="e.g. Toyota" disabled={isLocked((order as any).vehicleType || order.vehicleMake)} />
          </div>
          <div className="wf-field">
            <label className="wf-label">Vehicle Model</label>
            <input className="wf-input" value={form.vehicleModel} onChange={e => handleChange('vehicleModel', e.target.value)} placeholder="e.g. Fortuner" disabled={isLocked(order.vehicleModel || order.vehicleInfo)} />
          </div>
          <div className="wf-field">
            <label className="wf-label">Year</label>
            <input className="wf-input" value={form.vehicleYear} onChange={e => handleChange('vehicleYear', e.target.value)} placeholder="e.g. 2024" disabled={isLocked(order.vehicleYear)} />
          </div>
          <div className="wf-field">
            <label className="wf-label">Color</label>
            <input className="wf-input" value={form.vehicleColor} onChange={e => handleChange('vehicleColor', e.target.value)} placeholder="e.g. White Pearl" disabled={isLocked(order.vehicleColor)} />
          </div>
          <div className="wf-field">
            <label className="wf-label">Plate Number</label>
            <input className="wf-input" value={form.vehiclePlate} onChange={e => handleChange('vehiclePlate', e.target.value)} placeholder="ABC-1234" disabled={isLocked((order as any).plateNumber || order.vehiclePlate)} />
          </div>
        </div>
      </div>

      {/* Service Info */}
      <div className="step-section">
        <div className="step-section-title">Service Details</div>
        <div className="wf-form-grid">
          <div className="wf-field full">
            <label className="wf-label">Service Type</label>
            <select className="wf-select" value={form.serviceCategory} onChange={e => handleChange('serviceCategory', e.target.value)} disabled={isLocked((order as any).serviceCategory || order.serviceType || order.serviceName)}>
              {SERVICE_CATEGORIES.map(cat => (
                <option key={cat.value} value={cat.value}>{cat.label}</option>
              ))}
            </select>
          </div>
          <div className="wf-field">
            <label className="wf-label">Date & Time of Ingress</label>
            <input type="datetime-local" className="wf-input" value={form.ingressDateTime} onChange={e => handleChange('ingressDateTime', e.target.value)} disabled={isCompleted} />
          </div>
          <div className="wf-field">
            <label className="wf-label">Target Release Date</label>
            <input type="date" className="wf-input" value={form.targetReleaseDate} onChange={e => handleChange('targetReleaseDate', e.target.value)} disabled={isCompleted} />
          </div>
          <div className="wf-field">
            <label className="wf-label">Estimated Days of Work</label>
            <input type="number" min="1" className="wf-input" value={form.estimatedDays} onChange={e => handleChange('estimatedDays', parseInt(e.target.value) || 1)} disabled={isCompleted} />
          </div>
        </div>
      </div>

      {!isCompleted && (
        <motion.button
          className="wf-btn primary"
          style={{ width: '100%', justifyContent: 'center', marginTop: 8 }}
          onClick={handleSubmit}
          disabled={!isValid || saving}
          whileTap={{ scale: 0.98 }}
        >
          {saving ? 'Saving...' : 'Complete Job Order ✓'}
        </motion.button>
      )}

      {isCompleted && (
        <div style={{ textAlign: 'center', padding: 16, color: '#22c55e', fontSize: 13, fontWeight: 700 }}>
          ✓ Job Order completed on {order.jobOrder?.completedAt ? new Date(order.jobOrder.completedAt).toLocaleString() : 'record'}
        </div>
      )}
    </motion.div>
  );
}
